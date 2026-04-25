# Status

## 本轮完成

- 已完成前端阶段视图切换：阶段详情图不再以 `process.stageId` 作为主驱动，而是基于 `stageFlowRefs / stageFlowLinks` 渲染阶段成员与阶段内流程连线。
- 已完成“加入已有流程 / 新建并加入”的阶段成员管理交互，阶段详情中新增已有流程时只会新增流程引用，不会复制流程实体。
- 已支持同一流程被多个阶段引用；流程详情页改为展示“业务阶段引用”列表，不再提供旧的单阶段下拉编辑入口。
- 已补齐“按阶段浏览 / 按子域浏览”双视角切换：从阶段视图打开流程后，侧边栏会切回 `子域 -> 流程组 -> 流程` 的流程库视角，并定位当前流程。
- 已完成预览、导出、合并、保存对新结构的支持：Markdown/预览中的阶段与流程关系都已切到引用模型。
- 已清理阶段视图中不再合理的旧交互与文案，包括流程详情中的旧单阶段编辑入口与阶段抽屉中的残留乱码提示。
- 已补充自动化回归与截图验收，覆盖“阶段加入已有流程”“同一流程多阶段复用”“从阶段视图进入流程详情后显示引用列表”三条金路径。
- 已完成一轮产品打磨：业务域页新增术语表快捷操作、单图版 DDD 子域地图，以及左侧流程目录的显式浏览模式切换按钮。
- 已删除业务域页中冗长的逐行子域分类区，核心域/通用域切换改为直接在业务域图中的子域卡片上完成。
- 已补一个底层稳态修复：空工作区首次打开时，即使 `.trash` 目录不存在，列表接口也能正常返回空结果，不再影响临时环境验收。
- 已继续压业务域页信息密度：子域节点改为更紧凑的卡片，只保留 `流程 / 角色` 统计，移除了不合适的“阶段统计”。
- 已将左侧流程目录的模式切换收敛为两个显式按钮：`子域视角 / 阶段视角`，不再自动跟随右侧视图。
- 已修复首个业务子域与首个流程组的小三角点击异常：三角按钮现在直接绑定折叠/展开动作，不再依赖父容器冒泡。
- 已将业务域图并入“业务域信息”卡片，不再保留单独的“业务子域地图”标题与说明文字。
- 已把业务域图从固定圆角区域框改为曲线路径分隔的地图式表达，减少大量子域时的遮挡感。
- 已修正业务域图主分隔线：去掉居中“业务域”文字，橙色主线只作为核心/通用区域边界，不再穿过标题或横扫画布。
- 已继续收敛业务域图表达：删除大椭圆轮廓和误用的固定灰色虚线，子域节点不再重复展示“核心域/通用域”，改为点击子域切换归类，并用节点旁虚线表达子域之间的分隔。
- 已删除业务域图的波浪分隔线，改用左右区域底色表达核心/通用视角；同时压缩域图高度并加深核心子域区域颜色，让角色区域更容易进入同屏。
- 已修正业务域图中间空带：左右区域改为真实两列网格铺色，核心/通用底色直接铺满到中线，不再依赖绝对定位叠在渐变背景上。
- 已按新的颜色语义调整业务域图：核心子域使用蓝色，通用子域使用绿色，并补充 E2E 断言防止颜色语义回退。

## 当前状态

- 本 spec 的目标模型已经落地到端到端主链路：`业务子域管理流程归属，业务阶段管理流程引用`。
- 代码层处于“新结构主驱动、旧字段兼容保留”状态：
  - `stageFlowRefs / stageFlowLinks` 已是阶段视图、预览导出与合并校验的主结构
  - `process.stageId / stage.processLinks` 仍保留为兼容字段，用于旧文档迁移和短期双模型并存
- 前端界面口径已经与目标模型一致：流程详情展示的是阶段引用，而不是“流程只属于一个阶段”。

## 验证结果

### 自动化回归

- `python -m unittest tests.test_backend tests.test_merge_and_storage tests.test_frontend_structure`
- `python -m unittest tests.test_backend.WorkspaceStorageTests.test_list_trash_returns_empty_when_trash_dir_missing tests.test_frontend_structure`
- `node --check app/app.js`
- `node --check app/domain.js`
- `node --check app/preview.js`
- `node --check app/process.js`
- `node --check app/render.js`
- `node --check app/state.js`
- `node --check tools/e2e/tests/process-stage-view.spec.js`
- `node --check tools/e2e/tests/domain-modeling.spec.js`
- `tools/e2e/node_modules/.bin/playwright.cmd test --config tools/e2e/.tmp/playwright.domain-modeling.local.config.js domain-modeling.spec.js`
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
- 业务域页单图版 DDD 地图与一屏概览：
  - `tools/e2e/.tmp/manual-domain-ux-shots/01-domain-overview.png`
