from __future__ import annotations

from bml_core.document import migrate_document


STEP_LABELS = {
    "Query": "查询",
    "Check": "校验",
    "Fill": "填写",
    "Select": "选择",
    "Compute": "计算",
    "Mutate": "变更",
}

FIELD_LABELS = {
    "string": "字符",
    "number": "数值",
    "decimal": "金额",
    "date": "日期",
    "datetime": "日期时间",
    "boolean": "布尔",
    "enum": "枚举",
    "text": "长文本",
    "id": "标识ID",
}

RULE_LABELS = {
    "StepRule": "步骤规则",
    "DataRule": "数据规则",
    "ComputeRule": "计算规则",
}

SECTION_NUMBERS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
RELATION_LABELS = {"1:1": "1对1", "1:N": "1对多", "N:N": "多对多"}


def get_role_name(role) -> str:
    if isinstance(role, dict):
        return str(role.get("name", "")).strip()
    return str(role or "").strip()


def get_role_desc(role) -> str:
    if isinstance(role, dict):
        return str(role.get("desc", "")).strip()
    return ""


def get_role_group(role) -> str:
    if isinstance(role, dict):
        return str(role.get("group", "")).strip()
    return ""


def get_role_subdomains(role) -> str:
    if isinstance(role, dict):
      return "、".join([str(value).strip() for value in role.get("subDomains", []) if str(value).strip()])
    return ""


def get_role_tags(role) -> str:
    if isinstance(role, dict):
      return "、".join([str(value).strip() for value in role.get("tags", []) if str(value).strip()])
    return ""


def get_role_status(role) -> str:
    if isinstance(role, dict):
        return "已停用" if role.get("status") == "disabled" else "启用"
    return "启用"


