import tempfile
import unittest
from pathlib import Path

from bml_core.document import create_empty_document, migrate_document
from bml_core.markdown import MarkdownExporter
from bml_core.storage import InvalidDocumentNameError, WorkspaceStorage


class CreateEmptyDocumentTests(unittest.TestCase):
    def test_create_empty_document_uses_name_for_title(self):
        document = create_empty_document("Inventory")

        self.assertEqual(document["meta"]["title"], "Inventory")
        self.assertEqual(document["meta"]["domain"], "")
        self.assertEqual(document["processes"][0]["id"], "P1")
        self.assertEqual(document["processes"][0]["tasks"], [])
        self.assertEqual(document["entities"], [])


class MigrateDocumentTests(unittest.TestCase):
    def test_migrate_document_converts_legacy_shapes_and_normalizes_values(self):
        legacy_document = {
            "meta": {"title": "Legacy", "bounded_context": "ignored"},
            "process": {
                "name": "Borrow",
                "trigger": "Reader request",
                "outcome": "Book borrowed",
                "tasks": [
                    {
                        "id": "T1",
                        "name": "Check reader",
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
        self.assertEqual(
            migrated["processes"][0]["tasks"][0]["steps"][0]["type"],
            "Check",
        )
        self.assertEqual(migrated["entities"][0]["fields"][0]["type"], "string")
        self.assertTrue(migrated["entities"][0]["fields"][0]["is_key"])
        self.assertFalse(migrated["entities"][0]["fields"][0]["is_status"])
        self.assertEqual(migrated["entities"][0]["fields"][1]["type"], "number")
        self.assertEqual(migrated["roles"], [])
        self.assertEqual(migrated["relations"], [])
        self.assertEqual(migrated["rules"], [])
        self.assertEqual(migrated["language"], [])


class MarkdownExporterTests(unittest.TestCase):
    def test_export_includes_process_mermaid_and_entity_tables(self):
        document = {
            "meta": {
                "title": "Library",
                "domain": "Library Domain",
                "author": "LJ",
                "date": "2026-04",
            },
            "roles": ["Reader"],
            "language": [{"term": "Borrow", "definition": "Borrow a book"}],
            "processes": [
                {
                    "id": "P1",
                    "name": "Borrow",
                    "trigger": "Reader wants a book",
                    "outcome": "Loan created",
                    "tasks": [
                        {
                            "id": "T1",
                            "name": "Check reader",
                            "role": "Reader",
                            "steps": [{"name": "Read quota", "type": "Query", "note": ""}],
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
                            "note": "",
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
        self.assertIn("```mermaid", markdown)
        self.assertIn("T1", markdown)
        self.assertIn("Reader", markdown)
        self.assertIn("reader_id", markdown)


class WorkspaceStorageTests(unittest.TestCase):
    def test_save_load_and_list_documents(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))
            document = create_empty_document("Loans")

            storage.save("Loans", document)

            self.assertEqual(storage.list_documents(), ["Loans"])
            loaded = storage.load("Loans")
            self.assertEqual(loaded["meta"]["title"], "Loans")
            self.assertTrue((Path(temp_dir) / "Loans.json").exists())
            self.assertTrue((Path(temp_dir) / "Loans.md").exists())

    def test_rejects_unsafe_document_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir))

            with self.assertRaises(InvalidDocumentNameError):
                storage.save("../secret", create_empty_document("secret"))

            with self.assertRaises(InvalidDocumentNameError):
                storage.load("nested/path")


if __name__ == "__main__":
    unittest.main()
