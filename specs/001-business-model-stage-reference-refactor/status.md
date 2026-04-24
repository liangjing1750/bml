# Status

## 本轮完成

- 已完成前端阶段视图切换：阶段详情图不再以 `process.stageId` 作为主驱动，而是基于 `stageFlowRefs / stageFlowLinks` 渲染阶段成员与阶段内流程连线。
- 已完成“加入已有流程 / 新建并加入”的阶段成员管理交互，阶段详情中新增已有流程时只会新增流程引用，不会复制流程实体。
- 已支持同一流程被多个阶段引用；流程详情页改为展示“业务阶段引用”列表，不再提供旧的单阶段下拉编辑入口。
- 已补齐“按阶段浏览 / 按子域浏览”双视角切换：从阶段视图打开流程后，侧边栏会切回 `子域 -> 流程组 -> 流程` 的流程库视角，并定位当前流程。
- 已完成预览、导出、合并、保存对新结构的支持：Markdown/预览中的阶段与流程关系都已切到引用模型。
- 已清理阶段视图中不再合理的旧交互与文案，包括流程详情中的旧单阶段编辑入口与阶段抽屉中的残留乱码提示。
- 已补充自动化回归与截图验收，覆盖“阶段加入已有流程”“同一流程多阶段复用”“从阶段视图进入流程详情后显示引用列表”三条金路径。

## 当前状态

- 本 spec 的目标模型已经落地到端到端主链路：`业务子域管理流程归属，业务阶段管理流程引用`。
- 代码层处于“新结构主驱动、旧字段兼容保留”状态：
  - `stageFlowRefs / stageFlowLinks` 已是阶段视图、预览导出与合并校验的主结构
  - `process.stageId / stage.processLinks` 仍保留为兼容字段，用于旧文档迁移和短期双模型并存
- 前端界面口径已经与目标模型一致：流程详情展示的是阶段引用，而不是“流程只属于一个阶段”。

## 验证结果

### 自动化回归

- `python -m unittest tests.test_backend tests.test_merge_and_storage tests.test_frontend_structure`
- `node --check app/app.js`
- `node --check app/preview.js`
- `node --check app/process.js`
- `node --check app/render.js`
- `node --check app/state.js`
- `node --check tools/e2e/tests/process-stage-view.spec.js`
- `python -m py_compile blm_core/document.py blm_core/markdown.py blm_core/merge.py`

### 截图验收

- 阶段详情页加入已有流程前：
  - `tools/e2e/.tmp/manual-stage-refactor-shots-4/01-stage-s2-before-join.png`
- 阶段详情页加入已有流程后：
  - `tools/e2e/.tmp/manual-stage-refactor-shots-4/02-stage-s2-after-join.png`
- 流程详情页显示多阶段引用：
  - `tools/e2e/.tmp/manual-stage-refactor-shots-4/03-process-p2-stage-refs.png`
- 预览页业务阶段章节：
  - `tools/e2e/.tmp/manual-stage-refactor-shots-4/04-preview-stage-section.png`

### 真实链路结果

- 同一条金路径下，加入已有流程后流程实体数量保持为 `3`，没有复制流程实体。
- 阶段引用关系变为：
  - `S1:P1`
  - `S1:P2`
  - `S2:P3`
  - `S2:P2`
- 流程详情页已显示 `预约阶段 / 办理阶段` 两个引用 chip。
- 页面中已不存在旧的 `proc-stage-select` 单阶段下拉。
- 从阶段视图打开流程后，侧边栏已切到按子域浏览，阶段树不再继续占用流程详情导航。

## 风险与备注

- 兼容字段仍在：
  - `process.stageId`
  - `stage.processLinks`
  这些字段目前不会再驱动新 UI，但仍用于兼容旧文档和迁移期双模型并存。
- `workspace/` 下已有的业务文档数据，本轮没有自动批量重写为纯引用结构；当前依赖加载时兼容映射来运行。
- 如果后续要做“彻底退役 legacy 字段”，建议单独再开一个迁移 spec，而不要在这轮功能重构里顺手混做。

## 下一步

- 本 spec 的研发切片已经完成，下一步不再是结构性重构，而是基于新模型做产品打磨。
- 可优先考虑的后续方向：
  - 阶段/子域双视角下的交互细节优化
  - 流程被多个阶段引用时的可视化说明增强
  - 批量迁移历史业务文档到纯引用结构

## 交接提示

- 若后续继续演进，请先读本 spec 的 `requirements.md`、`design.md` 与 `journeys/`，再进入代码。
- 当前可以把这轮重构视为“结构完成、进入产品打磨期”的稳定基线。
