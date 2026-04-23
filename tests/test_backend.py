import http.server
import io
import json
import tempfile
import threading
import unittest
import urllib.request
import zipfile
from pathlib import Path

from blm_core.document import create_empty_document, migrate_document
from blm_core.markdown import MarkdownExporter
from blm_core.server import create_handler
from blm_core.storage import InvalidDocumentNameError, WorkspaceStorage


def package_dir(workspace: Path, name: str) -> Path:
    return workspace / name


def manifest_path(workspace: Path, name: str) -> Path:
    return package_dir(workspace, name) / "manifest.json"


def markdown_path(workspace: Path, name: str) -> Path:
    return package_dir(workspace, name) / f"{name}.md"


def attachment_index_path(workspace: Path, document_uid: str) -> Path:
    return workspace / ".attachments" / document_uid / "attachments.json"


def attachment_path(workspace: Path, document_uid: str, relative_path: str) -> Path:
    return workspace / ".attachments" / document_uid / relative_path


def attachment_files(workspace: Path, document_uid: str) -> list[Path]:
    root = workspace / ".attachments" / document_uid
    if not root.exists():
        return []
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.name != "attachments.json"
    )


def history_snapshot_dirs(workspace: Path, name: str) -> list[Path]:
    history_root = workspace / ".history" / name
    if not history_root.exists():
        return []
    return sorted(
        [path for path in history_root.iterdir() if path.is_dir()],
        key=lambda path: path.name,
    )


class CreateEmptyDocumentTests(unittest.TestCase):
    def test_create_empty_document_uses_name_for_title(self):
        document = create_empty_document("Inventory")

        self.assertEqual(document["meta"]["title"], "Inventory")
        self.assertEqual(document["meta"]["domain"], "")
        self.assertEqual(document["processes"][0]["id"], "P1")
        self.assertEqual(document["processes"][0]["flowGroup"], "")
        self.assertEqual(document["processes"][0]["prototypeFiles"], [])
        self.assertEqual(document["processes"][0]["nodes"], [])
        self.assertEqual(document["entities"], [])


