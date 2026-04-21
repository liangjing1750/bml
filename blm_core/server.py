from __future__ import annotations

import http.server
import json
import threading
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlparse

from blm_core.document import migrate_document
from blm_core.merge import analyze_merge, apply_merge
from blm_core.storage import (
    InvalidDocumentNameError,
    InvalidWorkspaceEntryError,
    WorkspaceStorage,
)


def create_handler(app_dir: Path, storage: WorkspaceStorage):
    class BlmRequestHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(app_dir), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            super().end_headers()

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/runtime":
                return self._json(
                    {
                        "mode": "browser",
                        "supports_workspace": True,
                        "supports_merge": True,
                    }
                )
            if path == "/api/files":
                return self._json(storage.list_documents())
            if path == "/api/trash":
                return self._json(storage.list_trash())
            if path.startswith("/api/load/"):
                return self._handle_load(path)
            if path.startswith("/api/export/"):
                return self._handle_export(path)
            if path.startswith("/api/history/"):
                return self._handle_history(path)
            return super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

            if path.startswith("/api/save/"):
                return self._handle_save(path, body)
            if path == "/api/rename":
                return self._handle_rename(body)
            if path == "/api/new":
                return self._handle_new(body)
            if path.startswith("/api/delete/"):
                return self._handle_delete(path)
            if path == "/api/history/restore":
                return self._handle_history_restore(body)
            if path == "/api/trash/restore":
                return self._handle_trash_restore(body)
            if path == "/api/document/normalize":
                return self._handle_document_normalize(body)
            if path == "/api/merge/analyze":
                return self._handle_merge_analyze(body)
            if path == "/api/merge/apply":
                return self._handle_merge_apply(body)

            return self._json({"error": "not found"}, 404)

        def log_message(self, *_):
            pass

        def _handle_load(self, path: str):
            name = unquote(path[len("/api/load/"):])
            try:
                return self._json(storage.load(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_export(self, path: str):
            name = unquote(path[len("/api/export/"):])
            try:
                return self._text(storage.export_markdown(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_history(self, path: str):
            name = unquote(path[len("/api/history/"):])
            try:
                return self._json(storage.list_history(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_save(self, path: str, body: bytes):
            name = unquote(path[len("/api/save/"):])
            try:
                document = json.loads(body or b"{}")
                saved_document = storage.save(name, document)
                return self._json({"ok": True, "document": saved_document, "name": name})
            except json.JSONDecodeError:
                return self._json({"error": "invalid json"}, 400)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_rename(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                new_name, saved_document = storage.rename(
                    str(payload.get("old_name", "")).strip(),
                    str(payload.get("new_name", "")).strip(),
                    payload.get("document", {}),
                    overwrite=bool(payload.get("overwrite")),
                )
                return self._json({"ok": True, "document": saved_document, "name": new_name})
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "已存在同名文档"}, 400)

        def _handle_new(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])

            name = str(payload.get("name", "")).strip()
            if not name:
                return self._json({"error": "名称不能为空"}, 400)
            try:
                document = storage.create(name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "已存在同名文档"}, 400)
            return self._json({"ok": True, "document": document, "name": name})

        def _handle_delete(self, path: str):
            name = unquote(path[len("/api/delete/"):])
            try:
                storage.delete(name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True})

        def _handle_history_restore(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                restored_document = storage.restore_history(
                    str(payload.get("name", "")).strip(),
                    str(payload.get("snapshot_id", "")).strip(),
                )
            except (InvalidDocumentNameError, InvalidWorkspaceEntryError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            return self._json(
                {
                    "ok": True,
                    "name": str(payload.get("name", "")).strip(),
                    "document": restored_document,
                }
            )

        def _handle_trash_restore(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                restored_name, restored_document = storage.restore_trash(
                    str(payload.get("entry_id", "")).strip()
                )
            except (InvalidWorkspaceEntryError, InvalidDocumentNameError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            return self._json(
                {
                    "ok": True,
                    "name": restored_name,
                    "document": restored_document,
                }
            )

        def _handle_document_normalize(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            document = payload.get("document", {})
            return self._json({"ok": True, "document": migrate_document(document)})

        def _handle_merge_analyze(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                result = analyze_merge(
                    payload.get("mode") or "combine",
                    left_document=self._load_merge_document(payload, "left"),
                    right_document=self._load_merge_document(payload, "right"),
                    base_document=self._load_merge_document(payload, "base")
                    if self._has_merge_source(payload, "base")
                    else None,
                )
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True, **result})

        def _handle_merge_apply(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                result = apply_merge(
                    payload.get("mode") or "combine",
                    left_document=self._load_merge_document(payload, "left"),
                    right_document=self._load_merge_document(payload, "right"),
                    base_document=self._load_merge_document(payload, "base")
                    if self._has_merge_source(payload, "base")
                    else None,
                    resolutions=payload.get("resolutions", {}),
                )
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True, **result})

        def _has_merge_source(self, payload: dict, key_prefix: str) -> bool:
            return isinstance(payload.get(f"{key_prefix}_document"), dict)

        def _load_merge_document(self, payload: dict, key_prefix: str) -> dict:
            inline_document = payload.get(f"{key_prefix}_document")
            if isinstance(inline_document, dict):
                return inline_document
            raise ValueError("缺少合并文档内容")

        def _decode_json(self, body: bytes) -> dict | tuple[dict, int]:
            try:
                return json.loads(body or b"{}")
            except json.JSONDecodeError:
                return {"error": "invalid json"}, 400

        def _json(self, payload, code: int = 200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _text(self, payload: str, code: int = 200):
            body = payload.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return BlmRequestHandler


def run_server(
    port: int,
    app_dir: Path,
    workspace_dir: Path,
    open_browser: bool = True,
) -> None:
    storage = WorkspaceStorage(workspace_dir)
    handler = create_handler(app_dir, storage)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}"

    print(f"BLM Tool 已启动: {url}")
    print(f"文档目录: {workspace_dir}")
    print("按 Ctrl+C 退出\n")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出")
