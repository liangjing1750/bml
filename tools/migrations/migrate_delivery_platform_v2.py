from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from blm_core.document import migrate_document, renumber_document_ids
from blm_core.markdown import MarkdownExporter


WORKSPACE_DIR = ROOT / "workspace"
SOURCE_NAME = "交割智慧监管平台.json"
OUTPUT_JSON_NAME = "交割智慧监管平台-v2.json"
OUTPUT_MD_NAME = "交割智慧监管平台-v2.md"

REMOVE_ROLE_NAMES = {"读者", "图书管理员"}
REMOVE_ENTITY_NAMES = {"读者", "馆藏", "借阅记录", "预约记录", "书目"}
REMOVE_SUBDOMAIN_NAMES = {"图书馆"}
LIBRARY_KEYWORDS = ("图书", "馆藏", "借阅", "读者", "预约记录", "书目")


def field(
    name: str,
    field_type: str,
    note: str,
    *,
    is_key: bool = False,
    is_status: bool = False,
    state_values: str = "",
) -> dict:
    return {
        "name": name,
        "type": field_type,
        "is_key": is_key,
        "is_status": is_status,
        "note": note,
        "state_values": state_values,
    }


def state_transition(field_name: str, from_state: str, to_state: str, action: str, note: str) -> dict:
    return {
        "field_name": field_name,
        "from": from_state,
        "to": to_state,
        "action": action,
        "note": note,
    }


def user_step(name: str, step_type: str, note: str) -> dict:
    return {"name": name, "type": step_type, "note": note}


def orchestration_task(
    name: str,
    task_type: str,
    target: str,
    note: str,
    *,
    query_source_kind: str = "",
) -> dict:
    return {
        "name": name,
        "type": task_type,
        "querySourceKind": query_source_kind,
        "target": target,
        "note": note,
    }


def entity_op(entity_id: str, *ops: str) -> dict:
    return {"entity_id": entity_id, "ops": list(ops)}


def node(
    name: str,
    role: str,
    *,
    user_steps: list[dict] | None = None,
    orchestration_tasks: list[dict] | None = None,
    entity_ops: list[dict] | None = None,
    rules_note: str = "",
    repeatable: bool = False,
    node_id: str = "",
) -> dict:
    return {
        "id": node_id,
        "name": name,
        "role": role,
        "role_id": "",
        "repeatable": repeatable,
        "userSteps": user_steps or [],
        "orchestrationTasks": orchestration_tasks or [],
        "entity_ops": entity_ops or [],
        "rules_note": rules_note,
    }


def process(
    name: str,
    sub_domain: str,
    flow_group: str,
    trigger: str,
    outcome: str,
    nodes: list[dict],
    *,
    process_id: str = "",
) -> dict:
    return {
        "id": process_id,
        "name": name,
        "subDomain": sub_domain,
        "flowGroup": flow_group,
        "trigger": trigger,
        "outcome": outcome,
        "nodes": nodes,
    }


def rule(name: str, rule_type: str, applies_to: str, description: str, formula: str = "") -> dict:
    return {
        "name": name,
        "type": rule_type,
        "applies_to": applies_to,
        "description": description,
        "formula": formula,
    }


def relation(from_id: str, to_id: str, relation_type: str, label: str) -> dict:
    return {"from": from_id, "to": to_id, "type": relation_type, "label": label}


def _contains_library_text(text: str) -> bool:
    text = str(text or "")
    return any(keyword in text for keyword in LIBRARY_KEYWORDS)


def _load_source_document(source_path: Path) -> dict:
    return migrate_document(json.loads(source_path.read_text(encoding="utf-8")))


def _filter_roles(source: dict) -> list[dict]:
    roles = []
    for role_item in source.get("roles", []):
        if role_item.get("name") in REMOVE_ROLE_NAMES:
            continue
        role_copy = deepcopy(role_item)
        role_copy["subDomains"] = [
            value
            for value in role_copy.get("subDomains", [])
            if value and value not in REMOVE_SUBDOMAIN_NAMES
        ]
        roles.append(role_copy)
    return roles


def _filter_language(source: dict) -> list[dict]:
    return [
        deepcopy(item)
        for item in source.get("language", [])
        if not _contains_library_text(item.get("term", "")) and not _contains_library_text(item.get("definition", ""))
    ]


def _ensure_language_term(language: list[dict], term: str, definition: str) -> None:
    if any(str(item.get("term", "")).strip() == term for item in language):
        return
    language.append({"term": term, "definition": definition})


def _build_entities(source: dict) -> list[dict]:
    entities = []
    for entity_item in source.get("entities", []):
        if entity_item.get("name") in REMOVE_ENTITY_NAMES:
            continue
        if _contains_library_text(entity_item.get("group", "")):
            continue
        entity_copy = deepcopy(entity_item)
        entities.append(entity_copy)

    by_name = {item["name"]: item for item in entities}

    if "厂库仓单" in by_name:
        by_name["厂库仓单"]["name"] = "厂库期货仓单"
        by_name["厂库仓单"]["note"] = "厂库场景下的期货侧仓单对象，重点关注可提数量、过户和出库。"
        for field_item in by_name["厂库仓单"].get("fields", []):
            if field_item.get("name") == "期货仓单号":
                field_item["note"] = "厂库期货仓单编号"

    if "现货仓单" in by_name:
        spot = by_name["现货仓单"]
        spot["note"] = "仓储侧对货物位置与数量的管理单元，支持父子血缘追溯。"
        existing_field_names = {field_item.get("name") for field_item in spot.get("fields", [])}
        if "当前垛位ID" not in existing_field_names:
            spot["fields"].append(field("当前垛位ID", "id", "当前存放垛位"))
        if "可用数量" not in existing_field_names:
            spot["fields"].append(field("可用数量", "decimal", "当前可用于货转、注册、出库的数量"))

    if "期现关联" in by_name:
        relation_entity = by_name["期现关联"]
        relation_entity["note"] = "现货仓单与仓库期货仓单之间的当前有效一一映射。"
        field_names = [field_item.get("name") for field_item in relation_entity.get("fields", [])]
        for field_item in relation_entity.get("fields", []):
            if field_item.get("name") == "期货仓单号":
                field_item["name"] = "SPC_ID"
                field_item["note"] = "期货电子仓单系统的非通用仓单编号"
        if "仓库期货仓单ID" not in field_names:
            relation_entity["fields"].append(field("仓库期货仓单ID", "id", "关联的仓库期货仓单"))
        if "关联确认方式" not in field_names:
            relation_entity["fields"].append(field("关联确认方式", "enum", "人工确认/自动候选确认"))
        if "生效时间" not in field_names:
            relation_entity["fields"].append(field("生效时间", "datetime", "当前映射的生效时间"))
        if "失效时间" not in field_names:
            relation_entity["fields"].append(field("失效时间", "datetime", "当前映射失效时间"))

    additions = [
        {
            "id": "E59",
            "name": "仓库期货仓单",
            "group": "仓储仓单管理主题域",
            "note": "标准仓库场景下的期货侧仓单对象，可与现货仓单进行期现映射。",
            "fields": [
                field("期货仓单ID", "id", "仓库期货仓单主键", is_key=True),
                field("SPC_ID", "string", "期货电子仓单系统的非通用仓单编号"),
                field("现货仓单ID", "id", "当前对应的现货仓单"),
                field("当前持有人", "string", "当前期货侧持有人"),
                field("状态", "enum", "有效/待注销/已注销", is_status=True, state_values="有效/待注销/已注销"),
            ],
            "state_transitions": [
                state_transition("状态", "有效", "待注销", "发起注销", "进入注销办理阶段。"),
                state_transition("状态", "待注销", "已注销", "完成注销", "注销成功后结束当前期货仓单生命周期。"),
            ],
        },
        {
            "id": "E60",
            "name": "仓储仓单关系",
            "group": "仓储仓单管理主题域",
            "note": "描述现货仓单之间因货转、注册、注销、出库等动作形成的父子血缘关系。",
            "fields": [
                field("关系ID", "id", "仓储仓单关系主键", is_key=True),
                field("父现货仓单ID", "id", "上游现货仓单"),
                field("子现货仓单ID", "id", "下游现货仓单"),
                field("关系类型", "enum", "货转拆分/注册拆分/注销回流/出库结转"),
                field("生效时间", "datetime", "关系建立时间"),
            ],
            "state_transitions": [],
        },
        {
            "id": "E61",
            "name": "仓单注册记录",
            "group": "仓储仓单管理主题域",
            "note": "现货仓单注册为仓库期货仓单时的业务留痕。",
            "fields": [
                field("注册记录ID", "id", "仓单注册记录主键", is_key=True),
                field("现货仓单ID", "id", "参与注册的现货仓单"),
                field("仓库期货仓单ID", "id", "注册生成的仓库期货仓单"),
                field("SPC_ID", "string", "期货侧仓单编号"),
                field("状态", "enum", "待确认/已完成/已驳回", is_status=True, state_values="待确认/已完成/已驳回"),
            ],
            "state_transitions": [],
        },
        {
            "id": "E62",
            "name": "仓单注销记录",
            "group": "仓储仓单管理主题域",
            "note": "仓库期货仓单注销并回流到现货管理时的业务留痕。",
            "fields": [
                field("注销记录ID", "id", "仓单注销记录主键", is_key=True),
                field("仓库期货仓单ID", "id", "待注销的仓库期货仓单"),
                field("现货仓单ID", "id", "回流后的现货仓单"),
                field("状态", "enum", "待核验/已完成/已驳回", is_status=True, state_values="待核验/已完成/已驳回"),
                field("注销时间", "datetime", "注销完成时间"),
            ],
            "state_transitions": [],
        },
        {
            "id": "E63",
            "name": "仓单过户记录",
            "group": "仓储仓单管理主题域",
            "note": "仓库期货仓单流通属性变化的留痕记录。",
            "fields": [
                field("过户记录ID", "id", "仓单过户记录主键", is_key=True),
                field("仓库期货仓单ID", "id", "关联的仓库期货仓单"),
                field("转让方", "string", "过户前持有人"),
                field("受让方", "string", "过户后持有人"),
                field("状态", "enum", "待确认/已完成/已撤销", is_status=True, state_values="待确认/已完成/已撤销"),
            ],
            "state_transitions": [],
        },
    ]
    entities.extend(additions)
    return entities