class MigrateDocumentTests(unittest.TestCase):
    def test_migrate_document_converts_legacy_shapes_and_normalizes_values(self):
        legacy_document = {
            "meta": {"title": "Legacy", "bounded_context": "ignored"},
            "roles": ["仓库管理员"],
            "process": {
                "name": "Borrow",
                "subDomain": "仓储仓单管理",
                "trigger": "Reader request",
                "outcome": "Book borrowed",
                "tasks": [
                    {
                        "id": "T1",
                        "name": "Check reader",
                        "role": "仓库管理员",
                        "steps": [{"name": "Validate quota", "type": "Validate"}],
                        "entity_ops": [{"entity_id": "E1", "ops": ["R"]}],
                    }
                ],
            },
            "entities": [
                {
                    "id": "E1",
                    "name": "Reader",
                    "fields": [
                        {"name": "reader_id", "type": "String", "pk": True},
                        {"name": "borrow_count", "type": "Int"},
                    ],
                }
            ],
        }

        migrated = migrate_document(legacy_document)

        self.assertNotIn("process", migrated)
        self.assertNotIn("bounded_context", migrated["meta"])
        self.assertEqual(migrated["processes"][0]["id"], "P1")
        self.assertEqual(migrated["meta"]["schema_version"], 3)
        self.assertEqual(migrated["processes"][0]["flowGroup"], "")
        self.assertEqual(migrated["processes"][0]["nodes"][0]["userSteps"][0]["type"], "Check")
        self.assertEqual(migrated["processes"][0]["nodes"][0]["orchestrationTasks"], [])
        self.assertEqual(migrated["entities"][0]["fields"][0]["type"], "string")
        self.assertTrue(migrated["entities"][0]["fields"][0]["is_key"])
        self.assertFalse(migrated["entities"][0]["fields"][0]["is_status"])
        self.assertEqual(migrated["entities"][0]["fields"][1]["type"], "number")
        self.assertEqual(migrated["roles"][0]["name"], "仓库管理员")
        self.assertEqual(migrated["roles"][0]["group"], "仓库作业方")
        self.assertEqual(migrated["roles"][0]["subDomains"], ["仓储仓单管理"])
        self.assertNotIn("status", migrated["roles"][0])
        self.assertEqual(migrated["processes"][0]["nodes"][0]["role"], "仓库管理员")
        self.assertTrue(migrated["processes"][0]["nodes"][0]["role_id"])
        self.assertEqual(migrated["relations"], [])
        self.assertEqual(migrated["rules"], [])
        self.assertEqual(migrated["language"], [])

    def test_migrate_document_promotes_string_roles_to_role_objects_and_links_tasks(self):
        document = {
            "meta": {"title": "交割平台"},
            "roles": ["会员", {"id": "R9", "name": "监管员"}],
            "processes": [
                {
                    "id": "P1",
                    "name": "入库办理",
                    "subDomain": "仓储仓单管理",
                    "tasks": [
                        {"id": "T1", "name": "确认到货", "role": "会员"},
                        {"id": "T2", "name": "查库复核", "role_id": "R9"},
                    ],
                }
            ],
            "entities": [],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)

        self.assertEqual(len(migrated["roles"]), 2)
        self.assertEqual(migrated["roles"][0]["name"], "会员")
        self.assertEqual(migrated["roles"][0]["group"], "业务参与方")
        self.assertNotIn("status", migrated["roles"][0])
        self.assertEqual(migrated["roles"][1]["id"], "R9")
        self.assertNotIn("status", migrated["roles"][1])
        self.assertEqual(migrated["processes"][0]["nodes"][0]["role"], "会员")
        self.assertEqual(migrated["processes"][0]["nodes"][1]["role"], "监管员")
        self.assertEqual(migrated["processes"][0]["nodes"][1]["role_id"], "R9")

    def test_migrate_document_normalizes_multi_role_nodes(self):
        document = {
            "meta": {"title": "Multi roles"},
            "roles": [
                {"id": "R1", "name": "Maker"},
                {"id": "R2", "name": "Checker"},
            ],
            "processes": [
                {
                    "id": "P1",
                    "name": "Joint review",
                    "subDomain": "Operations",
                    "nodes": [
                        {
                            "id": "T1",
                            "name": "Review task",
                            "role_ids": ["R1", "R2"],
                            "role": "Maker, Checker",
                        }
                    ],
                }
            ],
            "entities": [],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)
        node = migrated["processes"][0]["nodes"][0]

        self.assertEqual(node["role_ids"], ["R1", "R2"])
        self.assertEqual(node["roles"], ["Maker", "Checker"])
        self.assertEqual(node["role_id"], "R1")
        self.assertEqual(node["role"], "Maker、Checker")
        self.assertEqual(migrated["roles"][0]["subDomains"], ["Operations"])
        self.assertEqual(migrated["roles"][1]["subDomains"], ["Operations"])

    def test_migrate_document_adds_state_flow_defaults_for_entities(self):
        document = {
            "meta": {"title": "状态流转"},
            "roles": [{"id": "R1", "name": "审核员"}],
            "processes": [],
            "entities": [
                {
                    "id": "E1",
                    "name": "预约单",
                    "fields": [
                        {"name": "预约状态", "type": "enum", "is_status": True},
                        {"name": "备注", "type": "text"},
                    ],
                    "state_transitions": [
                        {"from": "草稿", "to": "待审核", "action": "提交"}
                    ],
                }
            ],
            "relations": [],
            "rules": [],
            "language": [],
        }

        migrated = migrate_document(document)

        status_field = migrated["entities"][0]["fields"][0]
        note_field = migrated["entities"][0]["fields"][1]
        transition = migrated["entities"][0]["state_transitions"][0]

        self.assertEqual(status_field["state_values"], "")
        self.assertTrue(status_field["is_status"])
        self.assertEqual(note_field["state_values"], "")
        self.assertEqual(transition["from"], "草稿")
        self.assertEqual(transition["to"], "待审核")
        self.assertEqual(transition["action"], "提交")
        self.assertEqual(transition["note"], "")
        self.assertEqual(transition["field_name"], "预约状态")
        self.assertNotIn("role_id", transition)


