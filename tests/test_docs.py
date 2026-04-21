import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"


class DocumentationTests(unittest.TestCase):
    def test_required_docs_exist(self):
        self.assertTrue((DOCS_DIR / "BLM设计文档.md").exists())
        self.assertTrue((DOCS_DIR / "BLM测试用例.md").exists())
        self.assertTrue((DOCS_DIR / "BLM用户手册.md").exists())

    def test_design_doc_covers_current_architecture(self):
        content = (DOCS_DIR / "BLM设计文档.md").read_text("utf-8")
        self.assertIn("# BLM设计文档", content)
        self.assertIn("浏览器版工作区文档流", content)
        self.assertIn("合并能力", content)
        self.assertIn("回收站", content)
        self.assertIn("历史快照", content)

    def test_test_case_doc_covers_core_regressions(self):
        content = (DOCS_DIR / "BLM测试用例.md").read_text("utf-8")
        self.assertIn("# BLM测试用例", content)
        self.assertIn("打开文档", content)
        self.assertIn("确认合并", content)
        self.assertIn("回收站恢复", content)
        self.assertIn("未保存修改保护", content)

    def test_user_manual_covers_main_user_actions(self):
        content = (DOCS_DIR / "BLM用户手册.md").read_text("utf-8")
        self.assertIn("# BLM用户手册", content)
        self.assertIn("新建文档", content)
        self.assertIn("打开文档", content)
        self.assertIn("复制文档", content)
        self.assertIn("合并文档", content)
        self.assertIn("回收站", content)


if __name__ == "__main__":
    unittest.main()