def _build_relations(source: dict, kept_entity_ids: set[str]) -> list[dict]:
    relations = []
    for relation_item in source.get("relations", []):
        if relation_item.get("from") not in kept_entity_ids or relation_item.get("to") not in kept_entity_ids:
            continue
        relations.append(deepcopy(relation_item))

    relations.extend(
        [
            relation("E22", "E60", "1:N", "形成父子仓单关系"),
            relation("E60", "E22", "N:1", "子仓单"),
            relation("E22", "E61", "1:N", "发起注册"),
            relation("E59", "E61", "1:N", "注册生成"),
            relation("E59", "E62", "1:N", "发起注销"),
            relation("E22", "E62", "1:N", "注销回流"),
            relation("E59", "E63", "1:N", "产生过户记录"),
            relation("E23", "E22", "N:1", "关联现货仓单"),
            relation("E23", "E59", "N:1", "关联仓库期货仓单"),
        ]
    )
    return relations


def _build_rules(source: dict, kept_old_ids: set[str]) -> list[dict]:
    rules = []
    for rule_item in source.get("rules", []):
        applies_to = str(rule_item.get("applies_to", "")).strip()
        if applies_to and applies_to not in kept_old_ids:
            continue
        if _contains_library_text(rule_item.get("name", "")) or _contains_library_text(rule_item.get("description", "")):
            continue
        rules.append(deepcopy(rule_item))

    rules.extend(
        [
            rule(
                "期现关联一一对应",
                "DataRule",
                "E23",
                "同一有效 SPC_ID 只能和一个当前有效现货仓单建立映射，同一当前有效现货仓单也只能存在一条当前有效期现关联。",
                "SPC_ID unique where 状态=有效；现货仓单ID unique where 状态=有效",
            ),
            rule(
                "仓单链保留父子血缘",
                "DataRule",
                "E60",
                "现货货转、注册、注销、出库等动作产生新的仓储仓单单元时，必须写入父子关系，不得只更新原仓单状态。",
                "发生拆分或回流动作 -> 创建仓储仓单关系",
            ),
            rule(
                "移垛只改变位置",
                "DataRule",
                "E25",
                "移垛只允许变更仓房、垛位和位置留痕，不允许直接改变现货仓单总量和货权。",
                "移垛前后数量相等 且 货权人不变",
            ),
            rule(
                "盘库不直接改写仓单数量",
                "DataRule",
                "E27",
                "盘库记录仅用于审计留痕和监管关注，不直接改写现货仓单数量；数量调整必须通过独立业务流程完成。",
                "盘库记录 -> 留痕/告警，不触发现货仓单数量变更",
            ),
            rule(
                "仓单注册先确认期现映射",
                "StepRule",
                "P-REGISTER",
                "仓单注册前必须先确认候选现货仓单与 SPC_ID 的映射关系，映射未确认不得生成仓库期货仓单。",
            ),
            rule(
                "注册后现货仓单禁止货转和直接出库",
                "DataRule",
                "E22",
                "现货仓单一旦处于已注册期货仓单的有效映射状态，只允许移垛，不允许直接货转或出库，后续需先完成注销回流。",
                "存在有效期现关联 -> 允许移垛；禁止货转/直接出库",
            ),
            rule(
                "仓单注销完成后才能出库",
                "StepRule",
                "P-CANCEL",
                "涉及期货仓单的出库，必须先完成注销核验与回流处理，再进入现货出库办理。",
            ),
        ]
    )
    return rules


def _clone_process(
    source_by_name: dict[str, dict],
    source_name: str,
    *,
    new_name: str | None = None,
    flow_group: str | None = None,
    trigger: str | None = None,
    outcome: str | None = None,
    keep_node_indexes: list[int] | None = None,
    role_map: dict[str, str] | None = None,
) -> dict:
    proc = deepcopy(source_by_name[source_name])
    if new_name:
        proc["name"] = new_name
    if flow_group is not None:
        proc["flowGroup"] = flow_group
    if trigger is not None:
        proc["trigger"] = trigger
    if outcome is not None:
        proc["outcome"] = outcome
    if keep_node_indexes is not None:
        nodes = proc.get("nodes", [])
        proc["nodes"] = [deepcopy(nodes[index]) for index in keep_node_indexes if index < len(nodes)]
    if role_map:
        for node_item in proc.get("nodes", []):
            if node_item.get("role") in role_map:
                node_item["role"] = role_map[node_item["role"]]
                node_item["role_id"] = ""
    return proc