- 统一语言术语表快捷操作：
  - `tools/e2e/.tmp/manual-domain-ux-shots/02-language-quick-actions.png`
- 图内切换子域分类后的业务域图：
  - `tools/e2e/.tmp/manual-domain-ux-shots/03-domain-map-reclassified.png`
- 左侧流程目录显式切换按钮：
  - `tools/e2e/.tmp/manual-domain-ux-shots/04-sidebar-explicit-switch.png`
- 业务域页压缩后的单图版：
  - `tools/e2e/.tmp/manual-domain-ux-shots-v2/01-domain-overview-compact.png`
- 图内切换子域归类后的紧凑视图：
  - `tools/e2e/.tmp/manual-domain-ux-shots-v2/02-domain-reclassified-compact.png`
- 左侧目录收敛为两种手动视角后的截图：
  - `tools/e2e/.tmp/manual-domain-ux-shots-v2/03-sidebar-two-modes.png`
- 业务域信息卡内嵌曲线分隔地图：
  - `tools/e2e/.tmp/manual-domain-curve-shots/01-domain-info-with-curve-map.png`
- 去矩形卡片后的业务域曲线地图：
  - `tools/e2e/.tmp/manual-domain-curve-shots-v2/01-domain-info-with-curve-map-v2.png`
- 修正主分隔线后的业务域曲线地图：
  - `tools/e2e/.tmp/manual-domain-curve-shots-v4/01-domain-info-with-curve-map-v4.png`
- 10 个子域场景下的去椭圆、点击切换、虚线分隔版业务域图：
  - `tools/e2e/.tmp/manual-domain-curve-shots-v7/01-domain-map-10-subdomains-v7.png`
- 压缩高度、去波浪线并强化核心区颜色后的业务域图：
  - `tools/e2e/.tmp/manual-domain-curve-shots-v8/01-domain-map-compact-no-wave-v8.png`
- 两列区域铺满中线后的业务域图：
  - `tools/e2e/.tmp/manual-domain-curve-shots-v9/01-domain-map-filled-middle-v9.png`
- 核心蓝、通用绿后的业务域图：
  - `tools/e2e/.tmp/manual-domain-curve-shots-v10/01-domain-map-core-blue-generic-green-v10.png`

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
- 业务域页在 `1600x1080` 视口下，已能同时看到：
  - 业务域图
  - 角色全局卡片
  - 折叠态统一语言卡片
- 图内切换 `用户管理` 到核心域后，核心域区域已出现该子域，通用域区域则变为空。
- 统一语言术语表首行已具备 `+ / ↑ / ↓ / ✕` 四个统一样式快捷按钮。
- 左侧流程目录已收敛为 `子域视角 / 阶段视角` 两种显式切换方式，且默认保持手动，不再自动跟随。
- 业务域图中的子域节点已不再展示“阶段”统计，避免误导“阶段是子域子集”的错误认知。
- 业务域图已并入“业务域信息”卡，页面上不再出现单独的“业务子域地图”标题。
- 业务域图中的子域已去掉矩形卡片外观，改为曲线地图中的文字节点与轻量分类链接。
- 业务域图主分隔线已回到核心/通用两块之间，截图确认不再压住“业务域”标题，也不再像装饰折线。
- 业务域图已不再渲染大椭圆和每个子域内的分类按钮；分类归属由区域位置表达，点击子域节点即可切换核心/通用归类。
- 业务域图已不再渲染 SVG 波浪线，10 个子域场景下角色管理区域可以稳定出现在首屏中段。
- 业务域图左右区域已改为网格布局，截图确认中间不再露出空白区域，核心区颜色更明确。
- 业务域图颜色语义已调整为核心蓝、通用绿，自动化已校验两个区域标签的颜色值。

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
  - 继续压缩业务域页顶部信息密度，让域图与角色卡在更小视口下也能稳定一屏

## 交接提示

- 若后续继续演进，请先读本 spec 的 `requirements.md`、`design.md` 与 `journeys/`，再进入代码。
- 当前可以把这轮重构视为“结构完成、进入产品打磨期”的稳定基线。
