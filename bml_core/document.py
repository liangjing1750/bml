from __future__ import annotations

from copy import deepcopy


DEFAULT_PROCESS_NAME = "主流程"
DEFAULT_ROLE_NAME = "新角色"

STEP_TYPE_ALIASES = {
    "validate": "Check",
    "check": "Check",
    "query": "Query",
    "fill": "Fill",
    "select": "Select",
    "calculate": "Compute",
    "compute": "Compute",
    "change": "Mutate",
    "mutate": "Mutate",
}

FIELD_TYPE_ALIASES = {
    "string": "string",
    "str": "string",
    "text": "text",
    "longtext": "text",
    "number": "number",
    "int": "number",
    "integer": "number",
    "decimal": "decimal",
    "float": "decimal",
    "date": "date",
    "datetime": "datetime",
    "timestamp": "datetime",
    "boolean": "boolean",
    "bool": "boolean",
    "enum": "enum",
    "id": "id",
}

ROLE_STATUS_ALIASES = {
    "active": "active",
    "enabled": "active",
    "inactive": "disabled",
    "disabled": "disabled",
}


def create_empty_document(name: str) -> dict:
    return {
        "meta": {"title": name, "domain": "", "author": "", "date": ""},
        "roles": [],
        "language": [],
        "processes": [
            {"id": "P1", "name": DEFAULT_PROCESS_NAME, "trigger": "", "outcome": "", "tasks": []}
        ],
        "entities": [],
        "relations": [],
        "rules": [],
    }


def normalize_step_type(step_type: str) -> str:
    if not step_type:
        return ""
    return STEP_TYPE_ALIASES.get(step_type.strip().casefold(), step_type)


def normalize_field_type(field_type: str) -> str:
    if not field_type:
        return "string"
    return FIELD_TYPE_ALIASES.get(field_type.strip().casefold(), field_type.casefold())


def normalize_role_name(role_name: str) -> str:
    return str(role_name or "").strip()


def normalize_role_status(role_status: str) -> str:
    if not role_status:
        return "active"
    return ROLE_STATUS_ALIASES.get(str(role_status).strip().casefold(), "active")


