from __future__ import annotations

import json
from pathlib import Path

from bml_core.document import create_empty_document, migrate_document
from bml_core.markdown import MarkdownExporter


class InvalidDocumentNameError(ValueError):
    """Raised when a workspace document name is unsafe."""


class WorkspaceStorage:
    def __init__(self, workspace_dir: Path, exporter: MarkdownExporter | None = None):
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(exist_ok=True)
        self.exporter = exporter or MarkdownExporter()

    def list_documents(self) -> list[str]:
        return sorted(file_path.stem for file_path in self.workspace_dir.glob("*.json"))

    def load(self, name: str) -> dict:
        file_path = self._json_path(name)
        if not file_path.exists():
            raise FileNotFoundError(name)
        return migrate_document(json.loads(file_path.read_text("utf-8")))

    def save(self, name: str, document: dict) -> dict:
        migrated_document = migrate_document(document)
        self._json_path(name).write_text(
            json.dumps(migrated_document, ensure_ascii=False, indent=2),
            "utf-8",
        )
        self._markdown_path(name).write_text(self.exporter.export(migrated_document), "utf-8")
        return migrated_document

    def create(self, name: str) -> dict:
        file_path = self._json_path(name)
        if file_path.exists():
            raise FileExistsError(name)
        document = create_empty_document(name)
        self.save(name, document)
        return document

    def delete(self, name: str) -> None:
        self._json_path(name).unlink(missing_ok=True)
        self._markdown_path(name).unlink(missing_ok=True)

    def export_markdown(self, name: str) -> str:
        return self.exporter.export(self.load(name))

    def _json_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.json"

    def _markdown_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.md"

    def _validate_name(self, name: str) -> str:
        normalized = (name or "").strip()
        if not normalized:
            raise InvalidDocumentNameError("名称不能为空")
        if any(separator in normalized for separator in ("/", "\\")):
            raise InvalidDocumentNameError("名称不能包含路径分隔符")
        if normalized in {".", ".."}:
            raise InvalidDocumentNameError("名称不合法")
        return normalized