class MarkdownExporter:
    def export(self, document: dict) -> str:
        doc = migrate_document(document)
        lines: list[str] = []
        meta = doc.get("meta", {})
        section_index = 0

        def next_section_number() -> str:
            nonlocal section_index
            if section_index < len(SECTION_NUMBERS):
                result = SECTION_NUMBERS[section_index]
            else:
                result = str(section_index + 1)
            section_index += 1
            return result

        def line(value: str = "") -> None:
            lines.append(value)

        def separator() -> None:
            lines.extend(["---", ""])

        line(f"# {meta.get('title') or '未命名'}")
        line()
        meta_parts = [
            ("业务域", meta.get("domain", "")),
            ("作者", meta.get("author", "")),
            ("日期", meta.get("date", "")),
        ]
        rendered_meta = [f"**{key}**: {value}" for key, value in meta_parts if value]
        if rendered_meta:
            line(" | ".join(rendered_meta))
            line()
        separator()

        roles = doc.get("roles", [])
        if roles:
            line(f"## {next_section_number()}、角色")
            line()
            line("| 角色 | 分组 | 说明 | 所属业务子域 | 标签 | 状态 |")
            line("|------|------|------|--------------|------|------|")
            for role in roles:
                line(
                    f"| {get_role_name(role)} | {get_role_group(role)} | {get_role_desc(role)} | {get_role_subdomains(role)} | {get_role_tags(role)} | {get_role_status(role)} |"
                )
            line()
            separator()

        language = doc.get("language", [])
        if language:
            line(f"## {next_section_number()}、统一语言")
            line()
            line("| 术语 | 定义 |")
            line("|------|------|")
            for item in language:
                line(f"| {item.get('term', '')} | {item.get('definition', '')} |")
            line()
            separator()

        processes = doc.get("processes", [])
        entities_by_id = {entity["id"]: entity for entity in doc.get("entities", [])}
        line(f"## {next_section_number()}、流程建模")
        line()
        for process in processes:
            self._render_process(line, process, entities_by_id)
        separator()

        entities = doc.get("entities", [])
        relations = doc.get("relations", [])
        if entities:
            line(f"## {next_section_number()}、数据建模")
            line()
            self._render_entity_mermaid(line, entities, relations)
            line()
            for entity in entities:
                line(f"### 实体：{entity.get('name', '')}")
                line()
                fields = entity.get("fields", [])
                if fields:
                    line("| 字段 | 类型 | 主键 | 状态字段 | 公式/约束 |")
                    line("|------|------|------|---------|---------|")
                    for field in fields:
                        field_type = FIELD_LABELS.get(field.get("type", ""), field.get("type", ""))
                        is_key = "✓" if field.get("is_key") else ""
                        is_status = "✓" if field.get("is_status") else ""
                        line(
                            f"| {field.get('name', '')} | {field_type} | {is_key} | {is_status} | {field.get('note', '')} |"
                        )
                    line()
            separator()

        rules = doc.get("rules", [])
        if rules:
            line(f"## {next_section_number()}、规则建模")
            line()
            line("| 规则名 | 类型 | 绑定对象 | 描述 | 公式 |")
            line("|--------|------|---------|------|------|")
            for rule in rules:
                rule_type = RULE_LABELS.get(rule.get("type", ""), rule.get("type", ""))
                line(
                    f"| {rule.get('name', '')} | {rule_type} | {rule.get('applies_to', '')} | {rule.get('description', '')} | {rule.get('formula', '')} |"
                )
            line()

        return "\n".join(lines)

    def _render_process(self, line, process: dict, entities_by_id: dict) -> None:
        tasks = process.get("tasks", [])
        line(f"### {process.get('id', 'P')}: {process.get('name', '')}")
        line()
        if process.get("trigger") or process.get("outcome"):
            line(
                f"**触发**: {process.get('trigger', '—')}  →  **预期结果**: {process.get('outcome', '—')}"
            )
            line()

        if tasks:
            line("```mermaid")
            line("flowchart LR")
            line("  Start([开始])")
            for task in tasks:
                task_name = task.get("name", "").replace('"', "'")
                role = task.get("role", "")
                label = f"{task_name}\\n({role})" if role else task_name
                line(f'  {task["id"]}["{label}"]')
            line("  End([结束])")
            line("  " + " --> ".join(["Start"] + [task["id"] for task in tasks] + ["End"]))
            line("```")
            line()

            for task in tasks:
                line(f"#### {task['id']}. {task.get('name', '')}（角色：{task.get('role', '')}）")
                line()
                steps = task.get("steps", [])
                if steps:
                    line("| # | 步骤 | 类型 | 条件/备注 |")
                    line("|---|------|------|----------|")
                    for index, step in enumerate(steps, start=1):
                        step_type = STEP_LABELS.get(step.get("type", ""), step.get("type", ""))
                        line(
                            f"| {index} | {step.get('name', '')} | {step_type} | {step.get('note', '')} |"
                        )
                    line()

                entity_ops = task.get("entity_ops", [])
                if entity_ops:
                    rendered_ops = []
                    for entity_op in entity_ops:
                        entity = entities_by_id.get(entity_op.get("entity_id", ""), {})
                        entity_name = entity.get("name") or entity_op.get("entity_id", "")
                        ops = ",".join(entity_op.get("ops", []))
                        rendered_ops.append(f"{entity_name}（{ops}）")
                    line(f"**涉及实体**: {', '.join(rendered_ops)}")
                    line()

                if task.get("rules_note", "").strip():
                    line(f"**业务规则**: {task['rules_note']}")
                    line()
        line()

    def _render_entity_mermaid(self, line, entities: list[dict], relations: list[dict]) -> None:
        line("```mermaid")
        line("flowchart LR")
        for entity in entities:
            name = entity.get("name", "").replace('"', "'") or entity.get("id", "")
            line(f'  {entity["id"]}["{name}"]')
        for relation in relations:
            relation_type = RELATION_LABELS.get(relation.get("type", ""), relation.get("type", ""))
            if relation.get("label"):
                relation_type += f"\\n{relation['label']}"
            line(f'  {relation.get("from", "")} -- "{relation_type}" --> {relation.get("to", "")}')
        line("```")
