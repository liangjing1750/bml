from __future__ import annotations

import http.server
import json
import threading
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlparse

from bml_core.storage import InvalidDocumentNameError, WorkspaceStorage


def create_handler(app_dir: Path, storage: WorkspaceStorage):
    class BlmRequestHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(app_dir), **kwargs)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/files":
                return self._json(storage.list_documents())
            if path.startswith("/api/load/"):
                return self._handle_load(path)
            if path.startswith("/api/export/"):
                return self._handle_export(path)
            return super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

            if path.startswith("/api/save/"):
                return self._handle_save(path, body)
            if path == "/api/new":
                return self._handle_new(body)
            if path.startswith("/api/delete/"):
                return self._handle_delete(path)

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

        def _handle_save(self, path: str, body: bytes):
            name = unquote(path[len("/api/save/"):])
            try:
                document = json.loads(body or b"{}")
                storage.save(name, document)
                return self._json({"ok": True})
            except json.JSONDecodeError:
                return self._json({"error": "invalid json"}, 400)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_new(self, body: bytes):
            try:
                payload = json.loads(body or b"{}")
            except json.JSONDecodeError:
                return self._json({"error": "invalid json"}, 400)

            name = (payload.get("name") or "").strip()
            if not name:
                return self._json({"error": "名称不能为空"}, 400)
            try:
                storage.create(name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "已存在同名文档"}, 400)
            return self._json({"ok": True})

        def _handle_delete(self, path: str):
            name = unquote(path[len("/api/delete/"):])
            try:
                storage.delete(name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True})

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


def run_server(port: int, app_dir: Path, workspace_dir: Path, open_browser: bool = True) -> None:
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
