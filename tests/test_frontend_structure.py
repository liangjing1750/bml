import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"

EXPECTED_SCRIPTS = [
    "state.js",
    "api.js",
    "render.js",
    "domain.js",
    "process.js",
    "entity.js",
    "preview.js",
    "app.js",
]


class FrontendStructureTests(unittest.TestCase):
    def test_split_scripts_exist(self):
        for script_name in EXPECTED_SCRIPTS:
            self.assertTrue((APP_DIR / script_name).exists(), f"{script_name} 不存在")

    def test_split_scripts_pass_node_syntax_check(self):
        for script_name in EXPECTED_SCRIPTS:
            script_path = APP_DIR / script_name
            result = subprocess.run(
                ["node", "--check", str(script_path)],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            self.assertEqual(
                result.returncode,
                0,
                f"{script_name} 语法检查失败: {result.stderr}",
            )

    def test_index_html_references_split_scripts_in_order(self):
        html = (APP_DIR / "index.html").read_text("utf-8")
        self.assertIn("<title>BLM - Business Language Modeling</title>", html)
        self.assertIn('<span class="logo">BLM</span>', html)
        previous_position = -1
        for script_name in EXPECTED_SCRIPTS:
            marker = f'<script src="{script_name}"></script>'
            position = html.find(marker)
            self.assertNotEqual(position, -1, f"index.html 未加载 {script_name}")
            self.assertGreater(position, previous_position, f"{script_name} 加载顺序不正确")
            previous_position = position


if __name__ == "__main__":
    unittest.main()
