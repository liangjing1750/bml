from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

from blm_core.document import create_empty_document, migrate_document
from blm_core.markdown import MarkdownExporter


TRASH_FILE_RE = re.compile(r"^(?P<name>.+)-(?P<timestamp>\d{8}-\d{6}-\d{6})$")


class InvalidDocumentNameError(ValueError):
    """Raised when a workspace document name is unsafe."""


class InvalidDocumentPathError(ValueError):
    """Raised when a file path is missing or points to an invalid location."""


class InvalidWorkspaceEntryError(ValueError):
    """Raised when a workspace snapshot or trash entry is unsafe."""


class DocumentFileStore:
    def __init__(self, exporter: MarkdownExporter | None = None):
        self.exporter = exporter or MarkdownExporter()

    def load_raw_path(self, path: str | Path) -> dict:
        file_path = self._normalize_path(path)
        if not file_path.exists():
            raise FileNotFoundError(str(file_path))
        return json.loads(file_path.read_text("utf-8"))

    def load_path(self, path: str | Path) -> dict:
        return migrate_document(self.load_raw_path(path))

    def save_path(self, path: str | Path, document: dict) -> dict:
        file_path = self._normalize_path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        migrated_document = migrate_document(document)
        file_path.write_text(
            json.dumps(migrated_document, ensure_ascii=False, indent=2),
            "utf-8",
        )
        markdown_path = file_path.with_suffix(".md")
        markdown_path.write_text(self.exporter.export(migrated_document), "utf-8")
        return migrated_document

    def export_markdown_path(self, path: str | Path) -> str:
        return self.exporter.export(self.load_path(path))

    def _normalize_path(self, path: str | Path) -> Path:
        normalized = Path(str(path or "").strip())
        if not str(normalized):
            raise InvalidDocumentPathError("路径不能为空")
        if normalized.name in {".", ".."}:
            raise InvalidDocumentPathError("路径不合法")
        return normalized


