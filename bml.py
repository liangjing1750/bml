#!/usr/bin/env python3
"""
BML - Business Modeling Language Tool
用法: python bml.py
"""
import http.server
import json
import threading
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, unquote

PORT = 8765
ROOT = Path(__file__).parent
APP  = ROOT / "app"
WS   = ROOT / "workspace"
WS.mkdir(exist_ok=True)

# ─── 中文标签映射 ─────────────────────────────
STEP_LABELS = {
    'Query': '查询', 'Check': '校验', 'Fill': '填写',
    'Select': '选择', 'Compute': '计算', 'Mutate': '变更'
}
FIELD_LABELS = {
    'string': '字符', 'number': '数值', 'decimal': '金额',
    'date': '日期', 'datetime': '日期时间', 'boolean': '布尔',
    'enum': '枚举', 'text': '长文本', 'id': '标识ID'
}
RULE_LABELS = {
    'StepRule': '步骤规则', 'DataRule': '数据规则', 'ComputeRule': '计算规则'
}


def empty_doc(name):
    return {
        "meta":      {"title": name, "domain": "", "author": "", "date": ""},
        "roles":     [],
        "language":  [],
        "processes": [
            {"id": "P1", "name": "主流程", "trigger": "", "outcome": "", "tasks": []}
        ],
        "entities":  [],
        "relations": [],
        "rules":     []
    }


def migrate_doc(doc):
    """向后兼容：将旧格式（单 process）迁移为新格式（processes 数组）"""
    if "process" in doc and "processes" not in doc:
        old = doc.pop("process")
        doc["processes"] = [{"id": "P1",
                              "name":    old.get("name", "主流程"),
                              "trigger": old.get("trigger", ""),
                              "outcome": old.get("outcome", ""),
                              "tasks":   old.get("tasks", [])}]
    if "processes"  not in doc: doc["processes"]  = []
    if "roles"      not in doc: doc["roles"]      = []
    if "relations"  not in doc: doc["relations"]  = []
    if "rules"      not in doc: doc["rules"]      = []
    if "entities"   not in doc: doc["entities"]   = []
    if "language"   not in doc: doc["language"]   = []
    # 清理旧字段
    doc.get("meta", {}).pop("bounded_context", None)
    return doc


