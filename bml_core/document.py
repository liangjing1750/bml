from __future__ import annotations

from copy import deepcopy


DEFAULT_PROCESS_NAME = "主流程"

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


def migrate_document(document: dict | None) -> dict:
    doc = deepcopy(document or {})
    meta = doc.setdefault("meta", {})

    if "process" in doc and "processes" not in doc:
        legacy_process = doc.pop("process") or {}
        doc["processes"] = [
            {
                "id": "P1",
                "name": legacy_process.get("name", DEFAULT_PROCESS_NAME),
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

    for process_index, process in enumerate(doc["processes"], start=1):
        process.setdefault("id", f"P{process_index}")
        process.setdefault("name", DEFAULT_PROCESS_NAME if process_index == 1 else f"流程{process_index}")
        process.setdefault("trigger", "")
        process.setdefault("outcome", "")
        process.setdefault("tasks", [])

        for task_index, task in enumerate(process["tasks"], start=1):
            task.setdefault("id", f"T{task_index}")
            task.setdefault("name", "")
            task.setdefault("role", "")
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