class WorkspaceStorage(DocumentFileStore):
    def __init__(self, workspace_dir: Path, exporter: MarkdownExporter | None = None):
        super().__init__(exporter=exporter)
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir = self.workspace_dir / ".history"
        self.trash_dir = self.workspace_dir / ".trash"
        self.history_dir.mkdir(exist_ok=True)
        self.trash_dir.mkdir(exist_ok=True)
        self.history_limit = 20

    def list_documents(self) -> list[str]:
        return sorted(file_path.stem for file_path in self.workspace_dir.glob("*.json"))

    def list_history(self, name: str) -> list[dict]:
        safe_name = self._validate_name(name)
        target_dir = self.history_dir / safe_name
        if not target_dir.exists():
            return []
        return [
            {
                "id": snapshot.stem,
                "label": snapshot.stem,
                "doc_name": safe_name,
            }
            for snapshot in sorted(target_dir.glob("*.json"), reverse=True)
        ]

    def restore_history(self, name: str, snapshot_id: str) -> dict:
        safe_name = self._validate_name(name)
        snapshot_path = self._history_json_path(safe_name, snapshot_id)
        document = self.load_raw_path(snapshot_path)
        return self.save(safe_name, document)

    def list_trash(self) -> list[dict]:
        entries: list[dict] = []
        for file_path in sorted(self.trash_dir.glob("*.json"), reverse=True):
            original_name, timestamp = self._parse_trash_filename(file_path.name)
            entries.append(
                {
                    "id": file_path.name,
                    "label": f"{original_name} ({timestamp})",
                    "doc_name": original_name,
                    "timestamp": timestamp,
                }
            )
        return entries

    def restore_trash(self, entry_id: str) -> tuple[str, dict]:
        json_path = self._trash_json_path(entry_id)
        original_name, _ = self._parse_trash_filename(json_path.name)
        document = self.load_raw_path(json_path)
        restored_document = self.save(original_name, document)
        json_path.unlink(missing_ok=True)
        self._trash_markdown_path(json_path).unlink(missing_ok=True)
        return original_name, restored_document

    def load(self, name: str) -> dict:
        file_path = self._json_path(name)
        if not file_path.exists():
            raise FileNotFoundError(name)
        return self.load_path(file_path)

    def save(self, name: str, document: dict) -> dict:
        safe_name = self._validate_name(name)
        if self._json_path(safe_name).exists():
            self._snapshot_document(safe_name)
        return self.save_path(self._json_path(safe_name), document)

    def rename(
        self,
        old_name: str,
        new_name: str,
        document: dict,
        *,
        overwrite: bool = False,
    ) -> tuple[str, dict]:
        old_safe_name = self._validate_name(old_name)
        new_safe_name = self._validate_name(new_name)
        if old_safe_name == new_safe_name:
            return new_safe_name, self.save(new_safe_name, document)
        if self._json_path(new_safe_name).exists() and not overwrite:
            raise FileExistsError(new_safe_name)
        if overwrite and self._json_path(new_safe_name).exists():
            saved_document = self.save(new_safe_name, document)
        else:
            saved_document = self.save_path(self._json_path(new_safe_name), document)
        timestamp = self._timestamp()
        self._move_to_trash(self._json_path(old_safe_name), timestamp)
        self._move_to_trash(self._markdown_path(old_safe_name), timestamp)
        return new_safe_name, saved_document

    def create(self, name: str) -> dict:
        file_path = self._json_path(name)
        if file_path.exists():
            raise FileExistsError(name)
        document = create_empty_document(name)
        self.save(name, document)
        return document

    def delete(self, name: str) -> None:
        safe_name = self._validate_name(name)
        timestamp = self._timestamp()
        self._move_to_trash(self._json_path(safe_name), timestamp)
        self._move_to_trash(self._markdown_path(safe_name), timestamp)

    def export_markdown(self, name: str) -> str:
        return self.export_markdown_path(self._json_path(name))

    def _json_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.json"

    def _markdown_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.md"

    def _history_json_path(self, name: str, snapshot_id: str) -> Path:
        safe_snapshot_id = self._sanitize_workspace_entry(snapshot_id)
        path = self.history_dir / self._validate_name(name) / f"{safe_snapshot_id}.json"
        if not path.exists():
            raise FileNotFoundError(safe_snapshot_id)
        return path

    def _trash_json_path(self, entry_id: str) -> Path:
        safe_entry_id = self._sanitize_workspace_entry(entry_id)
        path = self.trash_dir / safe_entry_id
        if path.suffix != ".json" or not path.exists():
            raise FileNotFoundError(safe_entry_id)
        return path

    def _trash_markdown_path(self, json_path: Path) -> Path:
        return json_path.with_suffix(".md")

    def _validate_name(self, name: str) -> str:
        normalized = (name or "").strip()
        if not normalized:
            raise InvalidDocumentNameError("名称不能为空")
        if any(separator in normalized for separator in ("/", "\\")):
            raise InvalidDocumentNameError("名称不能包含路径分隔符")
        if normalized in {".", ".."}:
            raise InvalidDocumentNameError("名称不合法")
        return normalized

    def _sanitize_workspace_entry(self, entry: str) -> str:
        normalized = Path(str(entry or "").strip()).name
        if not normalized or normalized in {".", ".."}:
            raise InvalidWorkspaceEntryError("记录标识不合法")
        if normalized != str(entry or "").strip():
            raise InvalidWorkspaceEntryError("记录标识不合法")
        return normalized

    def _snapshot_document(self, name: str) -> None:
        timestamp = self._timestamp()
        target_dir = self.history_dir / name
        target_dir.mkdir(parents=True, exist_ok=True)
        self._copy_if_exists(self._json_path(name), target_dir / f"{timestamp}.json")
        self._copy_if_exists(self._markdown_path(name), target_dir / f"{timestamp}.md")
        self._trim_history(target_dir)

    def _move_to_trash(self, source: Path, timestamp: str) -> None:
        if not source.exists():
            return
        trash_name = f"{source.stem}-{timestamp}{source.suffix}"
        shutil.move(str(source), str(self.trash_dir / trash_name))

    def _copy_if_exists(self, source: Path, target: Path) -> None:
        if source.exists():
            shutil.copy2(source, target)

    def _trim_history(self, target_dir: Path) -> None:
        snapshots = sorted(target_dir.glob("*.json"))
        overflow = len(snapshots) - self.history_limit
        if overflow <= 0:
            return
        for snapshot in snapshots[:overflow]:
            snapshot.unlink(missing_ok=True)
            target_dir.joinpath(f"{snapshot.stem}.md").unlink(missing_ok=True)

    def _parse_trash_filename(self, file_name: str) -> tuple[str, str]:
        safe_file_name = self._sanitize_workspace_entry(file_name)
        match = TRASH_FILE_RE.match(Path(safe_file_name).stem)
        if not match:
            raise InvalidWorkspaceEntryError("回收站记录不合法")
        return match.group("name"), match.group("timestamp")

    def _timestamp(self) -> str:
        return datetime.now().strftime("%Y%m%d-%H%M%S-%f")