def build_md(doc):
    doc = migrate_doc(dict(doc))   # 只用副本，不改原始数据
    L = []
    m = doc.get("meta", {})
    nums = ["一", "二", "三", "四", "五", "六", "七", "八"]
    sec = [0]

    def nxt():
        n = nums[sec[0]]; sec[0] += 1; return n

    def line(s=""): L.append(s)
    def sep():      L.extend(["---", ""])

    # 标题
    line(f"# {m.get('title') or '未命名'}"); line()
    parts = [(k, v) for k, v in [
        ("业务域", m.get("domain", "")),
        ("作者",   m.get("author", "")),
        ("日期",   m.get("date",   "")),
    ] if v]
    if parts:
        line(" | ".join(f"**{k}**: {v}" for k, v in parts)); line()
    sep()

    # 角色
    roles = doc.get("roles", [])
    if roles:
        line(f"## {nxt()}、角色"); line()
        line("| 角色 |"); line("|------|")
        for r in roles:
            line(f"| {r} |")
        line(); sep()

    # 统一语言
    terms = doc.get("language", [])
    if terms:
        line(f"## {nxt()}、统一语言"); line()
        line("| 术语 | 定义 |"); line("|------|------|")
        for t in terms:
            line(f"| {t.get('term','')} | {t.get('definition','')} |")
        line(); sep()

    # 流程建模
    processes = doc.get("processes", [])
    emap = {e["id"]: e for e in doc.get("entities", [])}
    line(f"## {nxt()}、流程建模"); line()

    for proc in processes:
        tasks = proc.get("tasks", [])
        line(f"### {proc.get('id','P')}: {proc.get('name','')}")
        line()
        if proc.get("trigger") or proc.get("outcome"):
            line(f"**触发**: {proc.get('trigger','—')}  →  **预期结果**: {proc.get('outcome','—')}")
            line()

        if tasks:
            # Mermaid 流程图
            line("```mermaid")
            line("flowchart LR")
            line("  Start([开始])")
            for t in tasks:
                name = t.get("name", "").replace('"', "'")
                role = t.get("role", "")
                lbl = f"{name}\\n({role})" if role else name
                line(f'  {t["id"]}["{lbl}"]')
            line("  End([结束])")
            line("  " + " --> ".join(["Start"] + [t["id"] for t in tasks] + ["End"]))
            line("```"); line()

            for t in tasks:
                line(f"#### {t['id']}. {t.get('name','')}（角色：{t.get('role','')}）"); line()
                steps = t.get("steps", [])
                if steps:
                    line("| # | 步骤 | 类型 | 条件/备注 |"); line("|---|------|------|----------|")
                    for i, s in enumerate(steps, 1):
                        lbl  = STEP_LABELS.get(s.get("type",""), s.get("type",""))
                        note = s.get("note","")
                        line(f"| {i} | {s.get('name','')} | {lbl} | {note} |")
                    line()
                eops = t.get("entity_ops", [])
                if eops:
                    parts2 = []
                    for eo in eops:
                        e = emap.get(eo.get("entity_id",""), {})
                        ename = e.get("name") or eo.get("entity_id","")
                        ops = ",".join(eo.get("ops",[]))
                        parts2.append(f"{ename}（{ops}）")
                    line(f"**涉及实体**: {', '.join(parts2)}"); line()
                rules_note = t.get("rules_note", "").strip()
                if rules_note:
                    line(f"**业务规则**: {rules_note}"); line()
        line()
    sep()

    # 数据建模
    entities  = doc.get("entities", [])
    relations = doc.get("relations", [])
    if entities:
        line(f"## {nxt()}、数据建模"); line()

        # 始终生成实体关系图（有无关系线都渲染节点）
        line("```mermaid"); line("flowchart LR")
        for e in entities:
            n = e.get("name","").replace('"',"'") or e.get("id","")
            line(f'  {e["id"]}["{n}"]')
        rel_lbl = {"1:1": "1对1", "1:N": "1对多", "N:N": "多对多"}
        for r in relations:
            lbl = rel_lbl.get(r.get("type",""), r.get("type",""))
            if r.get("label"): lbl += f"\\n{r['label']}"
            line(f'  {r.get("from","")} -- "{lbl}" --> {r.get("to","")}')
        line("```"); line()

        for e in entities:
            line(f"### 实体：{e.get('name','')}"); line()
            fields = e.get("fields", [])
            if fields:
                line("| 字段 | 类型 | 主键 | 状态字段 | 公式/约束 |")
                line("|------|------|------|---------|---------|")
                for f in fields:
                    flbl = FIELD_LABELS.get(f.get("type",""), f.get("type",""))
                    pk   = "✓" if f.get("is_key")    else ""
                    st   = "✓" if f.get("is_status") else ""
                    note = f.get("note","")
                    line(f"| {f.get('name','')} | {flbl} | {pk} | {st} | {note} |")
                line()
        sep()

    # 规则建模
    rules = doc.get("rules", [])
    if rules:
        line(f"## {nxt()}、规则建模"); line()
        line("| 规则名 | 类型 | 绑定对象 | 描述 | 公式 |")
        line("|--------|------|---------|------|------|")
        for r in rules:
            rlbl = RULE_LABELS.get(r.get("type",""), r.get("type",""))
            line(f"| {r.get('name','')} | {rlbl} | {r.get('applies_to','')} | {r.get('description','')} | {r.get('formula','')} |")
        line()

    return "\n".join(L)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(APP), **kw)

    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/files":
            return self._json(sorted(f.stem for f in WS.glob("*.json")))
        if p.startswith("/api/load/"):
            name = unquote(p[len("/api/load/"):])
            fp = WS / f"{name}.json"
            if fp.exists():
                doc = migrate_doc(json.loads(fp.read_text("utf-8")))
                return self._json(doc)
            return self._json({"error": "not found"}, 404)
        if p.startswith("/api/export/"):
            name = unquote(p[len("/api/export/"):])
            fp = WS / f"{name}.json"
            if fp.exists():
                return self._text(build_md(json.loads(fp.read_text("utf-8"))))
            return self._json({"error": "not found"}, 404)
        super().do_GET()

    def do_POST(self):
        p = urlparse(self.path).path
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

        if p.startswith("/api/save/"):
            name = unquote(p[len("/api/save/"):])
            doc = json.loads(body)
            (WS / f"{name}.json").write_text(
                json.dumps(doc, ensure_ascii=False, indent=2), "utf-8")
            (WS / f"{name}.md").write_text(build_md(doc), "utf-8")
            return self._json({"ok": True})

        if p == "/api/new":
            data = json.loads(body)
            name = data.get("name", "").strip()
            if not name:
                return self._json({"error": "名称不能为空"}, 400)
            fp = WS / f"{name}.json"
            if fp.exists():
                return self._json({"error": "已存在同名文档"}, 400)
            fp.write_text(
                json.dumps(empty_doc(name), ensure_ascii=False, indent=2), "utf-8")
            return self._json({"ok": True})

        if p.startswith("/api/delete/"):
            name = unquote(p[len("/api/delete/"):])
            (WS / f"{name}.json").unlink(missing_ok=True)
            (WS / f"{name}.md").unlink(missing_ok=True)
            return self._json({"ok": True})

        self._json({"error": "not found"}, 404)

    def _json(self, d, code=200):
        b = json.dumps(d, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(b))
        self.end_headers()
        self.wfile.write(b)

    def _text(self, s, code=200):
        b = s.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", len(b))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    srv = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"BML Tool 已启动: {url}")
    print(f"文档目录: {WS}")
    print("按 Ctrl+C 退出\n")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出")
