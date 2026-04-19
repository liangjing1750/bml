# BML

> Business Modeling Language，一个用结构化方式沉淀业务理解的本地建模工具。

## 项目结构

```text
bml/
├── bml.py          # Python 后端：静态服务、文件读写、Markdown 导出
├── bml.sh          # 启停辅助脚本
├── README.md
├── app/
│   ├── index.html  # 单页应用入口
│   ├── app.js      # 前端交互与建模逻辑
│   └── style.css   # 页面样式
├── workspace/      # 本地业务模型文档，JSON/MD 形式存放
└── docs/           # 示例文档、截图与说明材料
```

## 这是什么

BML 的目标不是替代需求文档，而是把分散在会议纪要、口头描述、Word、Visio、Markdown 里的业务知识，整理成一份结构化模型。

它重点关注三类信息：

- 业务流程：业务是怎么跑的，谁来执行，结果是什么
- 数据实体：业务操作的是什么数据，实体之间是什么关系
- 统一语言：关键业务术语如何定义，避免多人理解不一致

在 BML 里，这些信息会被组织成 `roles`、`language`、`processes`、`entities`、`relations` 等结构，最终保存为 JSON，并可导出为 Markdown。

## 快速开始

依赖：`Python 3.8+`

```bash
cd bml
python bml.py
```

默认启动后访问：

```text
http://127.0.0.1:8888/
```

使用流程：

1. 新建业务文档
2. 填写业务域、角色、统一语言
3. 建模流程、任务、步骤和业务规则
4. 建模实体、字段和实体关系
5. 预览并导出 Markdown

## 核心建模对象

### Process

业务流程，由一组有顺序的任务组成。每个流程通常包含：

- `id`
- `name`
- `trigger`
- `outcome`
- `tasks`

### Task

任务表示一个角色连续执行的一段业务动作。每个任务通常包含：

- `id`
- `name`
- `role`
- `repeatable`
- `steps`
- `entity_ops`
- `rules_note`

### Step

步骤是任务内部更细的动作单元，常见类型包括：

- `Query`
- `Check`
- `Fill`
- `Select`
- `Compute`
- `Mutate`

### Entity

实体表示业务中的核心数据对象，通常包含：

- `id`
- `name`
- `group`
- `note`
- `fields`

字段类型支持：

- `string`
- `number`
- `decimal`
- `date`
- `datetime`
- `boolean`
- `enum`
- `text`
- `id`

### Relation

实体之间的关系，支持：

- `1:1`
- `1:N`
- `N:N`

### Ubiquitous Language

统一语言用于描述核心业务术语及其定义，减少沟通歧义。

## JSON 结构示例

```json
{
  "meta": {
    "domain": "库存管理",
    "title": "库存管理",
    "author": "LJ",
    "date": "2026-04"
  },
  "roles": ["仓库管理员", "系统"],
  "language": [
    { "term": "入库单", "definition": "记录一次入库业务的单据" }
  ],
  "processes": [
    {
      "id": "P1",
      "name": "入库",
      "trigger": "采购到货",
      "outcome": "库存增加",
      "tasks": [
        {
          "id": "T1",
          "name": "登记入库",
          "role": "仓库管理员",
          "repeatable": false,
          "steps": [
            {
              "name": "扫描物料编码",
              "type": "Query",
              "note": ""
            }
          ],
          "entity_ops": [
            {
              "entity_id": "E1",
              "ops": ["R", "U"]
            }
          ],
          "rules_note": "必须校验物料是否存在"
        }
      ]
    }
  ],
  "entities": [
    {
      "id": "E1",
      "name": "库存",
      "group": "仓储",
      "note": "库存余额",
      "fields": [
        {
          "name": "库存ID",
          "type": "id",
          "is_key": true,
          "is_status": false,
          "note": ""
        }
      ]
    }
  ],
  "relations": [
    {
      "from": "E1",
      "to": "E2",
      "type": "1:N",
      "label": "关联"
    }
  ]
}
```

## 适合的使用场景

- 需求澄清后，把业务理解沉淀成结构化模型
- 项目前期做领域梳理、流程梳理、实体梳理
- 为后续 DDD、测试设计、AI 辅助分析提供标准化输入
- 把零散文档统一到一个可维护的 JSON 模型

## 当前能力

- 本地单页建模界面
- 流程、任务、步骤编辑
- 实体、字段、关系编辑
- 流程图和实体关系图可视化
- Markdown 预览与导出
- 本地 `workspace/` 文档存储

## 后续规划

- 增强 schema 兼容与历史数据迁移能力
- 优化 Markdown 导出的一致性与可读性
- 为后续 DDD Agent、BDD Agent 提供更稳定的结构化输入
- 补充测试、校验和工程化能力，降低回归风险
