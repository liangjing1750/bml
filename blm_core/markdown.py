from __future__ import annotations

from blm_core.document import migrate_document


STEP_LABELS = {
    "Query": "查询",
    "Check": "校验",
    "Fill": "填写",
    "Select": "选择",
    "Compute": "计算",
    "Mutate": "变更",
}

ORCHESTRATION_TYPE_LABELS = {
    "Query": "\u67e5\u8be2",
    "Check": "\u6821\u9a8c",
    "Compute": "\u8ba1\u7b97",
    "Service": "\u670d\u52a1",
    "Mutate": "\u53d8\u66f4",
    "Custom": "\u81ea\u5b9a\u4e49",
}

QUERY_SOURCE_KIND_LABELS = {
    "Dictionary": "\u5b57\u5178",
    "Enum": "\u679a\u4e3e",
    "QueryService": "\u67e5\u8be2\u670d\u52a1",
    "Custom": "\u81ea\u5b9a\u4e49",
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


def get_entity_status_field(entity: dict) -> dict | None:
    return next((field for field in entity.get("fields", []) if field.get("is_status")), None)


def get_entity_state_values(entity: dict) -> str:
    field = get_entity_status_field(entity)
    if not field:
        return ""
    explicit = str(field.get("state_values", "")).strip()
    if explicit:
        return explicit
    note = str(field.get("note", "")).strip()
    parts = [item.strip() for item in note.split("/") if item.strip()]
    if parts and all(len(item) <= 16 for item in parts):
        return "/".join(parts)
    return ""


def get_field_rule_text(field: dict) -> str:
    note_text = str(field.get("note", "")).strip()
    if not field.get("is_status"):
        return note_text
    state_value_text = str(field.get("state_values", "")).strip()
    if not state_value_text:
        parts = [item.strip() for item in note_text.split("/") if item.strip()]
        if parts and all(len(item) <= 16 for item in parts):
            state_value_text = "/".join(parts)
    inferred_text = "/".join([item.strip() for item in note_text.split("/") if item.strip()])
    note_only = note_text if note_text and note_text != state_value_text and inferred_text != state_value_text else ""
    if state_value_text and note_only:
        return f"{state_value_text}；{note_only}"
    return note_text or state_value_text


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
            line("| 角色 | 分组 | 说明 | 所属业务子域 |")
            line("|------|------|------|--------------|")
            for role in roles:
                line(
                    f"| {get_role_name(role)} | {get_role_group(role)} | {get_role_desc(role)} | {get_role_subdomains(role)} |"
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
                    line("| 字段 | 类型 | 主键 | 状态字段 | 字段规则 |")
                    line("|------|------|------|---------|---------|")
                    for field in fields:
                        field_type = FIELD_LABELS.get(field.get("type", ""), field.get("type", ""))
                        is_key = "✓" if field.get("is_key") else ""
                        is_status = "✓" if field.get("is_status") else ""
                        line(
                            f"| {field.get('name', '')} | {field_type} | {is_key} | {is_status} | {get_field_rule_text(field)} |"
                        )
                    line()
                state_transitions = entity.get("state_transitions", [])
                if state_transitions:
                    status_field = get_entity_status_field(entity)
                    line("#### 状态流转")
                    line()
                    if status_field:
                        line(
                            f"**主状态字段**: {status_field.get('name', '')}（状态列表：{get_entity_state_values(entity) or '—'}）"
                        )
                        line()
                    line("| 来源状态 | 目标状态 | 触发动作 | 说明 |")
                    line("|----------|----------|----------|------|")
                    for transition in state_transitions:
                        line(
                            f"| {transition.get('from', '')} | {transition.get('to', '')} | {transition.get('action', '')} | {transition.get('note', '')} |"
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
        nodes = process.get("nodes", [])
        line(f"### {process.get('id', 'P')}: {process.get('name', '')}")
        line()
        process_meta = []
        if process.get("subDomain"):
            process_meta.append(f"**\u4e1a\u52a1\u5b50\u57df**: {process.get('subDomain', '')}")
        if process.get("flowGroup"):
            process_meta.append(f"**\u6d41\u7a0b\u7ec4**: {process.get('flowGroup', '')}")
        if process.get("trigger") or process.get("outcome"):
            trigger = process.get("trigger") or "—"
            outcome = process.get("outcome") or "—"
            process_meta.append(
                f"**\u89e6\u53d1**: {trigger}  \u2192  **\u9884\u671f\u7ed3\u679c**: {outcome}"
            )
        prototype_files = process.get("prototypeFiles", [])
        if prototype_files:
            prototype_names = "、".join(
                str(item.get("name", "")).strip() for item in prototype_files if str(item.get("name", "")).strip()
            )
            if prototype_names:
                process_meta.append(f"**\u6d41\u7a0b\u539f\u578b**: {prototype_names}")
        if process_meta:
            for item in process_meta:
                line(item)
            line()

        if nodes:
            line("```mermaid")
            line("flowchart LR")
            line("  Start([\u5f00\u59cb])")
            for node in nodes:
                node_name = node.get("name", "").replace('"', "'")
                role = node.get("role", "")
                label = f"{node_name}\\n({role})" if role else node_name
                line(f'  {node["id"]}["{label}"]')
            line("  End([\u7ed3\u675f])")
            line("  " + " --> ".join(["Start"] + [node["id"] for node in nodes] + ["End"]))
            line("```")
            line()

            for node in nodes:
                line(f"#### {node['id']}. {node.get('name', '')}\uff08\u89d2\u8272\uff1a{node.get('role', '')}\uff09")
                line()
                if node.get("repeatable"):
                    line("> \u21ba \u53ef\u91cd\u590d\u8282\u70b9")
                    line()

                user_steps = node.get("userSteps", [])
                if user_steps:
                    line("##### \u7528\u6237\u64cd\u4f5c\u6b65\u9aa4")
                    line()
                    line("| # | \u7528\u6237\u64cd\u4f5c\u6b65\u9aa4 | \u7c7b\u578b | \u6761\u4ef6/\u5907\u6ce8 |")
                    line("|---|--------------|------|-----------|")
                    for index, step in enumerate(user_steps, start=1):
                        step_type = STEP_LABELS.get(step.get("type", ""), step.get("type", ""))
                        line(
                            f"| {index} | {step.get('name', '')} | {step_type} | {step.get('note', '')} |"
                        )
                    line()

                orchestration_tasks = node.get("orchestrationTasks", [])
                if orchestration_tasks:
                    line("##### \u7f16\u6392\u4efb\u52a1")
                    line()
                    line("| # | \u7f16\u6392\u4efb\u52a1 | \u7c7b\u578b | \u67e5\u8be2\u6765\u6e90 | \u76ee\u6807 | \u5907\u6ce8 |")
                    line("|---|----------|------|----------|------|------|")
                    for index, task in enumerate(orchestration_tasks, start=1):
                        task_type = ORCHESTRATION_TYPE_LABELS.get(task.get("type", ""), task.get("type", ""))
                        query_source_kind = QUERY_SOURCE_KIND_LABELS.get(
                            task.get("querySourceKind", ""), task.get("querySourceKind", "")
                        )
                        line(
                            f"| {index} | {task.get('name', '')} | {task_type} | {query_source_kind} | {task.get('target', '')} | {task.get('note', '')} |"
                        )
                    line()

                entity_ops = node.get("entity_ops", [])
                if entity_ops:
                    rendered_ops = []
                    for entity_op in entity_ops:
                        entity = entities_by_id.get(entity_op.get("entity_id", ""), {})
                        entity_name = entity.get("name") or entity_op.get("entity_id", "")
                        ops = ",".join(entity_op.get("ops", []))
                        rendered_ops.append(f"{entity_name}\uff08{ops}\uff09")
                    line(f"**\u6d89\u53ca\u5b9e\u4f53**: {', '.join(rendered_ops)}")
                    line()

                if node.get("rules_note", "").strip():
                    line(f"**\u4e1a\u52a1\u89c4\u5219**: {node['rules_note']}")
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