class MarkdownExporterTests(unittest.TestCase):
    def test_export_includes_process_mermaid_and_entity_tables(self):
        document = {
            "meta": {
                "title": "Library",
                "domain": "Library Domain",
                "author": "LJ",
                "date": "2026-04",
            },
            "roles": [{"id": "R1", "name": "Reader"}],
            "language": [{"term": "Borrow", "definition": "Borrow a book"}],
            "processes": [
                {
                    "id": "P1",
                    "name": "Borrow",
                    "subDomain": "Circulation",
                    "flowGroup": "Borrow Management",
                    "trigger": "Reader wants a book",
                    "outcome": "Loan created",
                    "prototypeFiles": [
                        {"name": "borrow-form.html", "content": "<html><body>Borrow</body></html>"},
                        {"name": "quota-check.html", "content": "<html><body>Quota</body></html>"},
                    ],
                    "tasks": [
                        {
                            "id": "T1",
                            "name": "Check reader",
                            "role_id": "R1",
                            "steps": [{"name": "Read quota", "type": "Query", "note": ""}],
                            "orchestrationTasks": [
                                {
                                    "name": "Query reader quota",
                                    "type": "Query",
                                    "querySourceKind": "QueryService",
                                    "target": "ReaderQuotaService",
                                    "note": "Load current quota before submit",
                                }
                            ],
                            "entity_ops": [{"entity_id": "E1", "ops": ["R", "U"]}],
                            "rules_note": "Reader must be active",
                        }
                    ],
                }
            ],
            "entities": [
                {
                    "id": "E1",
                    "name": "Reader",
                    "group": "People",
                    "fields": [
                        {
                            "name": "reader_id",
                            "type": "id",
                            "is_key": True,
                            "is_status": False,
                            "state_values": "",
                            "note": "",
                        },
                        {
                            "name": "reader_status",
                            "type": "enum",
                            "is_key": False,
                            "is_status": True,
                            "state_values": "Draft/Active/Archived",
                            "note": "主状态字段",
                        },
                    ],
                    "state_transitions": [
                        {
                            "from": "Draft",
                            "to": "Active",
                            "action": "Activate",
                            "note": "Reader must be approved",
                        }
                    ],
                }
            ],
            "relations": [],
            "rules": [],
        }

        markdown = MarkdownExporter().export(document)

        self.assertIn("# Library", markdown)
        self.assertIn("P1: Borrow", markdown)
        self.assertIn("流程组", markdown)
        self.assertIn("Borrow Management", markdown)
        self.assertIn("borrow-form.html", markdown)
        self.assertIn("quota-check.html", markdown)
        self.assertIn("```mermaid", markdown)
        self.assertIn("T1", markdown)
        self.assertIn("Reader", markdown)
        self.assertIn("业务参与方", markdown)
        self.assertIn("用户操作步骤", markdown)
        self.assertIn("编排任务", markdown)
        self.assertIn("Query reader quota", markdown)
        self.assertIn("reader_id", markdown)
        self.assertIn("reader_status", markdown)
        self.assertIn("字段规则", markdown)
        self.assertIn("Draft/Active/Archived", markdown)
        self.assertIn("状态流转", markdown)
        self.assertIn("Activate", markdown)