def _normalize_text_list(values: list[str] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = normalize_role_name(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _next_role_id(existing_roles: list[dict]) -> str:
    used = {normalize_role_name(role.get("id", "")) for role in existing_roles if isinstance(role, dict)}
    index = 1
    while f"R{index}" in used:
        index += 1
    return f"R{index}"


def _normalize_role(raw_role, existing_roles: list[dict]) -> dict | None:
    if isinstance(raw_role, dict):
        role_name = normalize_role_name(raw_role.get("name", ""))
        if not role_name:
            return None
        role_id = normalize_role_name(raw_role.get("id", "")) or _next_role_id(existing_roles)
        if any(existing.get("id") == role_id for existing in existing_roles):
            role_id = _next_role_id(existing_roles)
        return {
            "id": role_id,
            "name": role_name,
            "desc": normalize_role_name(raw_role.get("desc", "")),
            "status": normalize_role_status(raw_role.get("status", "")),
            "subDomains": _normalize_text_list(raw_role.get("subDomains", [])),
            "tags": _normalize_text_list(raw_role.get("tags", [])),
        }

    role_name = normalize_role_name(raw_role)
    if not role_name:
        return None
    return {
        "id": _next_role_id(existing_roles),
        "name": role_name,
        "desc": "",
        "status": "active",
        "subDomains": [],
        "tags": [],
    }


def _merge_role(target: dict, source: dict) -> dict:
    if not target.get("desc") and source.get("desc"):
        target["desc"] = source["desc"]
    if source.get("status") == "disabled":
        target["status"] = "disabled"
    target["subDomains"] = _normalize_text_list([*target.get("subDomains", []), *source.get("subDomains", [])])
    target["tags"] = _normalize_text_list([*target.get("tags", []), *source.get("tags", [])])
    return target


def _ensure_role(
    roles: list[dict],
    roles_by_id: dict[str, dict],
    roles_by_name: dict[str, dict],
    *,
    role_id: str = "",
    role_name: str = "",
) -> dict | None:
    normalized_id = normalize_role_name(role_id)
    normalized_name = normalize_role_name(role_name)

    if normalized_id and normalized_id in roles_by_id:
        role = roles_by_id[normalized_id]
        if normalized_name and role["name"] != normalized_name:
            roles_by_name.pop(role["name"], None)
            role["name"] = normalized_name
            roles_by_name[normalized_name] = role
        return role

    if normalized_name and normalized_name in roles_by_name:
        role = roles_by_name[normalized_name]
        if normalized_id:
            roles_by_id[normalized_id] = role
        return role

    if not normalized_name:
        return None

    role = _normalize_role({"id": normalized_id, "name": normalized_name}, roles)
    if not role:
        return None
    roles.append(role)
    roles_by_id[role["id"]] = role
    roles_by_name[role["name"]] = role
    return role


def migrate_document(document: dict | None) -> dict:
    doc = deepcopy(document or {})
    meta = doc.setdefault("meta", {})

    if "process" in doc and "processes" not in doc:
        legacy_process = doc.pop("process") or {}
        doc["processes"] = [
            {
                "id": "P1",
                "name": legacy_process.get("name", DEFAULT_PROCESS_NAME),
                "subDomain": legacy_process.get("subDomain", ""),
                "trigger": legacy_process.get("trigger", ""),
                "outcome": legacy_process.get("outcome", ""),
                "tasks": legacy_process.get("tasks", []),
            }
        ]

    meta.setdefault("title", "")
    meta.setdefault("domain", "")
    meta.setdefault("author", "")
    meta.setdefault("date", "")
    meta.pop("bounded_context", None)

    doc.setdefault("roles", [])
    doc.setdefault("language", [])
    doc.setdefault("processes", [])
    doc.setdefault("entities", [])
    doc.setdefault("relations", [])
    doc.setdefault("rules", [])

    normalized_roles: list[dict] = []
    roles_by_id: dict[str, dict] = {}
    roles_by_name: dict[str, dict] = {}
    for raw_role in doc["roles"]:
        role = _normalize_role(raw_role, normalized_roles)
        if not role:
            continue
        existing_role = roles_by_name.get(role["name"])
        if existing_role:
            _merge_role(existing_role, role)
            continue
        normalized_roles.append(role)
        roles_by_id[role["id"]] = role
        roles_by_name[role["name"]] = role
    doc["roles"] = normalized_roles

    for process_index, process in enumerate(doc["processes"], start=1):
        process.setdefault("id", f"P{process_index}")
        process.setdefault("name", DEFAULT_PROCESS_NAME if process_index == 1 else f"流程{process_index}")
        process.setdefault("trigger", "")
        process.setdefault("outcome", "")
        process.setdefault("tasks", [])
        process.setdefault("subDomain", "")

        for task_index, task in enumerate(process["tasks"], start=1):
            task.setdefault("id", f"T{task_index}")
            task.setdefault("name", "")
            task_role_name = normalize_role_name(task.get("role", ""))
            task_role = _ensure_role(
                normalized_roles,
                roles_by_id,
                roles_by_name,
                role_id=task.get("role_id", ""),
                role_name=task_role_name,
            )
            if task_role:
                task["role_id"] = task_role["id"]
                task["role"] = task_role["name"]
                process_sub_domain = normalize_role_name(process.get("subDomain", ""))
                if process_sub_domain and process_sub_domain not in task_role["subDomains"]:
                    task_role["subDomains"].append(process_sub_domain)
            else:
                task["role_id"] = ""
                task["role"] = task_role_name
            task.setdefault("repeatable", False)
            task.setdefault("steps", [])
            task.setdefault("entity_ops", [])
            task.setdefault("rules_note", "")

            for step in task["steps"]:
                step.setdefault("name", "")
                step.setdefault("note", "")
                step["type"] = normalize_step_type(step.get("type", ""))

            for entity_op in task["entity_ops"]:
                entity_op.setdefault("entity_id", "")
                entity_op["ops"] = list(entity_op.get("ops", []))

    for entity_index, entity in enumerate(doc["entities"], start=1):
        entity.setdefault("id", f"E{entity_index}")
        entity.setdefault("name", "")
        entity.setdefault("group", "")
        entity.setdefault("note", "")
        entity.setdefault("fields", [])

        for field in entity["fields"]:
            is_key = bool(field.pop("pk", field.get("is_key", False)))
            is_status = bool(field.pop("status", field.get("is_status", False)))
            field.setdefault("name", "")
            field.setdefault("note", "")
            field["type"] = normalize_field_type(field.get("type", "string"))
            field["is_key"] = is_key
            field["is_status"] = is_status

    for relation in doc["relations"]:
        relation.setdefault("from", "")
        relation.setdefault("to", "")
        relation.setdefault("type", "")
        relation.setdefault("label", "")

    for rule in doc["rules"]:
        rule.setdefault("name", "")
        rule.setdefault("type", "")
        rule.setdefault("applies_to", "")
        rule.setdefault("description", "")
        rule.setdefault("formula", "")

    for item in doc["language"]:
        item.setdefault("term", "")
        item.setdefault("definition", "")

    return doc
