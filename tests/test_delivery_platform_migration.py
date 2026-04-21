import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = ROOT / "tools" / "migrations" / "migrate_delivery_platform_v2.py"
PROMPT_PATH = ROOT / "docs" / "prompts" / "BLM版本迁移.md"


def load_migration_module():
    spec = importlib.util.spec_from_file_location("delivery_platform_v2_migration", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class DeliveryPlatformMigrationTests(unittest.TestCase):
    def test_prompt_doc_exists_and_covers_new_schema(self):
        self.assertTrue(PROMPT_PATH.exists())
        content = PROMPT_PATH.read_text("utf-8")
        self.assertIn("# BLM版本迁移", content)
        self.assertIn('"schema_version": 3', content)
        self.assertIn("flowGroup", content)
        self.assertIn("nodes", content)
        self.assertIn("userSteps", content)
        self.assertIn("orchestrationTasks", content)
        self.assertIn("SPC_ID", content)
        self.assertIn("现货仓单", content)
        self.assertIn("仓库期货仓单", content)

    def test_build_v2_document_keeps_ten_delivery_subdomains(self):
        module = load_migration_module()
        source = module._load_source_document(ROOT / "workspace" / module.SOURCE_NAME)
        result = module.build_delivery_platform_v2(source)

        subdomains = sorted({item.get("subDomain", "") for item in result["processes"]})
        self.assertEqual(
            subdomains,
            sorted(
                [
                    "用户管理",
                    "基础数据管理",
                    "交割服务机构管理",
                    "仓储仓单管理",
                    "厂库库存管理",
                    "车船板交割管理",
                    "电子仓单同步数据管理",
                    "视频监控管理",
                    "物联网设备管理",
                    "综合大屏",
                ]
            ),
        )
        self.assertNotIn("图书馆", subdomains)

    def test_build_v2_document_contains_restructured_processes(self):
        module = load_migration_module()
        source = module._load_source_document(ROOT / "workspace" / module.SOURCE_NAME)
        result = module.build_delivery_platform_v2(source)
        process_names = {item.get("name", "") for item in result["processes"]}

        for expected_name in [
            "新增仓库主体",
            "修改仓库主体",
            "启停仓库主体",
            "查询仓库主体",
            "仓单注册",
            "仓单注销",
            "仓单过户",
            "仓单链查询",
            "期现差异查询",
        ]:
            self.assertIn(expected_name, process_names)

    def test_build_v2_document_contains_core_warrant_entities(self):
        module = load_migration_module()
        source = module._load_source_document(ROOT / "workspace" / module.SOURCE_NAME)
        result = module.build_delivery_platform_v2(source)
        entity_names = {item.get("name", "") for item in result["entities"]}

        for expected_name in [
            "现货仓单",
            "仓库期货仓单",
            "厂库期货仓单",
            "期现关联",
            "仓储仓单关系",
            "仓单注册记录",
            "仓单注销记录",
            "仓单过户记录",
        ]:
            self.assertIn(expected_name, entity_names)

    def test_write_v2_outputs_json_and_markdown(self):
        module = load_migration_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            json_path = temp_path / "交割智慧监管平台-v2.json"
            md_path = temp_path / "交割智慧监管平台-v2.md"
            written_json, written_md = module.write_delivery_platform_v2(
                ROOT / "workspace" / module.SOURCE_NAME,
                json_path,
                md_path,
            )

            self.assertEqual(written_json, json_path)
            self.assertEqual(written_md, md_path)
            self.assertTrue(json_path.exists())
            self.assertTrue(md_path.exists())

            content = json_path.read_text("utf-8")
            self.assertIn("交割智慧监管平台-v2", content)
            self.assertIn("仓单注册", content)
            self.assertIn("仓单链查询", content)


if __name__ == "__main__":
    unittest.main()