class WorkspaceStorageTests(unittest.TestCase):
    def test_save_load_and_list_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)

            self.assertEqual(storage.list_documents(), ["Loans"])
            loaded = storage.load("Loans")
            self.assertEqual(loaded["meta"]["title"], "Loans")
            self.assertTrue(manifest_path(workspace, "Loans").exists())
            self.assertTrue(markdown_path(workspace, "Loans").exists())

    def test_save_stores_process_prototypes_as_package_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                },
                {
                    "uid": "proto-b",
                    "name": "quota-check.html",
                    "content": "<html><body>quota</body></html>",
                    "contentType": "text/html",
                },
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entries = manifest["processes"][0]["prototypeFiles"]
            self.assertEqual(len(prototype_entries), 2)
            self.assertNotIn("content", prototype_entries[0])
            self.assertNotIn("name", prototype_entries[0])
            self.assertIn("uid", prototype_entries[0])
            self.assertIn("versionUid", prototype_entries[0])
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            self.assertEqual(len(attachment_index["attachments"]), 2)
            first_attachment = attachment_index["attachments"][0]
            self.assertEqual(first_attachment["name"], "borrow-form.html")
            self.assertTrue(
                attachment_path(
                    workspace,
                    manifest["meta"]["document_uid"],
                    first_attachment["versions"][0]["path"],
                ).exists()
            )

            loaded = storage.load("Loans")
            self.assertEqual(
                [item["content"] for item in loaded["processes"][0]["prototypeFiles"]],
                [
                    "<html><body>borrow</body></html>",
                    "<html><body>quota</body></html>",
                ],
            )
            self.assertEqual(loaded["processes"][0]["prototypeFiles"][0]["versions"][0]["number"], 1)
            self.assertTrue(loaded["processes"][0]["prototypeFiles"][0]["versions"][0]["uploadedAt"])

    def test_build_export_bundle_outputs_zip_package_with_prototypes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                }
            ]
            storage.save("Loans", document)

            filename, payload = storage.build_export_bundle("Loans")

            self.assertEqual(filename, "Loans.zip")
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                names = sorted(archive.namelist())
                self.assertIn("Loans/manifest.json", names)
                self.assertIn("Loans/Loans.md", names)
                self.assertIn("Loans/attachments/attachments.json", names)
                manifest = json.loads(archive.read("Loans/manifest.json").decode("utf-8"))
                prototype_entry = manifest["processes"][0]["prototypeFiles"][0]
                self.assertNotIn("content", prototype_entry)
                self.assertEqual(prototype_entry["uid"], "proto-a")
                self.assertTrue(prototype_entry["versionUid"])
                attachment_index = json.loads(archive.read("Loans/attachments/attachments.json").decode("utf-8"))
                attachment_entry = attachment_index["attachments"][0]
                self.assertEqual(attachment_entry["name"], "borrow-form.html")
                self.assertRegex(
                    attachment_entry["versions"][0]["path"],
                    r"^attachments/[^/]+/v1__borrow-form\.html$",
                )
                self.assertIn(f"Loans/{attachment_entry['versions'][0]['path']}", names)
                self.assertEqual(
                    archive.read(f"Loans/{attachment_entry['versions'][0]['path']}").decode("utf-8"),
                    "<html><body>borrow</body></html>",
                )

    def test_save_stores_attachment_versions_and_current_version_ref(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "versionUid": "proto-a-v2",
                    "versions": [
                        {
                            "uid": "proto-a-v1",
                            "number": 1,
                            "name": "borrow-form.html",
                            "content": "<html><body>v1</body></html>",
                            "contentType": "text/html",
                            "uploadedAt": "2026-04-23 10:00:00",
                        },
                        {
                            "uid": "proto-a-v2",
                            "number": 2,
                            "name": "borrow-form.html",
                            "content": "<html><body>v2</body></html>",
                            "contentType": "text/html",
                            "uploadedAt": "2026-04-23 10:05:00",
                        },
                    ],
                },
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entries = manifest["processes"][0]["prototypeFiles"]
            self.assertEqual(len(prototype_entries), 1)
            self.assertEqual(prototype_entries[0]["uid"], "proto-a")
            self.assertEqual(prototype_entries[0]["versionUid"], "proto-a-v2")
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            attachment_versions = attachment_index["attachments"][0]["versions"]
            self.assertEqual(
                [version["uid"] for version in attachment_versions],
                ["proto-a-v1", "proto-a-v2"],
            )
            self.assertEqual(
                [path.name for path in attachment_files(workspace, manifest["meta"]["document_uid"])],
                ["v1__borrow-form.html", "v2__borrow-form.html"],
            )

    def _legacy_save_preserves_unicode_attachment_filename(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "入库查询（客户、交易所）.html",
                    "content": "<html><body>unicode</body></html>",
                    "contentType": "text/html",
                }
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entry = manifest["processes"][0]["prototypeFiles"][0]
            self.assertEqual(prototype_entry["attachmentKey"], "入库查询（客户、交易所）.html")
            self.assertTrue(
                attachment_path(
                    workspace,
                    manifest["meta"]["document_uid"],
                    prototype_entry["attachmentKey"],
                ).exists()
            )

    def test_save_preserves_unicode_attachment_filename_v2(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "入库查询（客户、交易所）.html",
                    "content": "<html><body>unicode</body></html>",
                    "contentType": "text/html",
                }
            ]

            storage.save("Loans", document)

            manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            prototype_entry = manifest["processes"][0]["prototypeFiles"][0]
            attachment_index = json.loads(
                attachment_index_path(workspace, manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            version_path = attachment_index["attachments"][0]["versions"][0]["path"]
            self.assertEqual(prototype_entry["uid"], "proto-a")
            self.assertTrue(version_path.endswith("入库查询（客户、交易所）.html"))
            self.assertTrue(
                attachment_path(
                    workspace,
                    manifest["meta"]["document_uid"],
                    version_path,
                ).exists()
            )

    def test_history_versions_reuse_single_attachment_file_when_prototype_is_unchanged(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                }
            ]

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            current_manifest = json.loads(manifest_path(workspace, "Loans").read_text("utf-8"))
            history_manifest = json.loads(
                (history_snapshot_dirs(workspace, "Loans")[0] / "manifest.json").read_text("utf-8")
            )
            current_ref = current_manifest["processes"][0]["prototypeFiles"][0]
            history_ref = history_manifest["processes"][0]["prototypeFiles"][0]

            self.assertEqual(current_ref, history_ref)
            saved_files = attachment_files(workspace, current_manifest["meta"]["document_uid"])
            self.assertEqual(len(saved_files), 1)
            self.assertEqual(saved_files[0].name, "v1__borrow-form.html")

    def test_migrate_workspace_layout_converts_legacy_documents_history_and_trash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_document = create_empty_document("Legacy")
            legacy_document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "legacy.html",
                    "content": "<html><body>legacy</body></html>",
                    "contentType": "text/html",
                }
            ]
            (workspace / "Legacy.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (workspace / "Legacy.md").write_text("# Legacy\n", "utf-8")
            history_dir = workspace / ".history" / "Legacy"
            history_dir.mkdir(parents=True, exist_ok=True)
            (history_dir / "20260423-120000-000001.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (history_dir / "20260423-120000-000001.md").write_text("# Legacy\n", "utf-8")
            (workspace / ".trash" / "Legacy-20260423-120100-000001.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (workspace / ".trash" / "Legacy-20260423-120100-000001.md").write_text("# Legacy\n", "utf-8")

            result = storage.migrate_workspace_layout()

            self.assertEqual(result, {"documents": 1, "history": 1, "trash": 1})
            self.assertTrue(manifest_path(workspace, "Legacy").exists())
            self.assertFalse((workspace / "Legacy.json").exists())
            migrated_manifest = json.loads(manifest_path(workspace, "Legacy").read_text("utf-8"))
            migrated_index = json.loads(
                attachment_index_path(workspace, migrated_manifest["meta"]["document_uid"]).read_text("utf-8")
            )
            migrated_path = migrated_index["attachments"][0]["versions"][0]["path"]
            self.assertTrue(attachment_path(workspace, migrated_manifest["meta"]["document_uid"], migrated_path).exists())
            self.assertTrue((workspace / ".history" / "Legacy" / "20260423-120000-000001" / "manifest.json").exists())
            self.assertFalse((history_dir / "20260423-120000-000001.json").exists())
            self.assertTrue((workspace / ".trash" / "Legacy-20260423-120100-000001" / "manifest.json").exists())
            self.assertFalse((workspace / ".trash" / "Legacy-20260423-120100-000001.json").exists())

    def test_rejects_unsafe_document_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))

            with self.assertRaises(InvalidDocumentNameError):
                storage.save("../secret", create_empty_document("secret"))

            with self.assertRaises(InvalidDocumentNameError):
                storage.load("nested/path")

    def test_save_existing_document_creates_history_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            snapshots = history_snapshot_dirs(workspace, "Loans")

            self.assertEqual(len(snapshots), 1)
            self.assertTrue((snapshots[0] / "Loans.md").exists())
            snapshot_document = json.loads((snapshots[0] / "manifest.json").read_text("utf-8"))
            self.assertEqual(snapshot_document["meta"]["title"], "Loans")
            self.assertEqual(storage.load("Loans")["meta"]["title"], "Loans v2")

    def test_delete_moves_document_to_trash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.save("Loans", create_empty_document("Loans"))

            storage.delete("Loans")

            self.assertFalse(manifest_path(workspace, "Loans").exists())
            self.assertFalse(markdown_path(workspace, "Loans").exists())
            trash_dirs = sorted(path for path in (workspace / ".trash").glob("Loans-*") if path.is_dir())
            self.assertEqual(len(trash_dirs), 1)
            self.assertTrue((trash_dirs[0] / "manifest.json").exists())
            self.assertTrue((trash_dirs[0] / "Loans.md").exists())

    def test_history_keeps_recent_snapshots_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.history_limit = 3
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            for version in range(1, 6):
                document["meta"]["title"] = f"Loans v{version}"
                storage.save("Loans", document)

            snapshots = history_snapshot_dirs(workspace, "Loans")

            self.assertEqual(len(snapshots), 3)
            self.assertEqual(
                [json.loads((path / "manifest.json").read_text("utf-8"))["meta"]["title"] for path in snapshots],
                ["Loans v2", "Loans v3", "Loans v4"],
            )

    def test_list_and_restore_history_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("Loans")

            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            history_entries = storage.list_history("Loans")
            self.assertEqual(len(history_entries), 1)

            restored = storage.restore_history("Loans", history_entries[0]["id"])
            self.assertEqual(restored["meta"]["title"], "Loans")
            self.assertEqual(storage.load("Loans")["meta"]["title"], "Loans")

    def test_list_and_restore_trash_entry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            storage.save("Loans", create_empty_document("Loans"))
            storage.delete("Loans")

            trash_entries = storage.list_trash()
            self.assertEqual(len(trash_entries), 1)
            restored_name, restored_document = storage.restore_trash(trash_entries[0]["id"])

            self.assertEqual(restored_name, "Loans")
            self.assertEqual(restored_document["meta"]["title"], "Loans")
            self.assertTrue(manifest_path(workspace, "Loans").exists())
            self.assertEqual(storage.list_trash(), [])

    def test_rename_moves_old_workspace_document_to_trash(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            document = create_empty_document("交割智慧监管平台-合并")
            document["meta"]["domain"] = "交割智慧监管平台"
            document["meta"]["title"] = "交割智慧监管平台"
            storage.save("交割智慧监管平台-合并", create_empty_document("交割智慧监管平台-合并"))

            renamed_name, renamed_document = storage.rename(
                "交割智慧监管平台-合并",
                "交割智慧监管平台",
                document,
            )

            self.assertEqual(renamed_name, "交割智慧监管平台")
            self.assertEqual(renamed_document["meta"]["title"], "交割智慧监管平台")
            self.assertEqual(renamed_document["meta"]["domain"], "交割智慧监管平台")
            self.assertFalse(manifest_path(workspace, "交割智慧监管平台-合并").exists())
            self.assertTrue(manifest_path(workspace, "交割智慧监管平台").exists())
            self.assertTrue(any(entry["doc_name"] == "交割智慧监管平台-合并" for entry in storage.list_trash()))

    def test_rename_can_overwrite_existing_document_when_explicitly_allowed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            source = create_empty_document("交割智慧监管平台-合并")
            source["meta"]["domain"] = "交割智慧监管平台"
            source["meta"]["title"] = "交割智慧监管平台"
            target = create_empty_document("交割智慧监管平台")
            target["meta"]["author"] = "legacy"

            storage.save("交割智慧监管平台-合并", source)
            storage.save("交割智慧监管平台", target)

            renamed_name, renamed_document = storage.rename(
                "交割智慧监管平台-合并",
                "交割智慧监管平台",
                source,
                overwrite=True,
            )

            self.assertEqual(renamed_name, "交割智慧监管平台")
            self.assertEqual(renamed_document["meta"]["title"], "交割智慧监管平台")
            self.assertFalse(manifest_path(workspace, "交割智慧监管平台-合并").exists())
            self.assertEqual(storage.load("交割智慧监管平台")["meta"]["title"], "交割智慧监管平台")
            history_entries = storage.list_history("交割智慧监管平台")
            self.assertEqual(len(history_entries), 1)
            history_snapshot = storage.restore_history("交割智慧监管平台", history_entries[0]["id"])
            self.assertEqual(history_snapshot["meta"]["author"], "legacy")

    def test_save_upgrades_legacy_workspace_document_to_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_document = create_empty_document("Legacy")
            (workspace / "Legacy.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )
            (workspace / "Legacy.md").write_text("# Legacy\n", "utf-8")

            storage.save("Legacy", legacy_document)

            self.assertFalse((workspace / "Legacy.json").exists())
            self.assertFalse((workspace / "Legacy.md").exists())
            self.assertTrue(manifest_path(workspace, "Legacy").exists())
            self.assertTrue(markdown_path(workspace, "Legacy").exists())

    def test_list_documents_and_load_support_legacy_workspace_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            storage = WorkspaceStorage(workspace)
            legacy_document = create_empty_document("Legacy")
            (workspace / "Legacy.json").write_text(
                json.dumps(legacy_document, ensure_ascii=False, indent=2),
                "utf-8",
            )

            self.assertEqual(storage.list_documents(), ["Legacy"])
            self.assertEqual(storage.load("Legacy")["meta"]["title"], "Legacy")


class MergeApiTests(unittest.TestCase):
    def test_document_normalize_returns_migrated_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps(
                {
                    "document": {
                        "meta": {"title": "Local"},
                        "roles": [{"name": "审核员"}],
                        "processes": [],
                        "entities": [],
                        "relations": [],
                        "rules": [],
                        "language": [],
                    }
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/document/normalize",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertTrue(result["document"]["meta"]["document_uid"])
        self.assertEqual(result["document"]["meta"]["schema_version"], 3)
        self.assertTrue(result["document"]["roles"][0]["uid"])
        self.assertEqual(result["document"]["processes"], [])

    def test_merge_analyze_accepts_inline_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            left = create_empty_document("Supply")
            left["roles"].append(
                {
                    "id": "R1",
                    "name": "仓库主管",
                    "desc": "",
                    "group": "业务参与方",
                    "subDomains": ["仓储"],
                }
            )
            right = create_empty_document("Supply")
            right["entities"].append(
                {
                    "id": "E1",
                    "name": "出库单",
                    "group": "仓储",
                    "note": "",
                    "fields": [{"name": "单号", "type": "string", "is_key": True, "is_status": False}],
                    "state_transitions": [],
                }
            )

            payload = json.dumps(
                {
                    "mode": "combine",
                    "left_document": left,
                    "right_document": right,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/merge/analyze",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["conflicts"], [])
        self.assertEqual(len(result["merged_document"]["roles"]), 1)
        self.assertEqual(len(result["merged_document"]["entities"]), 1)

    def test_rename_api_keeps_workspace_name_aligned_with_domain(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save("交割智慧监管平台-合并", create_empty_document("交割智慧监管平台-合并"))
            document = storage.load("交割智慧监管平台-合并")
            document["meta"]["domain"] = "交割智慧监管平台"
            document["meta"]["title"] = "交割智慧监管平台"

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps(
                {
                    "old_name": "交割智慧监管平台-合并",
                    "new_name": "交割智慧监管平台",
                    "document": document,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/rename",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["name"], "交割智慧监管平台")
        self.assertEqual(result["document"]["meta"]["title"], "交割智慧监管平台")
        self.assertEqual(result["document"]["meta"]["domain"], "交割智慧监管平台")

    def test_rename_api_can_overwrite_existing_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save("交割智慧监管平台-合并", create_empty_document("交割智慧监管平台-合并"))
            existing = create_empty_document("交割智慧监管平台")
            existing["meta"]["author"] = "existing"
            storage.save("交割智慧监管平台", existing)

            document = storage.load("交割智慧监管平台-合并")
            document["meta"]["domain"] = "交割智慧监管平台"
            document["meta"]["title"] = "交割智慧监管平台"

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps(
                {
                    "old_name": "交割智慧监管平台-合并",
                    "new_name": "交割智慧监管平台",
                    "document": document,
                    "overwrite": True,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/rename",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["name"], "交割智慧监管平台")
        self.assertEqual(result["document"]["meta"]["title"], "交割智慧监管平台")


class RecoveryApiTests(unittest.TestCase):
    def test_history_api_lists_snapshots(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            document = create_empty_document("Loans")
            storage.save("Loans", document)
            document["meta"]["title"] = "Loans v2"
            storage.save("Loans", document)

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/history/Loans"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["doc_name"], "Loans")

    def test_trash_restore_api_restores_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            storage.save("Loans", create_empty_document("Loans"))
            storage.delete("Loans")
            trash_entry = storage.list_trash()[0]["id"]

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            payload = json.dumps({"entry_id": trash_entry}).encode("utf-8")
            request = urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/trash/restore",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(request) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertTrue(result["ok"])
        self.assertEqual(result["name"], "Loans")
        self.assertEqual(result["document"]["meta"]["title"], "Loans")


class ExportApiTests(unittest.TestCase):
    def test_export_bundle_api_returns_zip_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            document = create_empty_document("Loans")
            document["processes"][0]["prototypeFiles"] = [
                {
                    "uid": "proto-a",
                    "name": "borrow-form.html",
                    "content": "<html><body>borrow</body></html>",
                    "contentType": "text/html",
                }
            ]
            storage.save("Loans", document)

            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/export-bundle/Loans"
                ) as response:
                    payload = response.read()
                    content_type = response.headers.get("Content-Type")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(content_type, "application/zip")
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            names = sorted(archive.namelist())
            self.assertIn("Loans/manifest.json", names)
            self.assertIn("Loans/Loans.md", names)
            self.assertIn("Loans/attachments/attachments.json", names)
            manifest = json.loads(archive.read("Loans/manifest.json").decode("utf-8"))
            prototype = manifest["processes"][0]["prototypeFiles"][0]
            self.assertEqual(prototype["uid"], "proto-a")
            self.assertTrue(prototype["versionUid"])
            attachment_index = json.loads(archive.read("Loans/attachments/attachments.json").decode("utf-8"))
            version_path = attachment_index["attachments"][0]["versions"][0]["path"]
            self.assertRegex(version_path, r"^attachments/[^/]+/v1__borrow-form\.html$")
            self.assertIn(f"Loans/{version_path}", names)
            self.assertEqual(
                archive.read(f"Loans/{version_path}").decode("utf-8"),
                "<html><body>borrow</body></html>",
            )


class DocsApiTests(unittest.TestCase):
    def test_runtime_api_exposes_docs_capability(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/runtime"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(result["api_version"], 2)
        self.assertTrue(result["supports_docs"])
        self.assertEqual(result["mode"], "browser")

    def test_docs_api_lists_builtin_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/docs"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(
            [item["id"] for item in result],
            ["design", "test-cases", "user-manual"],
        )
        self.assertTrue(all(item["title"] for item in result))

    def test_docs_api_returns_markdown_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/docs/user-manual"
                ) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(result["id"], "user-manual")
        self.assertEqual(result["title"], "用户手册")
        self.assertIn("screenshots/05_open_dialog.png", result["content"])

    def test_docs_asset_api_returns_screenshot_binary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir) / "workspace"
            workspace_dir.mkdir()
            storage = WorkspaceStorage(workspace_dir)
            app_dir = Path(__file__).resolve().parent.parent / "app"
            handler = create_handler(app_dir, storage)
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/api/docs/assets/screenshots/05_open_dialog.png"
                ) as response:
                    body = response.read()
                    content_type = response.headers.get_content_type()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

        self.assertEqual(content_type, "image/png")
        self.assertGreater(len(body), 0)


if __name__ == "__main__":
    unittest.main()
