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
            "新增账号",
            "修改账号",
            "启停账号",
            "查询账号",
            "新增角色",
            "修改角色",
            "启停角色",
            "查询角色",
            "新增基础信息项",
            "查询字典项",
            "新增商品品牌",
            "查询商品等级规格",
            "新增仓库主体",
            "修改仓库主体",
            "启停仓库主体",
            "查询仓库主体",
            "查询仓房",
            "查询垛位",
            "入库预约变更",
            "入库预约撤销",
            "仓单注册",
            "仓单注销",
            "仓单过户",
            "出库预约变更",
            "出库预约撤销",
            "厂库出库预约申请",
            "厂库出库预约变更",
            "厂库出库预约撤销",
            "厂库出库进度查询",
            "车船板预报接入",
            "交割配对确认",
            "现场签到",
            "摇号抽样",
            "复检申请",
            "押金处理",
            "仓单链查询",
            "期现差异查询",
            "新增物联网设备",
            "查询物联网设备",
            "新增摄像头能力标签",
            "查询摄像头能力标签",
        ]:
            self.assertIn(expected_name, process_names)

        for removed_name in [
            "账号维护",
            "角色维护",
            "基础信息管理",
            "参数配置管理",
            "数据字典管理",
            "商品主数据管理",
            "入库预约变更撤销",
            "出库预约变更撤销",
            "厂库出库预约",
            "车船板预报与配对接入",
            "现场签到与摇号抽样",
            "复检申请与押金处理",
            "物联网设备维护",
            "摄像头能力标签维护",
        ]:
            self.assertNotIn(removed_name, process_names)

    def test_build_v2_document_uses_atomic_flow_groups_for_key_subdomains(self):
        module = load_migration_module()
        source = module._load_source_document(ROOT / "workspace" / module.SOURCE_NAME)
        result = module.build_delivery_platform_v2(source)

        by_name = {item.get("name", ""): item for item in result["processes"]}
        self.assertEqual(by_name["新增账号"]["flowGroup"], "账号与权限")
        self.assertEqual(by_name["查询仓房"]["flowGroup"], "仓房维护")
        self.assertEqual(by_name["入库预约撤销"]["flowGroup"], "入库管理")
        self.assertEqual(by_name["出库预约变更"]["flowGroup"], "出库管理")
        self.assertEqual(by_name["厂库出库预约撤销"]["flowGroup"], "厂库出库")
        self.assertEqual(by_name["交割配对确认"]["flowGroup"], "预报与配对")
        self.assertEqual(by_name["摇号抽样"]["flowGroup"], "现场作业")
        self.assertEqual(by_name["新增物联网设备"]["flowGroup"], "设备配置")

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
            self.assertIn("入库预约撤销", content)
            self.assertIn("交割配对确认", content)


if __name__ == "__main__":
    unittest.main()