def _maintenance_create_process(
    *,
    process_id: str,
    name: str,
    subject: str,
    sub_domain: str,
    flow_group: str,
    actor: str,
    reviewer: str,
    primary_entity_id: str,
    reference_entity_ids: list[str] | None = None,
    trigger: str,
    outcome: str,
    extra_rule: str,
) -> dict:
    refs = [entity_op(entity_id, "R") for entity_id in (reference_entity_ids or [])]
    return process(
        name,
        sub_domain,
        flow_group,
        trigger,
        outcome,
        [
            node(
                f"填写{subject}资料",
                actor,
                user_steps=[
                    user_step(f"录入{subject}基础信息", "Fill", "完成名称、代码、归属、有效期等基础字段录入。"),
                    user_step("补充业务范围和约束", "Fill", "补齐适用品种、容量、资质、附件等业务属性。"),
                    user_step(f"提交{subject}创建申请", "Mutate", "生成待审核记录并触发后续校验。"),
                ],
                orchestration_tasks=[
                    orchestration_task("加载主数据候选项", "Query", "基础数据服务", "查询可选字典、仓库或品种主数据。", query_source_kind="QueryService"),
                    orchestration_task("保存草稿或申请单", "Mutate", f"{subject}领域服务", "落地创建申请并生成待审核状态。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "C"), *refs],
                rules_note=extra_rule,
                node_id=f"{process_id}-T1",
            ),
            node(
                f"校验{subject}规则",
                reviewer,
                user_steps=[
                    user_step(f"查看待审核{subject}申请", "Query", "仅展示当前角色有权审核的待办记录。"),
                    user_step("核验唯一性与业务规则", "Check", "校验编码唯一、状态有效、关联对象存在且权限正确。"),
                    user_step("确认审核结论", "Mutate", "给出通过、驳回或退回补充结论。"),
                ],
                orchestration_tasks=[
                    orchestration_task("执行唯一性校验", "Check", f"{subject}领域服务", "检查编号、名称、有效期和关联关系是否冲突。"),
                    orchestration_task("更新审核状态", "Mutate", f"{subject}领域服务", "写入审核结论并生成通知。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U"), *refs],
                rules_note="审核阶段必须留痕，驳回原因需可追溯。",
                node_id=f"{process_id}-T2",
            ),
            node(
                f"发布{subject}结果",
                "系统",
                user_steps=[
                    user_step("回显处理结果", "Query", "向相关角色展示最新处理结果。"),
                ],
                orchestration_tasks=[
                    orchestration_task("发布处理结果", "Service", "通知待办服务", "同步发布结果并更新最新状态。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U")],
                rules_note="创建成功后应立即出现在查询与后续业务可选范围内。",
                node_id=f"{process_id}-T3",
            ),
        ],
        process_id=process_id,
    )


def _maintenance_update_process(
    *,
    process_id: str,
    name: str,
    subject: str,
    sub_domain: str,
    flow_group: str,
    actor: str,
    reviewer: str,
    primary_entity_id: str,
    reference_entity_ids: list[str] | None = None,
    trigger: str,
    outcome: str,
) -> dict:
    refs = [entity_op(entity_id, "R") for entity_id in (reference_entity_ids or [])]
    return process(
        name,
        sub_domain,
        flow_group,
        trigger,
        outcome,
        [
            node(
                f"选择并修改{subject}",
                actor,
                user_steps=[
                    user_step(f"查询待修改{subject}", "Query", "按编码、名称、状态、归属等条件筛选目标对象。"),
                    user_step(f"调整{subject}字段", "Fill", "修改需变更的字段并保留变更原因。"),
                    user_step("提交变更申请", "Mutate", "生成待审核变更记录。"),
                ],
                orchestration_tasks=[
                    orchestration_task("查询当前对象快照", "Query", f"{subject}领域服务", "加载当前版本供修改比对。", query_source_kind="QueryService"),
                    orchestration_task("保存变更申请", "Mutate", f"{subject}领域服务", "保存新旧差异并进入审核。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U"), *refs],
                rules_note="修改前必须锁定当前版本，避免并发覆盖。",
                node_id=f"{process_id}-T1",
            ),
            node(
                f"审核{subject}变更",
                reviewer,
                user_steps=[
                    user_step("查看变更前后差异", "Query", "展示旧值、新值和变更原因。"),
                    user_step("校验影响范围", "Check", "校验变更是否影响后续流程、权限或统计口径。"),
                    user_step("确认变更结果", "Mutate", "审核通过后生效，不通过则退回。"),
                ],
                orchestration_tasks=[
                    orchestration_task("对比对象差异", "Compute", f"{subject}领域服务", "生成字段级差异视图。"),
                    orchestration_task("提交审核结果", "Mutate", f"{subject}领域服务", "写入审核结果并更新状态。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U"), *refs],
                rules_note="变更审核必须确认是否影响当前有效业务单据。",
                node_id=f"{process_id}-T2",
            ),
            node(
                f"发布{subject}最新版本",
                "系统",
                user_steps=[user_step("查看最新版本", "Query", "展示生效后的对象快照。")],
                orchestration_tasks=[
                    orchestration_task("发布最新版本", "Service", f"{subject}领域服务", "回写生效版本并同步缓存或索引。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U")],
                rules_note="修改成功后要保留版本追溯线索。",
                node_id=f"{process_id}-T3",
            ),
        ],
        process_id=process_id,
    )


def _maintenance_toggle_process(
    *,
    process_id: str,
    name: str,
    subject: str,
    sub_domain: str,
    flow_group: str,
    actor: str,
    reviewer: str,
    primary_entity_id: str,
    trigger: str,
    outcome: str,
) -> dict:
    return process(
        name,
        sub_domain,
        flow_group,
        trigger,
        outcome,
        [
            node(
                f"提交{subject}启停指令",
                actor,
                user_steps=[
                    user_step(f"选择待启停{subject}", "Query", "按当前状态和归属筛选目标对象。"),
                    user_step("填写启停原因", "Fill", "说明启用或停用原因、生效时间及影响范围。"),
                    user_step("提交启停申请", "Mutate", "进入启停审核环节。"),
                ],
                orchestration_tasks=[
                    orchestration_task("校验当前状态", "Check", f"{subject}领域服务", "检查对象是否允许启停切换。"),
                    orchestration_task("登记启停申请", "Mutate", f"{subject}领域服务", "记录启停原因和待审核状态。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U")],
                rules_note="停用前需确认不存在未完成的挂起业务。",
                node_id=f"{process_id}-T1",
            ),
            node(
                f"审核{subject}启停影响",
                reviewer,
                user_steps=[
                    user_step("查看受影响业务范围", "Query", "查看是否影响预约、在库或监管事项。"),
                    user_step("确认启停结论", "Check", "校验是否允许立即生效或需延期生效。"),
                    user_step("提交审核结果", "Mutate", "形成最终启停结论。"),
                ],
                orchestration_tasks=[
                    orchestration_task("评估影响范围", "Compute", f"{subject}领域服务", "统计受影响的流程、预约和设备配置。"),
                    orchestration_task("更新启停状态", "Mutate", f"{subject}领域服务", "回写启停结果并记录时间点。"),
                ],
                entity_ops=[entity_op(primary_entity_id, "R", "U")],
                rules_note="停用结果必须同步影响查询候选范围。",
                node_id=f"{process_id}-T2",
            ),
        ],
        process_id=process_id,
    )


def _maintenance_query_process(
    *,
    process_id: str,
    name: str,
    subject: str,
    sub_domain: str,
    flow_group: str,
    actor: str,
    entity_ids: list[str],
    trigger: str,
    outcome: str,
) -> dict:
    return process(
        name,
        sub_domain,
        flow_group,
        trigger,
        outcome,
        [
            node(
                f"输入{subject}查询条件",
                actor,
                user_steps=[
                    user_step("选择查询范围", "Select", "按编号、名称、状态、归属、品种等条件筛选。"),
                    user_step("提交查询", "Query", "触发条件检索和结果聚合。"),
                ],
                orchestration_tasks=[
                    orchestration_task("检索领域对象", "Query", f"{subject}查询服务", "按条件读取当前有效对象。", query_source_kind="QueryService"),
                    orchestration_task("聚合结果视图", "Compute", f"{subject}查询服务", "形成列表、详情或统计视图。"),
                ],
                entity_ops=[entity_op(entity_id, "R") for entity_id in entity_ids],
                rules_note="查询仅返回当前角色有权查看的数据范围。",
                node_id=f"{process_id}-T1",
            ),
            node(
                f"查看{subject}结果",
                actor,
                user_steps=[
                    user_step("浏览查询结果", "Query", "查看明细、状态与关联信息。"),
                    user_step("导出或继续查看详情", "Query", "支持按权限导出或跳转详情。"),
                ],
                orchestration_tasks=[
                    orchestration_task("返回查询结果", "Service", f"{subject}查询服务", "按统一口径返回列表和统计摘要。"),
                ],
                entity_ops=[entity_op(entity_id, "R") for entity_id in entity_ids],
                rules_note="查询口径应与统计、大屏及后续流程候选项保持一致。",
                node_id=f"{process_id}-T2",
            ),
        ],
        process_id=process_id,
    )


def _standard_maintenance_suite(
    *,
    process_id_prefix: str,
    subject: str,
    sub_domain: str,
    flow_group: str,
    actor: str,
    reviewer: str,
    primary_entity_id: str,
    reference_entity_ids: list[str] | None = None,
    query_actor: str | None = None,
    query_entity_ids: list[str] | None = None,
    extra_rule: str = "",
    create_name: str | None = None,
    update_name: str | None = None,
    toggle_name: str | None = None,
    query_name: str | None = None,
    create_trigger: str | None = None,
    create_outcome: str | None = None,
    update_trigger: str | None = None,
    update_outcome: str | None = None,
    toggle_trigger: str | None = None,
    toggle_outcome: str | None = None,
    query_trigger: str | None = None,
    query_outcome: str | None = None,
) -> list[dict]:
    suite: list[dict] = []
    refs = reference_entity_ids or []
    query_ids = query_entity_ids or [primary_entity_id, *refs]

    suite.append(
        _maintenance_create_process(
            process_id=f"{process_id_prefix}-CREATE",
            name=create_name or f"新增{subject}",
            subject=subject,
            sub_domain=sub_domain,
            flow_group=flow_group,
            actor=actor,
            reviewer=reviewer,
            primary_entity_id=primary_entity_id,
            reference_entity_ids=refs,
            trigger=create_trigger or f"需要新增新的{subject}",
            outcome=create_outcome or f"形成可用的{subject}档案",
            extra_rule=extra_rule or f"{subject}关键字段必须完整、唯一且可追溯。",
        )
    )
    suite.append(
        _maintenance_update_process(
            process_id=f"{process_id_prefix}-UPDATE",
            name=update_name or f"修改{subject}",
            subject=subject,
            sub_domain=sub_domain,
            flow_group=flow_group,
            actor=actor,
            reviewer=reviewer,
            primary_entity_id=primary_entity_id,
            reference_entity_ids=refs,
            trigger=update_trigger or f"已有{subject}档案需要调整",
            outcome=update_outcome or f"{subject}最新版本生效",
        )
    )
    suite.append(
        _maintenance_toggle_process(
            process_id=f"{process_id_prefix}-TOGGLE",
            name=toggle_name or f"启停{subject}",
            subject=subject,
            sub_domain=sub_domain,
            flow_group=flow_group,
            actor=actor,
            reviewer=reviewer,
            primary_entity_id=primary_entity_id,
            trigger=toggle_trigger or f"{subject}需要启用、停用或恢复",
            outcome=toggle_outcome or f"{subject}状态切换完成",
        )
    )
    suite.append(
        _maintenance_query_process(
            process_id=f"{process_id_prefix}-QUERY",
            name=query_name or f"查询{subject}",
            subject=subject,
            sub_domain=sub_domain,
            flow_group=flow_group,
            actor=query_actor or reviewer,
            entity_ids=query_ids,
            trigger=query_trigger or f"需要查看{subject}档案、状态和关联信息",
            outcome=query_outcome or f"返回{subject}查询结果",
        )
    )
    return suite


def _build_processes(source: dict) -> list[dict]:
    source_by_name = {item["name"]: item for item in source.get("processes", [])}
    role_map = {"读者": "货权人"}
    processes: list[dict] = []

    # 用户管理
    processes.append(_clone_process(source_by_name, "统一登录", flow_group="认证与登录", role_map=role_map))
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-ACCOUNT",
            subject="账号",
            sub_domain="用户管理",
            flow_group="账号与权限",
            actor="平台管理员",
            reviewer="交割部超级账号",
            primary_entity_id="E1",
            reference_entity_ids=["E2"],
            query_actor="平台管理员",
            extra_rule="账号登录名、所属机构和权限边界必须明确，停用前需确认无关键待办挂起。",
            create_outcome="形成可登录、可授权的新账号",
            query_outcome="返回账号、角色与状态查询结果",
        )
    )
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-ROLE",
            subject="角色",
            sub_domain="用户管理",
            flow_group="账号与权限",
            actor="平台管理员",
            reviewer="交割部超级账号",
            primary_entity_id="E2",
            query_actor="平台管理员",
            extra_rule="角色能力边界必须清晰，并与菜单授权配置保持一致。",
            create_outcome="形成可授权的新角色配置",
            query_outcome="返回角色能力边界与授权结果",
        )
    )
    processes.append(
        _maintenance_update_process(
            process_id="P-MENU-AUTH-CONFIG",
            name="配置菜单鉴权",
            subject="菜单鉴权",
            sub_domain="用户管理",
            flow_group="账号与权限",
            actor="平台管理员",
            reviewer="交割部超级账号",
            primary_entity_id="E2",
            reference_entity_ids=["E1"],
            trigger="角色或菜单能力边界需要调整",
            outcome="菜单鉴权配置最新版本生效",
        )
    )
    processes.append(
        _maintenance_query_process(
            process_id="P-MENU-AUTH-QUERY",
            name="查询菜单鉴权",
            subject="菜单鉴权",
            sub_domain="用户管理",
            flow_group="账号与权限",
            actor="平台管理员",
            entity_ids=["E1", "E2"],
            trigger="需要查询账号、角色和菜单授权关系",
            outcome="返回菜单鉴权配置与角色授权视图",
        )
    )
    processes.append(_clone_process(source_by_name, "通知待办中心", flow_group="平台协同", role_map=role_map))

    # 基础数据管理
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-BASE-INFO",
            subject="基础信息项",
            sub_domain="基础数据管理",
            flow_group="基础档案",
            actor="平台管理员",
            reviewer="交割部人员",
            primary_entity_id="E5",
            extra_rule="基础信息项必须明确适用业务、展示口径和是否参与流程校验。",
        )
    )
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-PARAM",
            subject="参数配置",
            sub_domain="基础数据管理",
            flow_group="参数规则",
            actor="平台管理员",
            reviewer="交割部人员",
            primary_entity_id="E6",
            extra_rule="参数配置必须明确生效范围、生效时间和默认值策略。",
        )
    )
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-DICT",
            subject="字典项",
            sub_domain="基础数据管理",
            flow_group="数据字典",
            actor="平台管理员",
            reviewer="交割部人员",
            primary_entity_id="E7",
            query_name="查询字典项",
            extra_rule="字典编码和值域必须稳定，避免影响既有流程实例。",
            query_outcome="返回字典项、取值和启停状态",
        )
    )
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-BRAND",
            subject="商品品牌",
            sub_domain="基础数据管理",
            flow_group="商品主数据",
            actor="平台管理员",
            reviewer="交割部人员",
            primary_entity_id="E8",
            extra_rule="商品品牌必须绑定品种分类，并保持编码唯一。",
        )
    )
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-GRADE",
            subject="商品等级规格",
            sub_domain="基础数据管理",
            flow_group="商品主数据",
            actor="平台管理员",
            reviewer="交割部人员",
            primary_entity_id="E9",
            reference_entity_ids=["E8"],
            extra_rule="等级规格必须与品牌、品种及质检口径保持一致。",
        )
    )

    # 交割服务机构管理
    processes.extend(
        [
            _maintenance_create_process(
                process_id="P-WH-CREATE",
                name="新增仓库主体",
                subject="仓库主体",
                sub_domain="交割服务机构管理",
                flow_group="仓库主体维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E10",
                trigger="需要新增新的交割仓库主体",
                outcome="形成可用的仓库主体档案",
                extra_rule="仓库主体编码、简称和所属区域必须唯一且完整。",
            ),
            _maintenance_update_process(
                process_id="P-WH-UPDATE",
                name="修改仓库主体",
                subject="仓库主体",
                sub_domain="交割服务机构管理",
                flow_group="仓库主体维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E10",
                trigger="已有仓库主体档案需要调整",
                outcome="仓库主体最新版本生效",
            ),
            _maintenance_toggle_process(
                process_id="P-WH-TOGGLE",
                name="启停仓库主体",
                subject="仓库主体",
                sub_domain="交割服务机构管理",
                flow_group="仓库主体维护",
                actor="仓库负责人",
                reviewer="交割部人员",
                primary_entity_id="E10",
                trigger="仓库主体需要启用、停用或恢复",
                outcome="仓库主体状态切换并同步影响范围",
            ),
            _maintenance_query_process(
                process_id="P-WH-QUERY",
                name="查询仓库主体",
                subject="仓库主体",
                sub_domain="交割服务机构管理",
                flow_group="仓库主体维护",
                actor="交割部人员",
                entity_ids=["E10", "E14"],
                trigger="需要查看仓库主体档案与状态",
                outcome="返回仓库主体查询结果",
            ),
            _maintenance_create_process(
                process_id="P-QUAL-CREATE",
                name="新增仓库资质",
                subject="仓库资质",
                sub_domain="交割服务机构管理",
                flow_group="仓库资质维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E14",
                reference_entity_ids=["E10"],
                trigger="仓库新增品种资质或监管要求",
                outcome="形成新的仓库资质记录",
                extra_rule="资质类型、适用品种和有效期必须清晰可追溯。",
            ),
            _maintenance_update_process(
                process_id="P-QUAL-UPDATE",
                name="修改仓库资质",
                subject="仓库资质",
                sub_domain="交割服务机构管理",
                flow_group="仓库资质维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E14",
                reference_entity_ids=["E10"],
                trigger="仓库资质信息发生变化",
                outcome="仓库资质最新版本生效",
            ),
            _maintenance_toggle_process(
                process_id="P-QUAL-TOGGLE",
                name="启停仓库资质",
                subject="仓库资质",
                sub_domain="交割服务机构管理",
                flow_group="仓库资质维护",
                actor="仓库负责人",
                reviewer="交割部人员",
                primary_entity_id="E14",
                trigger="仓库资质需要启用或停用",
                outcome="仓库资质状态更新",
            ),
            _maintenance_query_process(
                process_id="P-QUAL-QUERY",
                name="查询仓库资质",
                subject="仓库资质",
                sub_domain="交割服务机构管理",
                flow_group="仓库资质维护",
                actor="交割部人员",
                entity_ids=["E14", "E10"],
                trigger="需要查看仓库资质覆盖范围",
                outcome="返回仓库资质查询结果",
            ),
            _maintenance_create_process(
                process_id="P-ROOM-CREATE",
                name="新增仓房",
                subject="仓房",
                sub_domain="交割服务机构管理",
                flow_group="仓房维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E11",
                reference_entity_ids=["E10"],
                trigger="仓库新增仓房资源",
                outcome="形成可用的仓房档案",
                extra_rule="仓房必须归属有效仓库并明确库容口径。",
            ),
            _maintenance_update_process(
                process_id="P-ROOM-UPDATE",
                name="修改仓房",
                subject="仓房",
                sub_domain="交割服务机构管理",
                flow_group="仓房维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E11",
                reference_entity_ids=["E10"],
                trigger="仓房信息需要调整",
                outcome="仓房最新版本生效",
            ),
            _maintenance_toggle_process(
                process_id="P-ROOM-TOGGLE",
                name="启停仓房",
                subject="仓房",
                sub_domain="交割服务机构管理",
                flow_group="仓房维护",
                actor="仓库负责人",
                reviewer="交割部人员",
                primary_entity_id="E11",
                trigger="仓房需要启停切换",
                outcome="仓房状态更新",
            ),
            _maintenance_query_process(
                process_id="P-ROOM-QUERY",
                name="查询仓房",
                subject="仓房",
                sub_domain="交割服务机构管理",
                flow_group="仓房维护",
                actor="交割部人员",
                entity_ids=["E11", "E10"],
                trigger="需要查看仓房档案、状态与归属仓库",
                outcome="返回仓房查询结果",
            ),
            _maintenance_create_process(
                process_id="P-PILE-CREATE",
                name="新增垛位",
                subject="垛位",
                sub_domain="交割服务机构管理",
                flow_group="垛位维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E12",
                reference_entity_ids=["E10", "E11"],
                trigger="仓房内需要新增垛位",
                outcome="形成新的垛位档案",
                extra_rule="垛位必须归属仓房且容量口径正确。",
            ),
            _maintenance_update_process(
                process_id="P-PILE-UPDATE",
                name="修改垛位",
                subject="垛位",
                sub_domain="交割服务机构管理",
                flow_group="垛位维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E12",
                reference_entity_ids=["E10", "E11"],
                trigger="垛位信息需要调整",
                outcome="垛位最新版本生效",
            ),
            _maintenance_toggle_process(
                process_id="P-PILE-TOGGLE",
                name="启停垛位",
                subject="垛位",
                sub_domain="交割服务机构管理",
                flow_group="垛位维护",
                actor="仓库负责人",
                reviewer="交割部人员",
                primary_entity_id="E12",
                trigger="垛位需要启停切换",
                outcome="垛位状态更新",
            ),
            _maintenance_query_process(
                process_id="P-PILE-QUERY",
                name="查询垛位",
                subject="垛位",
                sub_domain="交割服务机构管理",
                flow_group="垛位维护",
                actor="交割部人员",
                entity_ids=["E12", "E11", "E10"],
                trigger="需要查看垛位档案、容量与归属位置",
                outcome="返回垛位查询结果",
            ),
            _maintenance_create_process(
                process_id="P-PICKUP-CREATE",
                name="新增提货地点",
                subject="提货地点",
                sub_domain="交割服务机构管理",
                flow_group="提货地点维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E13",
                reference_entity_ids=["E10"],
                trigger="仓库或厂库新增提货地点",
                outcome="形成可用提货地点档案",
                extra_rule="提货地点需要明确启用范围并可供预约引用。",
            ),
            _maintenance_update_process(
                process_id="P-PICKUP-UPDATE",
                name="修改提货地点",
                subject="提货地点",
                sub_domain="交割服务机构管理",
                flow_group="提货地点维护",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E13",
                reference_entity_ids=["E10"],
                trigger="提货地点资料需要变更",
                outcome="提货地点最新版本生效",
            ),
            _maintenance_toggle_process(
                process_id="P-PICKUP-TOGGLE",
                name="启停提货地点",
                subject="提货地点",
                sub_domain="交割服务机构管理",
                flow_group="提货地点维护",
                actor="仓库负责人",
                reviewer="交割部人员",
                primary_entity_id="E13",
                trigger="提货地点需要启停切换",
                outcome="提货地点状态更新",
            ),
            _maintenance_query_process(
                process_id="P-PICKUP-QUERY",
                name="查询提货地点",
                subject="提货地点",
                sub_domain="交割服务机构管理",
                flow_group="提货地点维护",
                actor="交割部人员",
                entity_ids=["E13", "E10"],
                trigger="需要查询提货地点与适用范围",
                outcome="返回提货地点查询结果",
            ),
            _maintenance_update_process(
                process_id="P-PLAN-UPSERT",
                name="上传仓库平面图",
                subject="仓库平面图",
                sub_domain="交割服务机构管理",
                flow_group="平面图与设备点位",
                actor="仓库管理员",
                reviewer="交割部人员",
                primary_entity_id="E50",
                reference_entity_ids=["E10"],
                trigger="仓库平面图发生新增或更新",
                outcome="最新仓库平面图生效",
            ),
            _maintenance_update_process(
                process_id="P-VIDEO-BIND",
                name="维护视频点位绑定",
                subject="视频点位绑定",
                sub_domain="交割服务机构管理",
                flow_group="平面图与设备点位",
                actor="平台管理员",
                reviewer="仓库管理员",
                primary_entity_id="E50",
                reference_entity_ids=["E42"],
                trigger="需要将视频点位绑定到仓库平面图",
                outcome="视频点位与平面图位置关系生效",
            ),
            _maintenance_update_process(
                process_id="P-IOT-BIND",
                name="维护物联网点位绑定",
                subject="物联网点位绑定",
                sub_domain="交割服务机构管理",
                flow_group="平面图与设备点位",
                actor="平台管理员",
                reviewer="仓库管理员",
                primary_entity_id="E50",
                reference_entity_ids=["E44"],
                trigger="需要将物联网点位绑定到仓库平面图",
                outcome="物联网点位与平面图位置关系生效",
            ),
        ]
    )
    processes.append(_clone_process(source_by_name, "年审管理", flow_group="监管事务", role_map=role_map))
    processes.append(_clone_process(source_by_name, "查库管理", flow_group="监管事务", role_map=role_map))
    processes.append(_clone_process(source_by_name, "监管函整改跟踪", new_name="监管函整改闭环", flow_group="监管事务", role_map=role_map))
    processes.append(_clone_process(source_by_name, "考核评级管理", flow_group="监管事务", role_map=role_map))
    processes.append(_clone_process(source_by_name, "机构监管综合查询", flow_group="监管查询", role_map=role_map))

    # 仓储仓单管理
    processes.extend(
        [
            _clone_process(source_by_name, "入库预约管理", new_name="入库预约申请", flow_group="入库管理", keep_node_indexes=[0, 1], role_map=role_map),
            process(
                "入库预约变更",
                "仓储仓单管理",
                "入库管理",
                "已提交的入库预约需要调整时段、数量或仓库响应信息",
                "形成新的入库预约版本并保留变更链路",
                [
                    node(
                        "发起入库预约变更",
                        "货权人",
                        user_steps=[
                            user_step("查询当前预约状态", "Query", "查看仓库回复结果和当前可变更状态。"),
                            user_step("填写变更内容", "Fill", "调整预约数量、时段、货物信息或备注。"),
                            user_step("提交变更申请", "Mutate", "进入仓库审核流程。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("读取预约快照", "Query", "预约查询服务", "加载当前预约版本。", query_source_kind="QueryService"),
                            orchestration_task("保存变更申请", "Mutate", "预约领域服务", "生成新的预约变更版本。"),
                        ],
                        entity_ops=[entity_op("E20", "R", "U")],
                        rules_note="只有未完成、未作废且未开始入场的预约才能发起变更。",
                        node_id="P-INBOUND-UPDATE-T1",
                    ),
                    node(
                        "审核入库预约变更",
                        "仓库业务员",
                        user_steps=[
                            user_step("查看变更申请", "Query", "核对当前预约、现场能力和变更原因。"),
                            user_step("确认变更是否可执行", "Check", "校验时段、数量和仓容约束。"),
                            user_step("回复变更结果", "Mutate", "确认变更通过、驳回或退回补充。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验仓容与时段", "Check", "预约领域服务", "校验调整后是否仍可执行。"),
                            orchestration_task("更新预约版本", "Mutate", "预约领域服务", "回写变更结果并通知申请方。"),
                        ],
                        entity_ops=[entity_op("E20", "R", "U")],
                        rules_note="变更后的预约必须保留完整版本链。",
                        node_id="P-INBOUND-UPDATE-T2",
                    ),
                ],
                process_id="P-INBOUND-UPDATE",
            ),
            process(
                "入库预约撤销",
                "仓储仓单管理",
                "入库管理",
                "已提交的入库预约不再执行，需要在办理前撤销",
                "形成已撤销的预约结果并保留撤销原因",
                [
                    node(
                        "发起入库预约撤销",
                        "货权人",
                        user_steps=[
                            user_step("查询当前预约状态", "Query", "查看当前预约是否允许撤销。"),
                            user_step("填写撤销原因", "Fill", "说明撤销原因和影响范围。"),
                            user_step("提交撤销申请", "Mutate", "进入仓库确认流程。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("读取预约快照", "Query", "预约查询服务", "加载当前预约版本。", query_source_kind="QueryService"),
                            orchestration_task("登记撤销申请", "Mutate", "预约领域服务", "保存撤销原因并冻结当前预约。"),
                        ],
                        entity_ops=[entity_op("E20", "R", "U")],
                        rules_note="已开始办理或已完成入库的预约不得直接撤销。",
                        node_id="P-INBOUND-CANCEL-T1",
                    ),
                    node(
                        "确认入库预约撤销",
                        "仓库业务员",
                        user_steps=[
                            user_step("查看撤销申请", "Query", "确认预约当前状态和现场准备情况。"),
                            user_step("确认是否允许撤销", "Check", "校验是否已占用仓容、排班或现场资源。"),
                            user_step("提交撤销结论", "Mutate", "确认撤销成功或驳回撤销。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验撤销约束", "Check", "预约领域服务", "核验现场准备和占用状态。"),
                            orchestration_task("更新预约状态", "Mutate", "预约领域服务", "回写撤销结果并通知申请方。"),
                        ],
                        entity_ops=[entity_op("E20", "R", "U")],
                        rules_note="撤销成功后应释放对应时段和仓容占用。",
                        node_id="P-INBOUND-CANCEL-T2",
                    ),
                ],
                process_id="P-INBOUND-CANCEL",
            ),
            _clone_process(source_by_name, "入库办理", flow_group="入库管理", role_map=role_map),
            _clone_process(source_by_name, "入库盘点与信息比对", flow_group="入库管理", role_map=role_map),
            _clone_process(source_by_name, "在库监控与全景查询", new_name="在库全景查询", flow_group="查询与追溯", role_map=role_map),
            _clone_process(source_by_name, "期现关联管理", new_name="期现关联确认", flow_group="期现与仓单事件", role_map=role_map),
            process(
                "仓单注册",
                "仓储仓单管理",
                "期现与仓单事件",
                "现货仓单需要注册为仓库期货仓单，或电子仓单系统同步了注册事件",
                "形成仓库期货仓单、注册记录与当前有效期现映射",
                [
                    node(
                        "接收注册事件与候选信息",
                        "系统-电子仓单",
                        user_steps=[
                            user_step("接收注册事件", "Query", "读取注册事件、交割预报和候选现货仓单。"),
                            user_step("生成候选映射", "Compute", "按仓库、品种、数量、批次和时间窗口生成候选。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("接收注册事件", "Query", "电子仓单同步服务", "读取注册事件快照。", query_source_kind="QueryService"),
                            orchestration_task("匹配候选现货仓单", "Compute", "仓单匹配服务", "生成待确认候选映射。"),
                        ],
                        entity_ops=[entity_op("E40", "R"), entity_op("E22", "R"), entity_op("E61", "C")],
                        rules_note="注册事件不能直接自动生效，必须形成待确认候选。",
                        node_id="P-REGISTER-T1",
                    ),
                    node(
                        "确认期现映射与注册范围",
                        "仓库业务员",
                        user_steps=[
                            user_step("查看候选现货仓单", "Query", "比对仓储仓单编号、数量、仓库与批次。"),
                            user_step("确认 SPC_ID 映射", "Check", "确认现货仓单与 SPC_ID 的一一映射。"),
                            user_step("提交注册确认", "Mutate", "确认注册范围、数量和映射结果。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验一一映射约束", "Check", "期现关联服务", "校验 SPC_ID 与现货仓单是否已存在有效映射。"),
                            orchestration_task("写入注册确认结果", "Mutate", "期现关联服务", "保存确认结果并进入落库阶段。"),
                        ],
                        entity_ops=[entity_op("E22", "R"), entity_op("E23", "C", "U"), entity_op("E61", "R", "U")],
                        rules_note="同一有效 SPC_ID 与同一当前有效现货仓单都只能存在一条有效映射。",
                        node_id="P-REGISTER-T2",
                    ),
                    node(
                        "生成仓库期货仓单与注册记录",
                        "系统",
                        user_steps=[user_step("查看注册结果", "Query", "回显仓库期货仓单、注册记录和映射结果。")],
                        orchestration_tasks=[
                            orchestration_task("生成仓库期货仓单", "Service", "仓单领域服务", "创建仓库期货仓单并回写状态。"),
                            orchestration_task("完成注册落库", "Mutate", "仓单领域服务", "写入注册记录并发布结果。"),
                        ],
                        entity_ops=[entity_op("E59", "C"), entity_op("E61", "R", "U"), entity_op("E23", "R", "U")],
                        rules_note="注册完成后，现货仓单进入已关联状态，但仍保留对货物本体的管理职责。",
                        node_id="P-REGISTER-T3",
                    ),
                ],
                process_id="P-REGISTER",
            ),
            process(
                "仓单注销",
                "仓储仓单管理",
                "期现与仓单事件",
                "仓库期货仓单进入注销办理，需回流到现货管理并准备后续出库",
                "形成注销记录、回流后的现货处理结果和注销完成状态",
                [
                    node(
                        "接收注销事件",
                        "系统-电子仓单",
                        user_steps=[
                            user_step("读取注销事件", "Query", "接收待注销的 SPC_ID、持有人和数量信息。"),
                            user_step("关联当前期现映射", "Query", "找到当前有效的现货仓单和仓库期货仓单。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("接收注销事件", "Query", "电子仓单同步服务", "拉取注销事件和仓单快照。", query_source_kind="QueryService"),
                            orchestration_task("定位期现映射", "Query", "期现关联服务", "找到当前有效期现映射。", query_source_kind="QueryService"),
                        ],
                        entity_ops=[entity_op("E59", "R"), entity_op("E23", "R"), entity_op("E62", "C")],
                        rules_note="注销必须先定位当前有效映射，不能对失效映射重复处理。",
                        node_id="P-CANCEL-T1",
                    ),
                    node(
                        "核验注销与回流条件",
                        "仓库业务员",
                        user_steps=[
                            user_step("查看注销影响范围", "Query", "核对当前在库状态、预约冻结和待出库情况。"),
                            user_step("确认是否允许注销", "Check", "确认注销后回流的现货仓单范围。"),
                            user_step("提交注销核验结论", "Mutate", "进入系统回写阶段。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验可注销状态", "Check", "仓单领域服务", "检查是否存在禁止注销的挂起业务。"),
                            orchestration_task("登记回流范围", "Mutate", "仓单领域服务", "写入回流后的现货处理范围。"),
                        ],
                        entity_ops=[entity_op("E59", "R"), entity_op("E22", "R", "U"), entity_op("E62", "R", "U")],
                        rules_note="涉及待出库或已冻结数量时，必须先完成状态释放或转后续流程。",
                        node_id="P-CANCEL-T2",
                    ),
                    node(
                        "回写注销结果",
                        "系统",
                        user_steps=[user_step("查看注销完成结果", "Query", "回显注销记录、现货回流结果和后续可出库状态。")],
                        orchestration_tasks=[
                            orchestration_task("失效期现映射", "Mutate", "期现关联服务", "将当前映射置为失效。"),
                            orchestration_task("完成注销落库", "Mutate", "仓单领域服务", "更新仓库期货仓单状态并回写注销记录。"),
                        ],
                        entity_ops=[entity_op("E59", "R", "U"), entity_op("E23", "R", "U"), entity_op("E62", "R", "U")],
                        rules_note="注销完成后，期货侧仓单关闭，现货侧继续承担后续出库管理。",
                        node_id="P-CANCEL-T3",
                    ),
                ],
                process_id="P-CANCEL",
            ),
            process(
                "仓单过户",
                "仓储仓单管理",
                "期现与仓单事件",
                "期货侧发生仓单持有人变更",
                "形成可追溯的仓单过户记录并更新当前持有人",
                [
                    node(
                        "接收过户事件",
                        "系统-电子仓单",
                        user_steps=[
                            user_step("读取过户事件", "Query", "获取 SPC_ID、转让方、受让方和时间信息。"),
                            user_step("定位当前期货仓单", "Query", "找到当前有效的仓库期货仓单。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("接收过户事件", "Query", "电子仓单同步服务", "读取过户事件快照。", query_source_kind="QueryService"),
                            orchestration_task("定位仓库期货仓单", "Query", "仓单领域服务", "查询当前有效仓库期货仓单。", query_source_kind="QueryService"),
                        ],
                        entity_ops=[entity_op("E59", "R"), entity_op("E63", "C")],
                        rules_note="过户是期货侧流通事件，不直接变更现货仓单货权。",
                        node_id="P-TRANSFER-T1",
                    ),
                    node(
                        "核验过户有效性",
                        "交割部人员",
                        user_steps=[
                            user_step("核对转让双方和当前状态", "Check", "检查过户主体和仓单状态是否合法。"),
                            user_step("确认是否登记过户", "Mutate", "给出通过或驳回结论。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验持有人变更", "Check", "仓单领域服务", "确认转让链和当前状态。"),
                            orchestration_task("写入过户审核结论", "Mutate", "仓单领域服务", "保存过户结论。"),
                        ],
                        entity_ops=[entity_op("E59", "R", "U"), entity_op("E63", "R", "U")],
                        rules_note="过户记录必须完整保留前后持有人。",
                        node_id="P-TRANSFER-T2",
                    ),
                    node(
                        "更新当前持有人",
                        "系统",
                        user_steps=[user_step("查看过户结果", "Query", "展示最新持有人和过户留痕。")],
                        orchestration_tasks=[
                            orchestration_task("更新仓单持有人", "Mutate", "仓单领域服务", "回写当前持有人。"),
                        ],
                        entity_ops=[entity_op("E59", "R", "U"), entity_op("E63", "R", "U")],
                        rules_note="现货仓单只关注货物本体，不直接承接期货侧流通属性。",
                        node_id="P-TRANSFER-T3",
                    ),
                ],
                process_id="P-TRANSFER",
            ),
            _clone_process(source_by_name, "现货货转管理", new_name="现货货转", flow_group="仓单作业", role_map=role_map),
            _clone_process(source_by_name, "移垛管理", new_name="现货移垛", flow_group="仓单作业", role_map=role_map),
            _clone_process(source_by_name, "盘库管理", new_name="盘库任务", flow_group="仓单作业", role_map=role_map),
            _clone_process(source_by_name, "货权人查库管理", new_name="货权人查库申请", flow_group="查询与追溯", role_map=role_map),
            _clone_process(source_by_name, "出库预约管理", new_name="出库预约申请", flow_group="出库管理", keep_node_indexes=[0, 1], role_map=role_map),
            process(
                "出库预约变更",
                "仓储仓单管理",
                "出库管理",
                "已提交的出库预约需要调整提货时段、数量或提货地点",
                "形成新的出库预约版本并保留变更链路",
                [
                    node(
                        "发起出库预约变更",
                        "货权人",
                        user_steps=[
                            user_step("查询当前预约状态", "Query", "查看仓库回复结果和当前可变更状态。"),
                            user_step("填写变更内容", "Fill", "调整预约数量、提货时间、提货地点或备注。"),
                            user_step("提交变更申请", "Mutate", "进入仓库审核流程。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("读取预约快照", "Query", "出库预约查询服务", "加载当前预约版本。", query_source_kind="QueryService"),
                            orchestration_task("保存变更申请", "Mutate", "出库预约领域服务", "生成新的出库预约变更版本。"),
                        ],
                        entity_ops=[entity_op("E29", "R", "U"), entity_op("E22", "R")],
                        rules_note="只有未完成、未作废且未开始提货的出库预约才能发起变更。",
                        node_id="P-OUTBOUND-UPDATE-T1",
                    ),
                    node(
                        "审核出库预约变更",
                        "仓库业务员",
                        user_steps=[
                            user_step("查看变更申请", "Query", "核对提货地点、时段、数量和现场能力。"),
                            user_step("确认变更是否可执行", "Check", "校验提货条件、预约冲突和注销前置要求。"),
                            user_step("回复变更结果", "Mutate", "确认变更通过、驳回或退回补充。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验提货条件", "Check", "出库预约领域服务", "检查时段、数量和仓单状态约束。"),
                            orchestration_task("更新预约版本", "Mutate", "出库预约领域服务", "回写变更结果并通知申请方。"),
                        ],
                        entity_ops=[entity_op("E29", "R", "U"), entity_op("E22", "R"), entity_op("E13", "R")],
                        rules_note="涉及期货仓单的出库仍需满足先注销后出库原则。",
                        node_id="P-OUTBOUND-UPDATE-T2",
                    ),
                ],
                process_id="P-OUTBOUND-UPDATE",
            ),
            process(
                "出库预约撤销",
                "仓储仓单管理",
                "出库管理",
                "已提交的出库预约不再执行，需要在提货办理前撤销",
                "形成已撤销的出库预约结果并释放提货资源",
                [
                    node(
                        "发起出库预约撤销",
                        "货权人",
                        user_steps=[
                            user_step("查询当前预约状态", "Query", "确认预约是否仍可撤销。"),
                            user_step("填写撤销原因", "Fill", "说明撤销原因和影响范围。"),
                            user_step("提交撤销申请", "Mutate", "进入仓库确认流程。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("读取预约快照", "Query", "出库预约查询服务", "加载当前预约版本。", query_source_kind="QueryService"),
                            orchestration_task("登记撤销申请", "Mutate", "出库预约领域服务", "保存撤销原因并冻结当前预约。"),
                        ],
                        entity_ops=[entity_op("E29", "R", "U"), entity_op("E22", "R")],
                        rules_note="已开始提货或已完成出库的预约不得直接撤销。",
                        node_id="P-OUTBOUND-CANCEL-T1",
                    ),
                    node(
                        "确认出库预约撤销",
                        "仓库业务员",
                        user_steps=[
                            user_step("查看撤销申请", "Query", "确认预约当前状态、备货和场地占用情况。"),
                            user_step("确认是否允许撤销", "Check", "校验是否已开始提货、过磅或出门。"),
                            user_step("提交撤销结论", "Mutate", "确认撤销成功或驳回撤销。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("校验撤销约束", "Check", "出库预约领域服务", "核验备货、过磅和场地占用状态。"),
                            orchestration_task("更新预约状态", "Mutate", "出库预约领域服务", "回写撤销结果并释放提货资源。"),
                        ],
                        entity_ops=[entity_op("E29", "R", "U"), entity_op("E22", "R"), entity_op("E13", "R")],
                        rules_note="撤销成功后应释放提货地点、时段和现场作业资源。",
                        node_id="P-OUTBOUND-CANCEL-T2",
                    ),
                ],
                process_id="P-OUTBOUND-CANCEL",
            ),
            _clone_process(source_by_name, "出库办理", flow_group="出库管理", role_map=role_map),
            process(
                "仓单链查询",
                "仓储仓单管理",
                "查询与追溯",
                "需要以任意现货仓单或期货仓单为起点追溯完整链路",
                "返回可追溯的仓单血缘链与期现映射链",
                [
                    node(
                        "选择仓单起点",
                        "交割部人员",
                        user_steps=[
                            user_step("输入仓单编号或 SPC_ID", "Fill", "支持从现货仓单编号或 SPC_ID 起查。"),
                            user_step("选择链路视角", "Select", "选择现货、期货或融合链路视角。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("查询起点对象", "Query", "仓单链查询服务", "定位起点仓单或期现映射。", query_source_kind="QueryService"),
                        ],
                        entity_ops=[entity_op("E22", "R"), entity_op("E59", "R"), entity_op("E23", "R"), entity_op("E60", "R")],
                        rules_note="链路查询允许从现货或期货任一侧起查。",
                        node_id="P-LINEAGE-T1",
                    ),
                    node(
                        "还原仓单链路",
                        "系统",
                        user_steps=[
                            user_step("查看祖先与后代链路", "Query", "显示从入库到当前节点的父子主线。"),
                            user_step("查看期现并行映射", "Query", "在链路上并列展示已确认的期现映射。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("还原父子关系", "Compute", "仓单链查询服务", "按父子关系拼接现货仓单链路。"),
                            orchestration_task("拼接期现映射", "Compute", "仓单链查询服务", "叠加当前与历史期现映射视图。"),
                        ],
                        entity_ops=[entity_op("E22", "R"), entity_op("E59", "R"), entity_op("E23", "R"), entity_op("E60", "R")],
                        rules_note="移垛记录默认折叠展示，不改变主血缘线。",
                        node_id="P-LINEAGE-T2",
                    ),
                    node(
                        "展示链路结果",
                        "交割部人员",
                        user_steps=[
                            user_step("查看链路详情", "Query", "查看父子关系、注册注销节点和期现映射。"),
                            user_step("展开差异或旁支", "Query", "按需展开兄弟节点、移垛记录和过户记录。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("返回链路视图", "Service", "仓单链查询服务", "返回可视化链路结果。"),
                        ],
                        entity_ops=[entity_op("E22", "R"), entity_op("E59", "R"), entity_op("E23", "R"), entity_op("E60", "R"), entity_op("E63", "R")],
                        rules_note="默认展示祖先主线与关键注册/注销节点，旁支按需展开。",
                        node_id="P-LINEAGE-T3",
                    ),
                ],
                process_id="P-LINEAGE",
            ),
            process(
                "期现差异查询",
                "仓储仓单管理",
                "查询与追溯",
                "需要核对现货侧与期货侧在注册、注销、移垛上的差异",
                "输出差异清单、差异原因和待处理建议",
                [
                    node(
                        "选择差异范围",
                        "交割部人员",
                        user_steps=[
                            user_step("选择时间范围和仓库范围", "Select", "限定差异比对的数据窗口。"),
                            user_step("选择差异类型", "Select", "选择注册、注销、移垛等差异口径。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("读取现货与期货快照", "Query", "差异查询服务", "读取现货侧、期货侧和同步快照。", query_source_kind="QueryService"),
                        ],
                        entity_ops=[entity_op("E22", "R"), entity_op("E59", "R"), entity_op("E40", "R"), entity_op("E23", "R")],
                        rules_note="差异查询应支持按仓库、品种、状态和时间窗口筛选。",
                        node_id="P-DIFF-T1",
                    ),
                    node(
                        "执行差异比对",
                        "系统",
                        user_steps=[
                            user_step("查看差异项", "Query", "展示注册、注销、移垛三类差异清单。"),
                            user_step("查看差异原因建议", "Query", "展示时序差异、映射缺失或独立操作导致的原因。"),
                        ],
                        orchestration_tasks=[
                            orchestration_task("执行差异计算", "Compute", "差异查询服务", "按统一口径比对两侧状态与事件。"),
                            orchestration_task("归类差异原因", "Compute", "差异查询服务", "生成时序差异、映射差异和独立操作差异。"),
                        ],
                        entity_ops=[entity_op("E22", "R"), entity_op("E59", "R"), entity_op("E23", "R"), entity_op("E51", "R")],
                        rules_note="注册/注销差异多为时序问题，移垛差异多为独立操作问题。",
                        node_id="P-DIFF-T2",
                    ),
                    node(
                        "返回差异结果",
                        "交割部人员",
                        user_steps=[user_step("查看并导出差异清单", "Query", "导出差异清单供后续监管处置。")],
                        orchestration_tasks=[
                            orchestration_task("返回差异报表", "Service", "差异查询服务", "输出统一报表和处理建议。"),
                        ],
                        entity_ops=[entity_op("E51", "R"), entity_op("E23", "R"), entity_op("E40", "R")],
                        rules_note="差异结果应支持生成监管关注事项。",
                        node_id="P-DIFF-T3",
                    ),
                ],
                process_id="P-DIFF",
            ),
        ]
    )

    # 厂库库存管理
    processes.append(_clone_process(source_by_name, "厂库出库预约管理", new_name="厂库出库预约申请", flow_group="厂库出库", keep_node_indexes=[0, 1], role_map=role_map))
    processes.append(
        process(
            "厂库出库预约变更",
            "厂库库存管理",
            "厂库出库",
            "已提交的厂库出库预约需要调整提货时间、数量或提货地点",
            "形成新的厂库出库预约版本并保留变更链路",
            [
                node(
                    "发起厂库出库预约变更",
                    "货权人",
                    user_steps=[
                        user_step("查询当前预约状态", "Query", "查看厂库回复结果和当前可变更状态。"),
                        user_step("填写变更内容", "Fill", "调整提货时间、数量、提货地点或备注。"),
                        user_step("提交变更申请", "Mutate", "进入厂库审核流程。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("读取预约快照", "Query", "厂库出库预约查询服务", "加载当前预约版本。", query_source_kind="QueryService"),
                        orchestration_task("保存变更申请", "Mutate", "厂库出库预约领域服务", "生成新的厂库出库预约变更版本。"),
                    ],
                    entity_ops=[entity_op("E32", "R", "U"), entity_op("E31", "R"), entity_op("E13", "R")],
                    rules_note="只有未完成、未作废且未开始交付的厂库出库预约才能发起变更。",
                    node_id="P-FACTORY-OUTBOUND-UPDATE-T1",
                ),
                node(
                    "审核厂库出库预约变更",
                    "厂库业务员",
                    user_steps=[
                        user_step("查看变更申请", "Query", "核对提货地点、时段、数量和当前可提数量。"),
                        user_step("确认变更是否可执行", "Check", "校验交付能力、提货条件和预约冲突。"),
                        user_step("回复变更结果", "Mutate", "确认变更通过、驳回或退回补充。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("校验交付能力", "Check", "厂库出库预约领域服务", "检查时段、数量和当前可提数量。"),
                        orchestration_task("更新预约版本", "Mutate", "厂库出库预约领域服务", "回写变更结果并通知申请方。"),
                    ],
                    entity_ops=[entity_op("E32", "R", "U"), entity_op("E31", "R"), entity_op("E13", "R")],
                    rules_note="厂库变更后的预约仍需满足当前可提数量和交付节奏约束。",
                    node_id="P-FACTORY-OUTBOUND-UPDATE-T2",
                ),
            ],
            process_id="P-FACTORY-OUTBOUND-UPDATE",
        )
    )
    processes.append(
        process(
            "厂库出库预约撤销",
            "厂库库存管理",
            "厂库出库",
            "已提交的厂库出库预约不再执行，需要在交付办理前撤销",
            "形成已撤销的厂库出库预约结果并释放交付资源",
            [
                node(
                    "发起厂库出库预约撤销",
                    "货权人",
                    user_steps=[
                        user_step("查询当前预约状态", "Query", "确认厂库出库预约是否仍可撤销。"),
                        user_step("填写撤销原因", "Fill", "说明撤销原因和影响范围。"),
                        user_step("提交撤销申请", "Mutate", "进入厂库确认流程。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("读取预约快照", "Query", "厂库出库预约查询服务", "加载当前预约版本。", query_source_kind="QueryService"),
                        orchestration_task("登记撤销申请", "Mutate", "厂库出库预约领域服务", "保存撤销原因并冻结当前预约。"),
                    ],
                    entity_ops=[entity_op("E32", "R", "U"), entity_op("E31", "R")],
                    rules_note="已开始交付或已完成出库的厂库预约不得直接撤销。",
                    node_id="P-FACTORY-OUTBOUND-CANCEL-T1",
                ),
                node(
                    "确认厂库出库预约撤销",
                    "厂库业务员",
                    user_steps=[
                        user_step("查看撤销申请", "Query", "确认厂库备货、提货和交付准备情况。"),
                        user_step("确认是否允许撤销", "Check", "校验是否已开始交付、装车或出门。"),
                        user_step("提交撤销结论", "Mutate", "确认撤销成功或驳回撤销。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("校验撤销约束", "Check", "厂库出库预约领域服务", "核验备货和交付状态。"),
                        orchestration_task("更新预约状态", "Mutate", "厂库出库预约领域服务", "回写撤销结果并释放资源。"),
                    ],
                    entity_ops=[entity_op("E32", "R", "U"), entity_op("E31", "R")],
                    rules_note="撤销成功后应释放提货地点、交付时段和备货资源。",
                    node_id="P-FACTORY-OUTBOUND-CANCEL-T2",
                ),
            ],
            process_id="P-FACTORY-OUTBOUND-CANCEL",
        )
    )
    processes.append(_clone_process(source_by_name, "厂库出库办理", new_name="厂库出库办理", flow_group="厂库出库", role_map=role_map))
    processes.append(_clone_process(source_by_name, "厂库复检与留样管理", new_name="厂库复检与留样", flow_group="厂库质检", role_map=role_map))
    processes.append(_clone_process(source_by_name, "厂库库存查询", new_name="厂库库存查询", flow_group="厂库查询", role_map=role_map))
    processes.append(
        _maintenance_query_process(
            process_id="P-FACTORY-OUTBOUND-QUERY",
            name="厂库出库进度查询",
            subject="厂库出库进度",
            sub_domain="厂库库存管理",
            flow_group="厂库查询",
            actor="交割部人员",
            entity_ids=["E31", "E32", "E33"],
            trigger="需要查询厂库仓单当前交付进度、预约状态和出库结果",
            outcome="返回厂库出库进度查询结果",
        )
    )

    # 车船板交割管理
    processes.append(_clone_process(source_by_name, "车船板预报与配对接入", new_name="车船板预报接入", flow_group="预报与配对", keep_node_indexes=[0, 1], role_map=role_map))
    processes.append(
        process(
            "交割配对确认",
            "车船板交割管理",
            "预报与配对",
            "车船板预报已接入，需要形成正式交割配对关系",
            "形成可执行的车船板交割配对结果",
            [
                node(
                    "选择待配对预报",
                    "交割部人员",
                    user_steps=[
                        user_step("查询待配对预报", "Query", "查看待处理的车船板预报和可选交割资源。"),
                        user_step("填写配对方案", "Fill", "选择会员、仓库、时段和拟交割数量。"),
                        user_step("提交配对确认", "Mutate", "进入系统落库和通知环节。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("加载预报候选", "Query", "车船板交割服务", "读取预报、库存和排班候选。", query_source_kind="QueryService"),
                        orchestration_task("保存配对方案", "Mutate", "车船板交割服务", "生成待生效的交割配对方案。"),
                    ],
                    entity_ops=[entity_op("E35", "R"), entity_op("E36", "C")],
                    rules_note="配对结果必须满足资源可用、时段不冲突和会员资格约束。",
                    node_id="P-BOARD-MATCH-T1",
                ),
                node(
                    "发布交割配对结果",
                    "系统",
                    user_steps=[user_step("查看配对结果", "Query", "展示最新配对结果和后续排班入口。")],
                    orchestration_tasks=[
                        orchestration_task("发布配对结果", "Service", "通知待办服务", "同步发布配对结果并通知相关参与方。"),
                    ],
                    entity_ops=[entity_op("E36", "R", "U")],
                    rules_note="配对结果一旦生效，应驱动后续排班通知和现场作业。",
                    node_id="P-BOARD-MATCH-T2",
                ),
            ],
            process_id="P-BOARD-MATCH",
        )
    )
    processes.append(_clone_process(source_by_name, "交割排班通知", flow_group="排班与备案", role_map=role_map))
    processes.append(_clone_process(source_by_name, "协议与代理人备案", flow_group="排班与备案", role_map=role_map))
    processes.append(_clone_process(source_by_name, "现场签到与摇号抽样", new_name="现场签到", flow_group="现场作业", keep_node_indexes=[0, 1], role_map=role_map))
    processes.append(
        process(
            "摇号抽样",
            "车船板交割管理",
            "现场作业",
            "车船板现场签到完成后，需要执行摇号抽样",
            "形成可追溯的摇号抽样结果",
            [
                node(
                    "发起摇号抽样",
                    "交割部人员",
                    user_steps=[
                        user_step("选择待抽样现场批次", "Query", "查看已签到且待抽样的交割批次。"),
                        user_step("确认抽样参数", "Fill", "设置抽样数量、范围和随机规则。"),
                        user_step("执行摇号抽样", "Mutate", "生成抽样结果。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("读取待抽样批次", "Query", "车船板交割服务", "查询已签到的交割现场批次。", query_source_kind="QueryService"),
                        orchestration_task("执行随机抽样", "Compute", "车船板交割服务", "按抽样规则生成抽样结果。"),
                    ],
                    entity_ops=[entity_op("E37", "C"), entity_op("E35", "R")],
                    rules_note="摇号抽样规则必须留痕，并支持事后审计复核。",
                    node_id="P-BOARD-LOTTERY-T1",
                ),
                node(
                    "确认抽样结果",
                    "交割部人员",
                    user_steps=[user_step("查看抽样结果", "Query", "展示抽样样本、批次和留痕结果。")],
                    orchestration_tasks=[
                        orchestration_task("发布抽样结果", "Service", "车船板交割服务", "回写抽样结果并通知现场角色。"),
                    ],
                    entity_ops=[entity_op("E37", "R", "U")],
                    rules_note="抽样结果需要支撑后续初检和复检流程。",
                    node_id="P-BOARD-LOTTERY-T2",
                ),
            ],
            process_id="P-BOARD-LOTTERY",
        )
    )
    processes.append(_clone_process(source_by_name, "初检结果确认", flow_group="现场作业", role_map=role_map))
    processes.append(_clone_process(source_by_name, "复检申请与押金处理", new_name="复检申请", flow_group="现场作业", keep_node_indexes=[0, 1], role_map=role_map))
    processes.append(
        process(
            "押金处理",
            "车船板交割管理",
            "现场作业",
            "复检结果触发押金扣划、退回或补缴处理",
            "形成押金处理结果并回写现场状态",
            [
                node(
                    "确认押金处理方案",
                    "交割部人员",
                    user_steps=[
                        user_step("查看复检与押金上下文", "Query", "核对复检结论、金额和责任主体。"),
                        user_step("填写押金处理方案", "Fill", "确定扣划、退回或补缴情形。"),
                        user_step("提交押金处理", "Mutate", "进入结算处理和通知流程。"),
                    ],
                    orchestration_tasks=[
                        orchestration_task("读取复检结果", "Query", "车船板交割服务", "加载复检结论和押金上下文。", query_source_kind="QueryService"),
                        orchestration_task("保存押金处理方案", "Mutate", "车船板交割服务", "记录押金处理方案。"),
                    ],
                    entity_ops=[entity_op("E38", "R", "U")],
                    rules_note="押金处理必须与复检结论、责任判定和金额口径保持一致。",
                    node_id="P-BOARD-DEPOSIT-T1",
                ),
                node(
                    "发布押金处理结果",
                    "系统",
                    user_steps=[user_step("查看押金处理结果", "Query", "展示押金处理结果和后续状态。")],
                    orchestration_tasks=[
                        orchestration_task("发布押金处理结果", "Service", "通知待办服务", "同步发布押金处理结果并通知相关方。"),
                    ],
                    entity_ops=[entity_op("E38", "R", "U")],
                    rules_note="押金处理结果应与现场作业状态和后续追责保持一致。",
                    node_id="P-BOARD-DEPOSIT-T2",
                ),
            ],
            process_id="P-BOARD-DEPOSIT",
        )
    )
    processes.append(_clone_process(source_by_name, "车船板统计查询", flow_group="查询统计", role_map=role_map))

    # 电子仓单同步数据管理
    processes.append(_clone_process(source_by_name, "交割服务机构基础数据同步", flow_group="基础数据同步", role_map=role_map))
    processes.append(_clone_process(source_by_name, "会员机构基础信息同步", flow_group="基础数据同步", role_map=role_map))
    processes.append(_clone_process(source_by_name, "仓单事件同步", flow_group="业务事件同步", role_map=role_map))
    processes.append(_clone_process(source_by_name, "车船板数据同步", flow_group="业务事件同步", role_map=role_map))
    processes.append(
        _clone_process(
            source_by_name,
            "同步异常处理与结果查询",
            new_name="同步异常处理",
            flow_group="同步运维",
            keep_node_indexes=[0, 1],
            role_map=role_map,
        )
    )
    processes.append(
        _maintenance_query_process(
            process_id="P-SYNC-QUERY",
            name="同步结果查询",
            subject="同步结果",
            sub_domain="电子仓单同步数据管理",
            flow_group="同步运维",
            actor="平台管理员",
            entity_ids=["E39", "E40", "E41"],
            trigger="需要查询同步批次、快照和补偿结果",
            outcome="返回同步结果与异常处理明细",
        )
    )

    # 视频监控管理
    processes.append(_clone_process(source_by_name, "视频设备统一查询", flow_group="视频查询调阅", role_map=role_map))
    processes.append(_clone_process(source_by_name, "视频调阅播放", flow_group="视频查询调阅", role_map=role_map))

    # 物联网设备管理
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-IOT-DEVICE",
            subject="物联网设备",
            sub_domain="物联网设备管理",
            flow_group="设备配置",
            actor="平台管理员",
            reviewer="仓库管理员",
            primary_entity_id="E44",
            extra_rule="设备必须绑定仓库、点位和采集能力，停用前需确认不影响现有采集任务。",
        )
    )
    processes.extend(
        _standard_maintenance_suite(
            process_id_prefix="P-CAMERA-CAP",
            subject="摄像头能力标签",
            sub_domain="物联网设备管理",
            flow_group="设备配置",
            actor="平台管理员",
            reviewer="仓库管理员",
            primary_entity_id="E44",
            query_name="查询摄像头能力标签",
            extra_rule="能力标签必须服务于视频点位配置和监管筛选口径。",
            create_outcome="形成新的摄像头能力标签配置",
            update_outcome="摄像头能力标签最新版本生效",
        )
    )
    processes.append(_clone_process(source_by_name, "环境数据采集与告警", flow_group="采集告警", role_map=role_map))
    processes.append(_clone_process(source_by_name, "环境数据与告警查询", flow_group="查询分析", role_map=role_map))

    # 综合大屏
    processes.append(_clone_process(source_by_name, "全国仓库宏观展示屏", flow_group="仓库总览", role_map=role_map))
    processes.append(_clone_process(source_by_name, "单仓库微观展示屏", flow_group="仓库总览", role_map=role_map))
    processes.append(_clone_process(source_by_name, "品种流向展示屏", flow_group="品种监控", role_map=role_map))
    processes.append(_clone_process(source_by_name, "综合监控屏", flow_group="综合总览", role_map=role_map))

    return processes


def build_delivery_platform_v2(source: dict) -> dict:
    source_doc = migrate_document(source)
    roles = _filter_roles(source_doc)
    language = _filter_language(source_doc)
    entities = _build_entities(source_doc)
    kept_entity_ids = {str(item.get("id", "")).strip() for item in entities if str(item.get("id", "")).strip()}
    processes = _build_processes(source_doc)

    kept_old_ids = kept_entity_ids.copy()
    for process_item in processes:
        process_id = str(process_item.get("id", "")).strip()
        if process_id:
            kept_old_ids.add(process_id)
        for node_item in process_item.get("nodes", []):
            node_id = str(node_item.get("id", "")).strip()
            if node_id:
                kept_old_ids.add(node_id)

    relations = _build_relations(source_doc, kept_entity_ids)
    rules = _build_rules(source_doc, kept_old_ids)

    _ensure_language_term(language, "仓库期货仓单", "标准仓库场景下的期货侧仓单对象，与现货仓单通过 SPC_ID 建立当前有效映射。")
    _ensure_language_term(language, "厂库期货仓单", "厂库场景下的期货侧仓单对象，不直接管理实体在库货物位置。")
    _ensure_language_term(language, "SPC_ID", "期货电子仓单系统中的非通用仓单编号，用于期现映射确认。")
    _ensure_language_term(language, "仓单链", "以任意现货仓单或期货仓单为起点，向上追溯祖先、向下展示后代的血缘链。")
    _ensure_language_term(language, "流程组", "业务子域下对同类流程模板的归类，例如仓库主体维护、期现与仓单事件。")

    result = {
        "meta": {
            "title": "交割智慧监管平台-v2",
            "domain": "交割智慧监管平台-v2",
            "author": source_doc.get("meta", {}).get("author", ""),
            "date": "2026-04-22",
        },
        "roles": roles,
        "language": language,
        "processes": processes,
        "entities": entities,
        "relations": relations,
        "rules": rules,
    }
    return renumber_document_ids(result)


def write_delivery_platform_v2(
    source_path: Path | None = None,
    json_output_path: Path | None = None,
    md_output_path: Path | None = None,
) -> tuple[Path, Path]:
    source_file = source_path or (WORKSPACE_DIR / SOURCE_NAME)
    json_file = json_output_path or (WORKSPACE_DIR / OUTPUT_JSON_NAME)
    md_file = md_output_path or (WORKSPACE_DIR / OUTPUT_MD_NAME)

    migrated = build_delivery_platform_v2(_load_source_document(source_file))
    json_file.write_text(json.dumps(migrated, ensure_ascii=False, indent=2), encoding="utf-8")
    md_file.write_text(MarkdownExporter().export(migrated), encoding="utf-8")
    return json_file, md_file


def main() -> None:
    parser = argparse.ArgumentParser(description="迁移交割智慧监管平台文档到 v2 结构。")
    parser.add_argument("--source", default=str(WORKSPACE_DIR / SOURCE_NAME), help="源 JSON 文件路径")
    parser.add_argument("--json-out", default=str(WORKSPACE_DIR / OUTPUT_JSON_NAME), help="输出 JSON 路径")
    parser.add_argument("--md-out", default=str(WORKSPACE_DIR / OUTPUT_MD_NAME), help="输出 Markdown 路径")
    args = parser.parse_args()

    json_file, md_file = write_delivery_platform_v2(
        Path(args.source),
        Path(args.json_out),
        Path(args.md_out),
    )
    print(json_file)
    print(md_file)


if __name__ == "__main__":
    main()
