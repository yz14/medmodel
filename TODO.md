# 核心原则

## 质量第一
- 宁可多花时间，也要保证代码质量
- 充分思考、分析后再动手实现
- 不要为了快速完成而牺牲代码质量

## 分步完成
- 如果当前对话无法完成所有功能，主动拆分为多轮对话
- 每轮只专注完成一个清晰的目标
- 不贪多，确保每一步都高质量完成

## 充分调研
- 如有需要，充分、彻底地搜索和调研
- 分析和掌握现有的高质量功能实现和算法
- 借鉴业界最佳实践，不要闭门造车

## 调试支持
- 如有需要，可以加入 debug/logging 函数辅助开发
- 通过日志输出帮助定位和解决问题
- 调试代码可在功能稳定后标注或移除

## 代码质量  
- 注意代码尽可能模块化设计，职责尽可能的分离，不要把所有代码写在一个文件里，不方便后续理解和维护  
- 注意代码的复用性，不要写重复的代码  

## 沟通规范
- **开始前**：说明你理解的任务目标和将遵守的规则
- **进行中**：如需拆分，明确告知本轮将完成什么
- **完成后**：总结本轮成果，说明后续计划（如有）

注意:  
1. 严格遵守以上规则！  
2. 多花时间理解、分析，确保完全掌握所有的前后端和算法代码、设计、功能、等等。  
3. 代码修改后一定要检查对现有所有功能的影响，a. 是否会使得其它原本正常的功能异常？b. 是否带来新的问题？c. 是否修改的不完善，例如修改功能后，需要参考其它类似的功能，是否有属性要补充等等？  
4. 前端一些修改可能需要node build才失效。  
5. 再次强调：要多花时间深入思考、分析，提倡多花时间高质量完成，忌讳快速马马虎虎的完成。  


## TODO  
1. 我想做一个医学智能影像平台，主要是集成很多个我自己训练好的AI模型，例如结节分割、肺分割、检测，分类模型等等，集成后给到医院去实际使用。我的大致的想法可能和rough.png很类似，但是这个只是我初步画的草图，你只能参考增加理解，而不可严格按这个来。a 前端界面要看起来美观，专业，功能实用且丰富，布局有层次感，合理等等；b 模型就用假模型，输入后就输出假预测；c 最后把前后端和模型调用全流程跑通即可。一定要先详尽的调研高质量项目（相关或者不相关领域都可），然后再设计，最后才能实施。

---

# TODO-1 轮次1 交付物：调研 + 架构与界面设计（不写实现代码）

> 本轮目标：完成业界调研、确定技术选型、产出可直接施工的架构/接口/界面/目录设计与分轮实施计划。
> 本轮不产出功能代码。设计定稿后再进入轮次2起的实施。

## 一、业界调研（结论与可借鉴点）

### 1.1 OHIF Viewer v3（开源零足迹 DICOM 阅片器，医学影像 Web 事实标准）
- **架构三层解耦**：`platform/core`（业务逻辑）+ `platform/ui`（组件库）+ `platform/app`（壳）+ `extensions`（能力积木）+ `modes`（把 extensions 组合成某条路由上的工作流）。
- **可借鉴 1：Extension/Module 机制**。extension 只"提供能力"（ViewportModule / PanelModule / ToolbarModule / CommandsModule / HangingProtocolModule），不自动挂载；由 mode 决定组合。→ 本项目的"多个 AI 模型"正是同构问题：**模型应当是插件（Model Plugin），不是硬编码分支**。
- **可借鉴 2：Service + Command 模式**。UI 不直接调业务，统一通过 `commandsManager.run('cmd')`，便于工具栏/快捷键/右键菜单复用同一逻辑。
- **可借鉴 3：Hanging Protocol**（按模态/部位自动决定布局与序列摆放）→ 对应本项目"打开胸部 CT 自动 2x2 MPR、打开 DR 自动单视图"。
- **可借鉴 4：DataSource 抽象**（DICOMweb / 本地文件 / 自定义后端可换）→ 本项目前端只依赖自家 REST，但同样做数据源层隔离，未来接 PACS 不改 UI。
- **不照搬**：OHIF 整体过重（monorepo + lerna + 数十个 extension），且它是"阅片器"而非"模型运营平台"。我们借架构思想，不引入其框架。

### 1.2 Cornerstone3D 2.x（OHIF 的渲染/工具内核）
- 能力：Stack/Volume/3D 视口、MPR、MIP、GPU 离屏渲染、**Viewport-Centric Segmentation**（labelmap 叠加、可编辑）、标注工具（Length/RectangleROI/EllipseROI/Bidirectional/Probe/Angle）、`VoxelManager`（内存减半）、工具组 `ToolGroupManager`、Web Worker + WASM 解码。
- Vite/React 集成要点（踩坑记录，实施时必须遵守）：
  - 必须完成**完整初始化链**：`@cornerstonejs/core.init()` + `dicomImageLoader.init()` + `@cornerstonejs/tools.init()`，只 init core 会黑屏（`Cannot read properties of undefined (reading 'tier')`）。
  - 需 `vite-plugin-wasm` / `vite-plugin-top-level-await`，并把 codec worker 排除出预打包。
  - 非 DICOM 源（PNG/JPG）需自注册 `registerWebImageLoader` + `metaData.addProvider` 提供硬编码元数据（**本项目"假数据"阶段的关键手段**）。
  - `RenderingEngine` 全局单例；React 里必须在 unmount 时 `disableElement` / `destroy`，否则内存泄漏与重复视口。
- 官方参考仓库：`cornerstonejs/vite-react-cornerstone3d`。

### 1.3 NiiVue（WebGL2 神经影像/体数据查看器）
- 优点：API 极简、原生支持 NIfTI/NRRD/MGZ 等，多平面 + 体渲染 + 画笔分割开箱即用，包体小。
- 缺点：**矢量标注工具体系弱**（Length/ROI/多边形/可编辑控制点等仍在讨论中，见 niivue#1500），3D 纹理 2GB 上限。
- 结论：**主视口用 Cornerstone3D**（临床 DICOM + 标注 + 分割生态完整）；NiiVue 仅作为"科研/NIfTI 快速预览"的可选后备，不进入 MVP。

### 1.4 MONAI Label / MONAI Deploy（模型服务化最佳实践）
- MONAI Deploy 的核心抽象：**Application = 由 Operator 组成的 DAG**（read → pre-transform → infer → post-transform → write），并打包为自描述的 **MAP**（含 `inputPath/outputPath/modelPath` 契约与 `/upload` REST 入口）。
- MONAI Label Server：Server 只暴露 HTTP 端点（`/info`、`/infer/{model}`、`/train`、`/datastore`），**App 决定"怎么做"，Server 决定"能做什么"**；`/info` 返回模型清单与能力描述，客户端（3D Slicer）据此动态生成 UI。
- **强可借鉴**：
  1. **`GET /models` 返回模型能力清单（含输入约束、输出类型、参数 schema），前端据此动态渲染参数表单**——这是"集成很多个模型"不改前端的关键。
  2. **统一 Operator/Pipeline 契约**：所有模型实现同一 `preprocess → infer → postprocess` 接口，平台侧只认契约。
  3. **目录契约**：每个任务分配 `work_dir`，`input/`、`output/`、`model/` 分离，产物落盘 + 元数据入库。
  4. 自描述、可容器化，为将来 Triton/BentoML/Ray 替换留口。

### 1.5 后端任务编排（跨领域最佳实践）
- AI 推理是**长耗时任务**，绝不能放在 HTTP 请求同步返回。业界标准：`POST` 创建任务 → 立刻返回 `202 + task_id` → 客户端轮询 `GET /tasks/{id}` 或 **SSE/WebSocket 推送进度** → 完成后 `GET /tasks/{id}/result`。
- 队列选型：生产用 Celery/RQ + Redis + GPU worker 池（按显存/模型分队列，串行占卡）。MVP 用 FastAPI `BackgroundTasks` + 内存/SQLite 队列，但**接口形态与生产版完全一致**，后续换 Celery 不动前端。
- 幂等与可观测：`idempotency_key`、任务状态机（`queued→running→succeeded/failed/canceled`）、结构化日志 `trace_id`、每阶段耗时打点。

### 1.6 界面/交互参考（美观 + 专业）
- 深色（`slate-950/900`）为阅片区默认底色（业界共识：降低眩光、提高对比感知）；管理/统计区用浅色或深色一致的中性灰，主色克制（单一品牌蓝 + 语义色）。
- 布局范式：**左侧固定图标+文字导航（可折叠）→ 顶部全局栏（搜索/任务铃/用户）→ 内容区 KPI 卡片行 + 主次分栏（8:4）→ 底部表格/图表**。rough.png 的总览页正是此范式，予以保留并加强层次（卡片阴影层级、分组标题、密度可调）。
- 阅片器范式（OHIF/3D Slicer/PACS 通用）：左 study/series 缩略图栏、中 N×M 视口网格、右 工具/AI 结果/测量面板、顶 工具条、底 状态与影像信息叠加（患者、W/L、层厚、比例尺）。
- 组件库：**shadcn/ui + TailwindCSS + Lucide + Recharts**（图表）+ TanStack Table（大数据表格虚拟滚动）。

## 二、产品定位与范围

**产品名（暂定）**：VoxFlow · 医学影像 AI 模型平台（沿用 rough.png 命名）
**定位**：把院内自研 AI 模型统一注册、统一调用、统一质控、统一交付给临床的**模型运营 + 阅片一体化平台**。
**MVP 范围（本项目全程目标）**：假模型、真流程。前端 → 后端 → 模型插件 → 产物回传 → 前端叠加渲染，全链路闭环。
**非目标（明确排除，避免范围蔓延）**：真实 PACS 对接、真模型权重、真训练、用户权限的细粒度审计、DICOM SEG/SR 标准化导出（留接口，二期）。

## 三、信息架构（导航与页面）

参考 rough.png 的 7 个一级入口，重整为职责更清晰的 6 组（去掉与 MVP 无关的"标注质控/模型训练"重量级模块，降级为占位页）：

| # | 一级导航 | 页面 | 核心内容 |
|---|---|---|---|
| 1 | 总览 Dashboard | `/` | 4 张 KPI 卡（标注病例数/可用模型数/今日推理任务/平均 Dice）、多模态影像速览（2x2 缩略视口 + "运行 AI 分析"入口）、模型评估指标表（Dice/IoU/HD95/ASD）、任务队列、模型应用分布环形图 |
| 2 | 数据中心 Data | `/data` | 患者/检查/序列三级列表（TanStack Table，虚拟滚动、筛选、排序、分页）、上传（DICOM 文件夹/ZIP/NIfTI 拖拽）、检查详情抽屉、序列缩略图、"送去分析" |
| 3 | 影像阅片 Viewer | `/viewer/:studyId` | Cornerstone3D 多视口（1x1 / 2x2 / MPR 三平面+3D）、工具条（W/L、缩放、平移、卷帘、测量、ROI、橡皮、重置）、右侧 AI 结果面板（分割叠加开关/透明度、检出列表可点击跳转病灶、分类概率条）、底部影像信息叠加 |
| 4 | 模型仓库 Models | `/models` | 模型卡片网格（名称/版本/任务类型/模态/部位/状态/延迟/指标）、详情页（能力 schema、输入输出说明、评估指标、变更历史、启停开关） |
| 5 | 推理任务 Tasks | `/tasks` | 任务列表（状态徽章、进度条、耗时、来源、模型、重试/取消/查看结果）、任务详情（阶段时间线 + 日志流 + 产物列表） |
| 6 | 系统设置 Settings | `/settings` | 主题（深/浅）、语言、默认布局与 Hanging Protocol、存储路径、并发数、关于 |

> 「临床应用（Clinical）」与「标注质控」在 MVP 中作为**路由占位页**（清晰的空状态设计，不做假功能），避免半成品观感。

## 四、技术选型（定稿）

### 前端
- React 18 + TypeScript + **Vite**
- 路由：React Router v6（`createBrowserRouter`，按页面 lazy 分包）
- 状态：**Zustand**（轻量、切片式）+ **TanStack Query**（服务端状态、轮询、缓存、失效）
- UI：TailwindCSS + shadcn/ui（Radix 无障碍基座）+ Lucide 图标 + `class-variance-authority`
- 图表：Recharts；表格：TanStack Table v8
- 影像：`@cornerstonejs/core` + `@cornerstonejs/tools` + `@cornerstonejs/dicom-image-loader`（+ `vite-plugin-wasm`、`vite-plugin-top-level-await`）
- 表单与校验：react-hook-form + zod（模型参数动态表单由后端 schema 驱动）
- 质量：ESLint + Prettier + TypeScript strict + Vitest（单测）+ Playwright（E2E 全流程冒烟）

### 后端
- Python 3.11 + **FastAPI** + Uvicorn + Pydantic v2
- 持久化：**SQLite + SQLAlchemy 2.0**（MVP；ORM 层隔离，后续换 PostgreSQL 零成本）
- 任务：MVP 用进程内 `TaskQueue`（`asyncio` + 线程池，含并发上限与取消），**接口按 Celery 语义设计**
- 影像 IO：`pydicom` + `SimpleITK`/`nibabel`（读元数据、生成缩略图、写 NIfTI/PNG 掩膜）
- 数值：numpy + scipy（假模型生成形态学上"像样"的掩膜）
- 静态产物：`FileResponse` / 挂载 `/static`，产物走内容寻址目录
- 质量：pytest + httpx AsyncClient、ruff + mypy、structlog 结构化日志

### 部署
`docker-compose`：`web`（nginx 托管前端构建产物 + 反代 `/api`）+ `api`（FastAPI）+ 卷（`data/`、`storage/`）。开发态 Vite dev server proxy 到 `:8000`。

## 五、后端架构设计

### 5.1 分层
```
app/
  api/            HTTP 边界：路由、请求/响应 schema、依赖注入（不含业务逻辑）
  services/       业务编排：StudyService / ModelService / TaskService / InferenceOrchestrator
  domain/         领域模型与枚举、状态机、契约（Protocol/ABC）
  infra/          db(SQLAlchemy)、repositories、storage(文件)、queue、logging、config
  models_hub/     模型插件目录（每个模型一个包，自注册）
  imaging/        DICOM/NIfTI 读取、序列组织、缩略图、掩膜编码（RLE/PNG）
```
**依赖方向严格单向**：`api → services → domain ← infra`。`models_hub` 只依赖 `domain` 的契约，不依赖 `api`/`services`（可独立测试、独立分发）。

### 5.2 模型插件契约（核心设计，借鉴 MONAI Label + OHIF Extension）

```python
class ModelPlugin(Protocol):
    spec: ModelSpec                 # 自描述元数据（见下）
    def load(self) -> None: ...     # 懒加载权重（假模型为 no-op）
    def preprocess(self, ctx: InferenceContext) -> Any: ...
    def infer(self, data: Any, ctx: InferenceContext) -> Any: ...
    def postprocess(self, raw: Any, ctx: InferenceContext) -> InferenceResult: ...
```
- `ModelSpec`：`id / name / version / task_type(segmentation|detection|classification) / modalities[CT,MR,DR,...] / body_parts / input_constraints / params_schema(JSON Schema) / outputs[] / metrics{dice,iou,hd95,asd} / expected_latency_ms / enabled`
- `InferenceContext`：`task_id / work_dir(input,output) / series 元数据 / 用户参数 / progress_cb(pct, stage, message)`
- `InferenceResult`（**判别联合，前端按 `type` 分支渲染**）：
  - `SegmentationResult`：`masks[{label_id, label_name, color, encoding: 'rle'|'png_stack'|'nifti', uri, volume_mm3, dice?}]`
  - `DetectionResult`：`boxes[{id, label, confidence, slice_index?, bbox(x,y,w,h) 或 bbox3d, diameter_mm?}]`
  - `ClassificationResult`：`predictions[{label, probability}]`, `cam_overlay_uri?`
  - 公共：`series_uid / model_id / model_version / runtime_ms / summary(结构化文本) / artifacts[]`
- **注册机制**：`models_hub/__init__.py` 扫描子包并调用 `registry.register(plugin)`；`ModelService` 只面向 registry 与 `ModelSpec`，新增模型**零改动**平台代码。
- **假模型实现策略**（保证"看起来真"）：基于真实序列尺寸/HU 阈值生成掩膜——肺分割用阈值+形态学开闭+最大连通域；结节分割在肺内随机放置 1~3 个高斯球并做平滑；检测输出对应外接框 + 伪置信度；分类用 softmax 化的确定性随机（以 `series_uid` 为随机种子，**保证同输入同输出，可复现**）；`progress_cb` 分 5 阶段带 sleep，模拟真实耗时。

### 5.3 任务状态机
`queued → running(stage: preprocess|infer|postprocess|writing) → succeeded | failed | canceled`
- 每次状态/进度变更写库并广播 SSE 事件；失败保留 `error_code/message/traceback` 与已产出的部分产物。
- 并发上限可配；同一 `series + model + params_hash` 命中缓存直接复用结果（幂等）。

### 5.4 存储布局
```
storage/
  studies/{study_uid}/series/{series_uid}/{instances...}     原始影像
  studies/{study_uid}/series/{series_uid}/thumb.png          缩略图
  tasks/{task_id}/input/  tasks/{task_id}/output/            任务工作区
  tasks/{task_id}/output/mask_{label}.png|.nii.gz            产物
```

### 5.5 API 设计（v1，全部前缀 `/api/v1`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查（版本、DB、队列水位） |
| GET | `/stats/overview` | 总览 KPI + 模型应用分布 + 近期任务（Dashboard 一次拉齐） |
| POST | `/studies/upload` | 上传 DICOM/ZIP/NIfTI，解析入库，返回 study/series |
| GET | `/studies` | 分页/筛选（模态、部位、日期、关键字） |
| GET | `/studies/{study_uid}` | 检查详情 + series 列表 |
| GET | `/series/{series_uid}/instances` | 实例列表（供 Cornerstone 生成 imageIds） |
| GET | `/series/{series_uid}/frames/{idx}` | 单帧影像字节流（wadouri 风格，支持 Range） |
| GET | `/series/{series_uid}/thumbnail` | 缩略图 |
| GET | `/models` | 模型清单（含 `params_schema`，驱动前端动态表单） |
| GET | `/models/{model_id}` | 模型详情与指标 |
| PATCH | `/models/{model_id}` | 启停/默认参数 |
| POST | `/tasks` | 创建推理任务 `{series_uid, model_id, params}` → `202 {task_id}` |
| GET | `/tasks` | 任务列表（状态/模型/时间筛选） |
| GET | `/tasks/{id}` | 任务详情（状态、进度、阶段耗时、日志） |
| GET | `/tasks/{id}/events` | **SSE** 实时进度流（降级方案：前端 TanStack Query 轮询 1s） |
| GET | `/tasks/{id}/result` | `InferenceResult`（判别联合 JSON） |
| GET | `/tasks/{id}/artifacts/{name}` | 产物下载（掩膜/报告） |
| POST | `/tasks/{id}/cancel` / `/retry` | 取消 / 重试 |

- 统一响应错误体：`{code, message, details?, trace_id}`；统一分页：`{items, total, page, page_size}`。
- 全部 schema 由 Pydantic 定义，前端通过 `openapi-typescript` 生成 TS 类型，**前后端类型单一真源**。

## 六、前端架构设计

```
src/
  app/            入口、Providers（Query/Theme/Router）、路由表
  pages/          dashboard | data | viewer | models | tasks | settings
  features/       按业务纵切：viewer/(cornerstone 封装, toolbar, ai-panel)
                  models/(卡片, 详情, 动态参数表单)
                  tasks/(列表, 时间线, 进度)
                  data/(上传, 表格, 详情抽屉)
  components/ui/  shadcn 基础组件（Button/Card/Table/Dialog/Badge/Slider/Tabs...）
  components/     业务无关复合组件（KpiCard, StatusBadge, EmptyState, PageHeader...）
  lib/            api client(fetch 封装+错误统一), sse, format, cn
  types/          由 OpenAPI 生成 + 手写补充
  stores/         zustand slices（viewport 布局、工具状态、叠加显示、主题）
```

### 6.1 阅片器封装（重点，避免 Cornerstone3D 常见坑）
- `useCornerstoneInit()`：全局仅初始化一次（module 级 promise 单例）。
- `useRenderingEngine()`：单例 engine，页面卸载 `destroy`。
- `<Viewport />`：受控组件，props = `{viewportId, type, imageIds|volumeId, toolGroupId}`；`useEffect` cleanup 里 `disableElement`。
- `useToolGroup()`：集中声明工具与绑定（左键=W/L、中键=Pan、右键=Zoom、滚轮=StackScroll），工具切换只改 active。
- `useSegmentationOverlay()`：把后端掩膜（PNG stack / NIfTI）转成 labelmap volume 并 `addSegmentationRepresentations`，暴露"显示/隐藏、透明度、单标签开关、跳转到最大层"。
- `useAiResultSync()`：点击右侧检出列表 → 跳转对应 slice 并居中 + 高亮框（annotation）。
- **Hanging Protocol（简版）**：`{modality, bodyPart} → {layout, viewportsConfig}` 的规则表，打开检查时匹配。

### 6.2 视觉设计规范（Design Tokens）
- 主题：默认**深色**（阅片友好），支持浅色切换；用 CSS 变量 + Tailwind `dark:`。
- 色板：背景 `#0B1220 / #111827 / #1F2937`；主色 `#2E7CF6`（品牌蓝）；语义 成功 `#10B981`、警告 `#F59E0B`、危险 `#EF4444`、信息 `#38BDF8`；分割标签色板固定 8 色（可辨、色盲友好）。
- 字体：中文 `Noto Sans SC`，数字/英文 `Inter`，指标数字用 `tabular-nums`。
- 间距/圆角/阴影：4px 基准栅格；卡片 `rounded-xl`、`shadow-sm`，悬浮层 `shadow-lg`；分隔用 1px `border-white/8`。
- 层次感手段：①KPI 卡（大数字 + 小趋势）②主区 8:4 分栏 ③分组标题 + 右侧"更多"链接 ④表格斑马纹与状态徽章 ⑤影像区纯黑衬底与半透明信息叠加。
- 状态设计必做：**loading（骨架屏）/ empty（插画+引导按钮）/ error（原因+重试）** 三态，全站统一组件。
- 无障碍与细节：焦点环、键盘可达、`aria-*`（Radix 已保证）、快捷键（`1-4` 切工具、`R` 重置、`空格` 卷帘）。

## 七、端到端主流程（验收链路）

```
上传 DICOM/ZIP
  → 后端解析 study/series/instances 入库 + 生成缩略图
  → 数据中心列表可见 → 点击「送去分析」或进入阅片器
  → GET /models 拉取可用模型 → 选模型 + 动态参数表单
  → POST /tasks → 202 task_id
  → SSE/轮询实时进度（preprocess→infer→postprocess→writing）
  → succeeded → GET /tasks/{id}/result
  → 阅片器叠加分割掩膜 / 绘制检出框 / 展示分类概率
  → 右侧面板可切换标签、调透明度、点击病灶跳转
  → 任务中心可见历史、可重试、可下载产物
```
**验收标准**：Playwright E2E 一条脚本跑通上述全链路；后端 pytest 覆盖模型注册、任务状态机、幂等缓存、错误路径。

## 八、分轮实施计划

| 轮次 | 内容 | 产出 |
|---|---|---|
| **1（本轮）** | 调研 + 架构/接口/界面/目录设计 | 本文档 |
| 2 | 后端骨架：项目脚手架、config、DB/ORM、领域模型、`/health`、日志、pytest 基线 | 可启动的 FastAPI |
| 3 | 模型插件框架 + 4 个假模型（肺分割/结节分割/结节检测/良恶性分类）+ 单测 | `GET /models` 可用 |
| 4 | 任务队列 + 状态机 + SSE + 产物存储 + 幂等缓存 + 单测 | 全套 `/tasks` 接口 |
| 5 | 影像 IO：上传解析、series 组织、帧接口、缩略图；内置 1~2 例示例数据生成器 | `/studies` `/series` 可用 |
| 6 | 前端脚手架 + 设计系统 + 布局壳（侧栏/顶栏/主题） + Dashboard | 可看的首页 |
| 7 | 数据中心（上传+表格+详情） + 模型仓库（卡片+详情+动态表单） | 两个管理页 |
| 8 | 阅片器（Cornerstone3D 视口/工具条/布局/信息叠加） | 能看片 |
| 9 | AI 结果叠加（分割/检测/分类） + 任务中心（进度/日志/重试） | 全链路闭环 |
| 10 | E2E 冒烟、性能与内存排查、docker-compose、README、收尾打磨 | 可交付 |

## 九、风险与对策
- **Cornerstone3D + Vite 集成风险（最高）**：WASM/worker 配置、初始化顺序、React 生命周期泄漏。→ 轮次 8 单独立项，先做最小可运行 spike 再接入业务。
- **假数据"不像真"**：掩膜要贴合解剖。→ 用真实 HU 阈值 + 形态学处理，而非纯随机；固定随机种子保证可复现。
- **长任务体验**：→ SSE 优先、轮询兜底，进度必须分阶段带文案。
- **范围蔓延**：→ 严格执行"非目标"清单；占位页只做空状态。
- **前后端类型漂移**：→ OpenAPI 生成 TS 类型，纳入 CI。

## 十、下一步
~~等你确认本设计…确认后进入轮次 2：后端骨架。~~

**状态（实施中）**：设计已定稿并进入实现。
- ✅ 轮次 1：调研 + 设计
- ✅ 轮次 2–5：后端骨架 / 假模型 / 任务队列 / 影像 IO
- ✅ 轮次 6–9：前端壳 + 各业务页 + 自定义堆栈阅片 + AI 结果闭环
- ✅ 轮次 10：docker-compose / README / pytest 基线
- 后续可增强：Cornerstone3D 视口替换、Playwright E2E、PostgreSQL/Celery 生产队列

---

# TODO-2 轮次审查：初版代码全面 Review 结论与整改计划

> 审查方式：通读前后端全部源码 + 实际启动前后端跑通全链路（上传/列表/建任务/SSE/结果）实测验证 + 对照 OHIF v3 / Cornerstone3D / MONAI Label / Triton / GitHub Actions / Grafana / shadcn 等高质量项目。
> 验证基线：`pytest` 4/4 通过；`npm run build` 通过（单 chunk 763KB，见 F-6）；全链路 API 实测可跑通。
> 总体评价：**骨架和流程方向正确、页面观感尚可，但存在多个"实测复现"的功能性 bug 和安全问题，阅片器核心能力（像素级掩膜、Pan、测量）离"专业医学阅片"还有明显差距**。以下问题按严重度分级，标 ✅实测 的是本轮实际运行复现过的。

## A. Critical（必须修，影响正确性/安全，均已定位到行）

- [x] **A-1** demo 重复入库 / 层数错位 → **R1 已修**
- [x] **A-2** SSE 无 progress → **R1 已修**（`emit_threadsafe`）
- [x] **A-3** `num_instances=0` → **R1 已修**（flush）
- [x] **A-4** 产物路径遍历 → **R1 已修**
- [x] **A-5** zip-slip / UID / tmp → **R1 已修**
- [x] **A-6** 掩膜色块 → **R2 已修**（像素 PNG 合成）
- [x] **A-7** 帧缓存虚设 → **R2 已修**（series 级缓存 + 预取）
- [x] **A-8** 错误体两套 → **R1 已修**
- [x] **A-9** 测试污染真库 → **R1 已修**

## B. Major（显著影响质量/体验/可维护性）

后端：
- [x] **B-1～B-5** → **R4 已修**（分层/上传非阻塞/params 校验/幂等竞态/lung_seg+stage_timings）
- [x] **B-6** R1/R2/R4 对应回归已补；其余单测排后续

前端：
- [x] **B-7** Pan/测距/滚轮/SVG → **R2 已修**
- [x] **B-8～B-11** → **R3 已修**（SSE 主通道、lazy 路由、OpenAPI 类型、RHF/zod 表单）
- [x] **B-12～B-14** → **R4 已修**（细碎正确性、Radix Dialog/Tabs、阅片面板折叠）

## C. 界面/产品力提升
- [x] **C-1** 四角信息 → **R2 已修**
- [x] **C-2～C-5** → **R5 已修**（Findings / 任务 Tabs+甘特 / Dashboard / 模型卡+health）
- [x] **C-6** → **R6 已修**（结构化报告 + highdicom SEG/SR/GSPS；Cornerstone3D 评估不换主视口）

### R1 验收
- `pytest` 全绿（SSE / 遍历 / zip-slip / demo 40 层对齐）

### R2 验收
- 前端 `npm run build` 通过；后端 **13 passed**（含 `mask-frames`）

### R3 验收
- SSE / lazy / OpenAPI / RHF+zod；build 分包生效

### R4 验收
- 模型插件不再依赖 `StorageService`；产物 URI 由 Orchestrator 物化
- 上传 `asyncio.to_thread`；`jsonschema` 校验 params；幂等含 `model_version`；inflight 去重 + 部分唯一索引
- `lung_seg` top-2 连通域；`stage_timings` 写入任务
- Radix Dialog/Tabs；阅片左右栏可折叠（`[` / `]`）；缩略图 onError；删除 `_stale` / Cornerstone 空桩
- 前端 `npm run build` 通过；后端 **15 passed**

### R5 验收
- C-2：AiPanel Findings 统一列表（置信度排序、跳层、掩膜开关）
- C-3：任务详情 Tabs（概览/日志/产物/参数）+ `StageGantt`（`stage_timings`）
- C-4：KPI sparkline/阈值 tone、图表色走 CSS 变量、TanStack Table v8 排序分页
- C-5：模型卡 Tabs；`GET /health/live`、`/health/ready`、`GET /models/{id}/ready`
- Playwright：`e2e/smoke.spec.ts` seed→viewer→lung_seg→findings（**1 passed**）
- 前端 `npm run build` 通过；后端 **16 passed**；`npm run generate:api` 已同步

### R6 验收
- C-6：`POST /tasks/{id}/reports` — 勾选 findings → 中文结构化报告 + DICOM SEG / SR-TID1500 / GSPS
- Contributing Equipment 写入模型身份；demo DICOM 补 FoR/Type2 属性
- 阅片 AI 面板：Findings 勾选 + `ReportPanel`；`/clinical` 说明页
- Cornerstone3D：评估文档 → 见 R7 可运行 spike
- 前端 `npm run build` 通过；后端 **17 passed**（含报告/SEG/SR/GSPS）；`generate:api` 已同步

### R7 验收（本轮）
- Cornerstone3D **dual-run spike**：`/viewer-cs3d/:studyId`（lazy chunk，主 `/viewer` 未替换）
- `ensureCornerstoneInit` 单例；Stack + wadouri frames；滚轮切层
- Vite：commonjs + worker.es + exclude dicom-image-loader；**未引入 tools**（Vite 8 构建 blocker）
- 文档：`docs/r6-cornerstone3d-spike.md` 更新为可运行结论
- Playwright：`e2e/cs3d-spike.spec.ts`（shell 可见）；原 smoke 回归通过
- 前端 `npm run build` 通过（CS3D 独立分包）；后端 **17 passed**

### R8 验收（数据正确性）
- **N-B1**：`heal_instance_counts` + Alembic `20260905_0001`（回填 `num_instances`、确保 `uq_task_inflight`）；启动路径调用自愈
- **N-B2**：cache_hit 复制 `ArtifactRow`；`resolve_artifact` 回退 `result_json.artifacts`
- **N-B3**：成功提交乐观锁 `WHERE status='running'`；分片 `_sleep` + `cancel_check`；`stage_timings.writing`
- **N-B4**：`utc_iso`（`…Z`）全 API；前端 `parseApiDate` 将无时区串视为 UTC
- **N-F10/11/12**：去掉假 sparkline；环形图实色；cls/det 指标；缓存徽章；TaskList 按行 pending；`?panel=ai`
- 验证：后端 **22 passed**；前端 `npm run build` 通过

### R9 验收（阅片器核心）
- **相机**：`features/viewer/core/` — `Camera2D` / `fitCamera` / `zoomAt` / `panBy` / `screenToImage`；CSS `matrix` 统一底图/掩膜/SVG
- **N-F13**：默认 fit-to-window；工具栏「适应窗口 / 1:1」；去掉 `max-h-[70vh]`
- **N-F1/F2/F4/F5**：帧缓存 generation；slice clamp；mask LRU；指针 deps 收口
- **PACS 工具**：W/L 预设、H/V 翻转、反色、HU 探针、比例尺、PageUp/Down/Home/End、中键平移/右键窗宽
- 验证：前端 `npm run build` 通过；smoke 增加 `stack-viewport` 可见断言

---

# TODO-3 第二轮全面审查：R1～R7 修复验证 + 新问题 + 最终整改建议

> 审查方式：①通读前后端全部源码逐条核对 R1～R7 声称的修复；②实际启动前后端，用 API 实测（建任务/SSE/幂等/产物/遍历攻击/参数校验）+ Playwright 真机截图逐页看界面（深/浅主题、阅片叠加、检测框、CS3D spike）；③对照 OHIF v3 / Cornerstone3D 官方 Vite 模板 / MONAI Label / Triton / Prefect / Grafana / Lunit-Aidoc 商用产品形态。
> 验证基线：`pytest` **17 passed**；`npm run build` 通过（但 CS3D chunk **2.93MB / gzip 800KB**，见 N-F9）；`smoke.spec.ts` 通过。
> **总体结论**：A/B/C 级问题**大部分确实修好**（A-1/2/3/5/8/9、B-3/4/8/10/12/13/14、C-1～C-6 均在代码中核实），架构方向（插件契约 / 状态机 / SSE / OpenAPI 单一真源 / Radix 基座）是正确的、可交付医院试用的骨架。但**实测复现了 5 个新的功能性 bug**（其中 2 个是用户一打开就能看到的），阅片器交互数学（Pan/Zoom）仍不对，假模型"像不像真"这一设计目标未达成。下面按严重度列出，标 ✅实测 的是本轮实际跑出来的。

## 一、R1～R7 修复验证结论（逐条）

| 编号 | 结论 | 备注 |
|---|---|---|
| A-1 demo 重复入库 | ✅ 已修 | tmp 目录写入再 ingest；`src.resolve()==dest.resolve()` 防自拷贝 |
| A-2 SSE progress | ✅ 已修（实测收到 progress + succeeded） | `emit_threadsafe` + worker 补终态 |
| A-3 `num_instances=0` | ✅ R8 已修 | 启动自愈 + Alembic 回填，见 N-B1 |
| A-4 产物遍历 | ✅ 已修（实测 `..%2F` → 404） | `relative_to` 返回值未使用，防御写法待收紧 |
| A-5 zip-slip / UID | ✅ 已修 | |
| A-6 像素掩膜 | ✅ 已修（实测中间层掩膜逐像素贴合两肺） | 但缓存无上限/泄漏，见 N-F4 |
| A-7 帧缓存 | ⚠️ 修得不完善 | series 切换时旧 promise 污染新缓存，见 N-F1 |
| A-8 统一错误体 | ✅ 已修（实测 422/400/404 均为 `{code,message,details,trace_id}`） | |
| A-9 测试隔离 | ✅ 已修 | |
| B-1 分层 | ⚠️ 核心已修，残留 `models_hub → infra.logging` 依赖 | 见 N-B8 |
| B-2 上传非阻塞 | ⚠️ `to_thread` 已加，但仍 `await f.read()` 全量进内存 | 见 N-B5 |
| B-3 params 校验 | ✅ 已修（实测错参数 → 400） | |
| B-4 幂等竞态 | ✅ 已修 | 测试是顺序而非并发，见 N-B10 |
| B-5 lung_seg / stage_timings / SSE session | ✅ R8 补齐 `writing` | top-2 / 独立 session / writing stage |
| B-6 测试覆盖 | ⚠️ 17 条，取消/并发/SR 内容仍薄 | 见 N-B10 |
| B-7 Pan/测量/滚轮/SVG | ⚠️ 功能有了，数学不对 | Pan 未除 zoom、缩放中心漂移、测距未 clamp，见 N-F3 |
| B-8 SSE 主通道 + 退避 | ✅ 已修 | 但仍并行 5s 轮询，见 N-F8 |
| B-9 lazy 路由 | ✅ 已修 | `Suspense` 包在 `Routes` 外层，切页会闪掉整个 AppLayout |
| B-10 OpenAPI 类型 | ✅ 已修 | `api.ts` 仍 `as T`；`generate:api:check` 未进 CI |
| B-11 RHF+zod 表单 | ⚠️ 已用 RHF/zod，但未读 `required`，数字 enum 被转字符串 | 见 N-F7 |
| B-12～B-14 | ✅ 已修 | `DialogContent aria-describedby={undefined}` 反而去掉了描述 |
| C-1 四角信息 | ✅ 已修 | 层厚取 `spacing[0]`，需确认后端顺序是 `[z,y,x]`（当前是，OK） |
| C-2 Findings | ✅ 已修 | "全选"逻辑错误，见 N-F6 |
| C-3 任务详情 Tabs+甘特 | ✅ 已修 | 甘特因缺 `writing` 段不完整 |
| C-4 Dashboard | ✅ R8 去掉假 sparkline；环形图 CSS 色解析 | 见 N-F10/N-F11 |
| C-5 模型卡 / health | ✅ 已修 | 分类/检测卡显示 `Dice 0.000`，见 N-F12 |
| C-6 结构化报告 | ✅ 已修 | SR 语义不严谨，见 N-B7 |
| R7 CS3D spike | ⚠️ 代码在，**headless 实测 15s 仍黑屏**（状态栏显示 1/40 已加载，控制台 `no COMPRESSED_FRAME_DATA` 警告） | 需手动验证，见 N-F9 |

## 二、新发现问题 —— 后端

### Critical
- [x] **N-B1 ✅实测 旧数据 `num_instances=0` 无回填**：**R8 已修** — `StudyService.heal_instance_counts()` 在 `ensure_demo_data`/启动时回填；Alembic `20260905_0001` 数据迁移 + `uq_task_inflight`；pytest `test_heal_stale_num_instances`。
- [x] **N-B2 ✅实测 缓存命中任务产物 404**：**R8 已修** — cache_hit 复制 `ArtifactRow` + `resolve_artifact` 回退 `result_json`；pytest `test_cache_hit_artifacts_downloadable`。
- [x] **N-B3 取消竞态可被 `succeeded` 覆盖**：**R8 已修** — 成功路径 `UPDATE … WHERE status='running'`；`_sleep` 分片 + `cancel_check`；`writing` stage；pytest `test_cancel_not_overwritten_by_succeeded`。
- [x] **N-B4 ✅实测 时间戳无时区 → 前端全部偏 8 小时**：**R8 已修** — `utc_iso()` 统一 `…Z`；前端 `parseApiDate` 将 naive 视为 UTC；pytest `test_timestamps_serialized_with_utc_z`。

### Major
- [ ] **N-B5 上传全量进内存**：`await f.read()` 后再 `to_thread`；大 ZIP 直接 OOM。改为 `shutil.copyfileobj(f.file, tmp)` 流式落盘，并加 `max_upload_bytes` / `max_files` 配置与 413 响应。（`api/routes/studies.py:19-22`）
- [ ] **N-B6 未校验 `input_constraints`**：`create_task` 只查模型存在/启用，不校验 `series.modality ∈ spec.modalities`、`num_instances ≥ min_slices`、`body_part`。MONAI Label 的 `/info` 契约正是为此服务的。返回 400 `UNSUPPORTED_INPUT`，前端 AI 面板据此**灰掉不适用模型**（而不是让用户跑完再失败）。（`task_service.py:127-142`）
- [ ] **N-B7 报告/DICOM 导出语义与健壮性**：①`confidence`/`dice` 被塞进 TID1500 的 Measurement（`NoUnits`），标准做法是 `QualitativeEvaluation` 或用 `SCT 246501002 (Probability)` 概念编码；②越界 `slice_index` 的框静默 `continue`；③`_load_series_images` 一次读全序列；④导出前未校验 `len(source_images)==volume.shape[0]`。（`imaging/dicom_export.py:220-257, 299-365`、`services/report_service.py:157-221, 310-323`）
- [ ] **N-B8 分层残留**：`models_hub/__init__.py`、`registry.py`、`base.py` 仍 import `app.infra.logging` / `app.imaging.dicom_io`。插件应只依赖 `domain`：把 logger 通过 `InferenceContext.logger` 注入，体数据读取由 Orchestrator 在 `preprocess` 前完成并放进 `ctx`（MONAI Deploy 的 Operator 输入即如此）。
- [ ] **N-B9 假模型"不像真"（设计目标未达成，✅实测截图可见）**：
  - `lung_seg` 用**硬编码椭圆**当体表 mask（`(yy-cy)/(y*0.45)`），比 phantom 体表大 → 掩膜出现**一圈环绕体表的假阳性环**，且换任何真数据都不成立。标准做法：`body = fill_holes(largest_cc(volume > -500))`，`lung = (volume < -400) & body` 再去掉与边界连通的分量、取 top-2。（`models_hub/lung_seg/__init__.py:73-79`）
  - `nodule_det` / `nodule_seg` 结节位置随机落在图像中心附近（实测 det-1/det-2 落在纵隔上，不在肺内），设计文档写的是"在肺内随机放置"。应先算肺 mask 再从 mask 体素中采样中心。
  - demo phantom 本身太简陋（均匀噪声椭圆 + 两个椭圆肺，无气管/血管/脊柱/床板），演示给医院时说服力差。建议 phantom 加：脊柱（高 HU 圆）、气管（正中小圆 -1000）、若干"血管"随机管状结构（+50 HU）、1～3 个预埋结节（+30 HU 高斯球，并让 det/seg 假模型**真的去找它们**，这样"AI 结果"就和影像一致，Findings 跳转后肉眼可见病灶）。
  - 分类/检测模型的 `metrics` 里给了 `dice=0.0`，应分别给 AUC/敏感度/特异度 与 mAP/FROC，并让 `ModelSpec.metrics` 成为按 task_type 的判别联合。
- [ ] **N-B10 测试仍薄**：取消只断言状态 ∈ 集合；幂等是顺序调用而非 `gather` 并发；SR/GSPS 只查 SOPClassUID 不解析内容；`dicom_io`/`mask_utils` 无单测。至少补：并发幂等、取消后不再收到 `succeeded`、缓存命中产物可下载（N-B2 回归）、时区序列化（N-B4 回归）、无 preamble DICOM、`highdicom` 反解析 SR 树。

### Minor
- `stats_service.overview` 全表 `select(TaskRow)` → 用聚合；`Accept-Ranges: bytes` 声明了但 `FileResponse` 不支持 Range → 去掉或实现；`mask_utils.rle_encode`/`largest_connected_component` 死代码；`nodule_det` 里 `_ = gaussian_blob(...)` 白算一次；`dicom_io` 只认 `DICM` preamble 会漏掉合法无 preamble 文件，缺 UID 时 `generate_uid()` 每次不同会把一个序列拆成多个 study；`IMG*.dcm` 遗留清理可能误删用户文件；日志里 `trace_id=-` 在后台任务中没有关联到创建它的请求。

## 三、新发现问题 —— 前端

### Critical
- [x] **N-F1 `useFrameStack` 竞态**：**R9 已修** — generation stamp + Map 替换；旧 promise 不再写入新缓存。
- [x] **N-F2 `setSliceIndex` 无上界 clamp**：**R9 已修** — store `sliceCount` + clamp；viewer 同步 instances/series 计数。
- [x] **N-F3 阅片器相机数学不对**：**R9 已修** — `features/viewer/core/camera.ts` 显式 `{scale,tx,ty}`；`zoomAt`/`panBy`/`screenToImage`；overlay 共用 matrix。
- [x] **N-F4 `maskComposite` 内存泄漏**：**R9 已修** — LRU(48) + `ImageBitmap.close` + `revokeObjectURL`。

### Major
- [x] **N-F5 指针事件 effect 依赖过重**：**R9 已修** — handlers 用 `getState()`；deps ≈ `[tool, frame]`。
- [ ] **N-F6 Findings"全选"逻辑错误**：部分选中时执行结果是"取补集"，永远无法一次全选；且 `AiPanel` 的 `useEffect` 在 findings 变化时强制全选，会覆盖用户手动取消。（`FindingsList.tsx:95-109`、`AiPanel.tsx:115-117`）
- [ ] **N-F7 动态表单**：未读 `schema.required`；enum 全部 `String()` 丢类型；数字清空 `onChange(undefined)` 与 zod 语义不一致。（`ModelParamsForm.tsx:9-57, 74-99`）
- [ ] **N-F8 SSE 与 5s 轮询并行**：`task-detail` 与 `AiPanel` 均 `refetchInterval: 5000` 且同时 `useTaskSSE`。让 `useTaskSSE` 暴露 `connected`，`refetchInterval = connected ? false : 3000`。
- [ ] **N-F9 CS3D spike 可用性未证实 + 2.9MB chunk**：headless 实测黑屏（WebGL2 可用），控制台 `[dicomImageLoader/wadouri] no COMPRESSED_FRAME_DATA`，疑似 `/frames/{idx}` 返回内容与 wadouri 期望的完整 DICOM Part10 不匹配或 transfer syntax 元数据缺失——需手动在真浏览器验证并加 Playwright 断言"canvas 非全黑"（读像素）。此外 tools 未接入的根因是 Vite 8（rolldown）+ `@icr/polyseg-wasm`，官方模板给的解法是 `worker.rollupOptions.external: ['@icr/polyseg-wasm']` + `optimizeDeps.exclude: ['@cornerstonejs/tools']`，Vite 8 下对应 `worker.rolldownOptions`；若仍不行，可锁 Vite 7 或用 `@rollup/plugin-wasm({sync:['ICRPolySeg.wasm']})`。CS3D 依赖已进 build 产出 2.93MB chunk，即便是 lazy 也要用 `build.chunkSizeWarningLimit` 显式确认、并确保**主 `/viewer` 路径 0 依赖 CS3D**（当前 `esm--iAmJTRM.js` 需核对未被主路由引用）。
- [x] **N-F10 ✅实测 Dashboard sparkline 是假的**：**R8 已修** — 去掉 `sparkSeriesFromValue` 与 KPI 假趋势图标；无时序则不画线。
- [x] **N-F11 ✅实测 深色主题首屏"模型应用分布"环形图空白**：**R8 已修** — `getComputedStyle` 解析 token 为实色 + `minHeight`/`debounce`/`isAnimationActive=false`。
- [x] **N-F12 ✅实测 展示层细节**：**R8 已修** — cls/det 指标按 task_type（AUC/mAP）；缓存徽章+源任务链接；TaskList 按行 `variables` pending + `aria-label`；StudyDrawer「送去分析」→ `?panel=ai`。
- [x] **N-F13 ✅实测 阅片视口利用率低**：**R9 已修** — 默认 fit-to-window（短边）、去掉 `max-h-[70vh]`；`F`/工具栏适应窗口；`R` 重置并重 fit。

### Minor
- `Suspense` 包在 `Routes` 外导致切页闪掉整个 AppLayout → 移到 `Outlet` 级；`api.ts` `undefined as T` / `as T`，SSE payload `as TaskSummary` 无运行时校验 → 对 SSE 事件与 `InferenceResult` 用 zod 做最小 parse；`model-detail` 的 `enabled` 只随 `id` 同步；`Settings` 的 Switch 无 `aria-label`；日志时间线无 level 颜色；`formatPercent` 语义（0–1 还是 0–100）在 Dashboard 与 Progress 间不一致；`DIST_LABEL`/`TYPE_LABEL`、时间格式化函数多处重复。

## 四、界面/产品力评估（对照商用与开源标杆）

**做得好的**：整体深色调、层级、KPI→主次分栏→表格的节奏与 rough.png 一致且更精致；四角信息叠加、Findings 列表、任务阶段甘特、模型卡启停开关都对齐了 OHIF / Lunit / GitHub Actions 的成熟形态；浅色主题基本可用。

**离"医院可用"还差的（按优先级）**：
1. **阅片器是核心，也是短板**：视口利用率（N-F13）、相机数学（N-F3）、缺"适应窗口 / 1:1 / 翻转 / 反色 / 预设 W/L（肺窗/纵隔窗/骨窗）"这些 PACS 必备按钮、缺右键/中键工具绑定、缺键盘 PageUp/PageDown 与 Home/End 切层、缺鼠标位置 HU 值探针、缺比例尺。OHIF 的工具条是标杆：主工具（W/L、Pan、Zoom、StackScroll）互斥高亮 + 预设 W/L 下拉 + 布局切换 + 测量组。
2. **AI 结果可信度呈现**：Findings 里"Lung 95%"把 Dice 当置信度展示会误导医生；分割应显示体积/层范围，检测显示置信度/直径，分类显示概率条 + CAM。每个 finding 加"接受 / 拒绝 / 修正"三态（Aidoc/Lunit 的 read-workflow 标准），并进报告。
3. **任务中心**：缺按模型/日期/患者筛选与搜索、缺批量操作、缺失败原因一眼可见（error_code 徽章 + hover 详情）；日志流应带 level 色与阶段过滤（已在 C-3 承诺）。
4. **数据中心**：只有 1 条 demo 数据看不出表格能力；应内置生成 3～5 例不同模态/部位的 demo（CT 胸 / CT 头 / MR 脑 / DR 胸），既检验 Hanging Protocol 匹配，也让 `input_constraints` 校验（N-B6）有意义。
5. **全站**：时间 8 小时偏差（N-B4）、假 sparkline（N-F10）、`Dice 0.000`、"0 帧"这类**一眼可见的错误数据**，比任何视觉打磨都更损害专业感，应最先修。

## 五、架构/流程评估

- **正确且应坚持**：`api → services → domain ← infra` 单向依赖；`ModelPlugin` 协议 + registry 自注册；任务状态机 + SSE + 幂等哈希；OpenAPI → TS 单一真源；Radix 基座；CS3D dual-run 不替换主路径的谨慎策略。
- **需要收口的架构债**：
  1. **插件契约泄漏**（N-B8）：插件读文件、写 PNG、打日志都在自己做，Orchestrator 只是串了三步。建议：Orchestrator 负责"读体数据进 ctx / 收 `InferenceResult` 里的 numpy 掩膜后统一编码落盘 / 注入 logger 与 progress"，插件真正只做 `preprocess/infer/postprocess` 的纯计算。这也是将来换 Triton / 真 PyTorch 权重时唯一需要改的地方在插件内部的前提。
  2. **产物模型不一致**（N-B2）：`ArtifactRow`、`result_json.artifacts`、`masks[].uri` 三处各自维护。收敛为：`ArtifactRow` 是唯一真源，`result_json` 只引用 artifact name；缓存命中 = 新任务行 + 复用同一批 ArtifactRow 的 uri。
  3. **时间与时区**（N-B4）：全栈约定 UTC aware，SQLite 用 `TypeDecorator` 强制读出即带 tz；这一条不做，报告/审计都是错的。
  4. **数据迁移缺失**（N-B1）：ORM `create_all` 无法演进 schema。引入 Alembic（首个迁移就是 `num_instances` 回填 + `uq_task_inflight` 索引），否则第一次给医院升级版本就会翻车。
  5. **阅片器抽象层**（N-F3）：把相机矩阵、坐标换算、overlay 渲染抽成 `features/viewer/core/`（`Camera`, `toImage()`, `toScreen()`, `OverlayLayer` 接口），`StackViewport` 只做胶水。这样 CS3D 替换时 AI 面板 / Findings / 报告完全不动，只换 `Camera` 的实现来源（CS3D `viewport.getCamera()`）。
  6. **可观测性**：后台任务日志 `trace_id=-`，应把创建请求的 trace_id 写进 TaskRow 并在 worker 里 bind；`/metrics`（Prometheus 文本格式：队列长度、各模型耗时直方图、失败计数）是 Triton/MONAI Deploy 的标配，为医院运维预留。

## 六、最终整改建议（按依赖排序，每轮可独立验收）

| 轮 | 内容 | 验收 |
|---|---|---|
| **R8（数据正确性，最先做）** ✅ | N-B1～B4、N-F10/11/12 | **已验收**：pytest **22 passed**（含 N-B1/2/3/4 回归）；`npm run build` 通过；Alembic 落地 |
| **R9（阅片器核心）** ✅ | N-F1～F5、N-F13 + 相机抽象 + W/L 预设 / 翻转 / 探针 / 比例尺 / PageUp-Down | **已验收**：`npm run build` 通过；显式 Camera2D；fit-to-window；smoke 断言 `stack-viewport` |
| **R10（假模型像真 + 输入约束）** | N-B9 phantom 升级（脊柱/气管/血管/预埋结节）+ lung_seg 体表 mask 算法 + det/seg 在肺内采样并命中预埋结节 + 3～5 例多模态 demo；N-B6 `input_constraints` 校验 + 前端灰掉不适用模型；N-B8 插件契约收口 | 演示时 Findings 跳层肉眼可见病灶；MR 序列上肺模型不可选；`models_hub` 仅 import `domain` |
| **R11（产品力）** | Findings 接受/拒绝/修正三态进报告；任务中心筛选/搜索/错误徽章；N-F6/N-F7/N-F8；N-B7 SR 语义；a11y 收尾（aria-label、Dialog description） | 对照 OHIF/Lunit 截图逐项验收；`highdicom` 反解析 SR 树通过 |
| **R12（上线准备）** | N-B5 流式上传 + 限额；`/metrics` + trace_id 贯通；N-B10 测试补强（并发/取消/时区/DICOM IO）；`generate:api:check` 进 CI；N-F9 CS3D 真浏览器验证 + tools 接入或明确降级为"评估结论" | CI：ruff+mypy+pytest+tsc+build+e2e 全绿；README 写清部署与升级（Alembic）流程 |

> 原则提醒：R8 的问题都是"打开就能看见的错"，成本低、收益最高，务必先于任何视觉打磨完成；R9 是产品的核心竞争力，值得投入最多时间做到手感正确；R10 决定演示效果；R11/R12 决定能否真正进医院。

---

# TODO-4 前端专项审查：界面美观 / 实用 / 专业 / 功能齐全 —— 结论与重构建议

> 审查范围：**仅前端**（`frontend/src` 全部 70 个文件通读）+ 真机运行（后端 :8000 + Vite :5173，Playwright 1600×900 与 1280×720，深/浅双主题，逐页截图 29 张存于 `frontend/_audit/`，含运行 lung_seg / nodule_det / nodule_cls 三类模型后的阅片截图）。
> 标杆调研：OHIF v3（toolbar / study panel / segmentation panel / overlay corners / hanging protocol）、3D Slicer Segment Editor + MONAI Label 插件、VolView、Weasis；商用 AI：Lunit INSIGHT、Aidoc、Annalise、Qure.ai、Siemens AI-Rad Companion、Infervision、深睿、联影 uAI、数坤；运营类：MLflow / W&B Registry / HF Model Card / Triton；任务类：GitHub Actions / Prefect / Dagster / Temporal；设计系统：Grafana / Linear / Vercel / Stripe / shadcn blocks / Carbon DataTable / Ant Design Pro / WCAG 2.2。
> 本节**只给结论与方案，不写代码**；标 ✅实测 的是本轮截图里能直接看到的问题。

## 一、总体结论（一句话）

**壳子合格、页面"像"后台但不"像"医疗产品；阅片器是全站最重要也是最弱的一页，应当整体重做而非继续修补。**

- 做得好的（保留）：路由/lazy 分包、TanStack Query + Zustand 的数据层、OpenAPI 生成类型、Design Token 的 CSS 变量方案、深色主色克制、loading/empty/error 三态基本齐、Radix Dialog/Tabs 已落地、Findings 统一列表与阶段甘特的方向正确。
- 不合格的（重做）：① 阅片器视口布局与交互模型；② AI 面板信息架构；③ Dashboard 的"假信息"与空洞感；④ UI 基础组件库仍是半手写（原生 `<select>` / `<input type=range>` / 无 Tooltip / 无 Toast / 无 Sheet / 无 Command / 无 DropdownMenu），导致全站细节处处"差一口气"。

## 二、逐页实测问题（按页面）

### 2.1 全局壳（AppLayout / Sidebar / Topbar）
- ✅实测 **顶栏是一句口号**（"院内自研模型统一注册 · 调用 · 质控 · 交付"）占满 56px 高度，rough.png 里的**全局搜索 / 任务铃 / 用户菜单**一个都没有。顶栏应承载：面包屑（当前页上下文）、`Ctrl+K` 全局搜索入口（患者 / Study / 任务 / 模型）、运行中任务计数铃（点开是最近任务 popover）、主题切换、用户/机构菜单。
- ✅实测 **阅片页仍保留 240px 导航侧栏**，1280 宽下影像只剩约 600px。OHIF / Weasis / 所有 PACS 在阅片时导航都退为 48–56px 图标栏或完全隐藏。进入 `/viewer/:id` 应**自动折叠为图标栏**（离开恢复），并支持 `F11`/按钮全屏。
- 侧栏"标注质控 即将推出"作为一级导航常驻会让医院用户觉得"没做完"；建议移到 Settings→关于→路线图，或加 `Badge` 但默认隐藏。
- `Suspense` 在 `Routes` 外层：切页时整个 AppLayout 闪成骨架屏（TODO-3 已提，仍未改）。
- `src/assets/` 残留 `react.svg` / `vite.svg` / `hero.png` 未使用；`AppTopbar` 健康徽章文案 `API ok · v0.1.0` 是给开发者看的，不是给医生看的。

### 2.2 Dashboard（总览）
- ✅实测 **4 张 KPI 卡的 sparkline 全部是假曲线**（`sparkSeriesFromValue`），"平均 Dice"卡片显示绿色**下降线**——医疗产品里展示虚构趋势是硬伤（Grafana 原则：无时序就不画）。且 4 张卡 hint 前都带 `TrendingUp` 图标，与内容无关。
- ✅实测 "模型评估指标"卡（8 列）只有 2 行数据却撑到与右侧环形图等高，**下方 60% 空白**；环形图无中心总数、无数值/百分比、Legend 挤在底部；深色首屏偶发空白（N-F11 未修）。rough.png 的"环形 + 右侧横向条形 + 数量 + 百分比"更成熟。
- ✅实测 近期任务表"模型"列显示 `nodule_det` 这类 **model_id 而非中文名**；"耗时 0 ms"（缓存命中）无解释；时间"大约 8 小时前"（N-B4，后端问题但前端也应只接受带时区字符串）。
- 设计文档承诺的"多模态影像速览（缩略视口 + 运行 AI 入口）"完全没做；总览页没有任何影像元素，看不出是影像平台。
- 缺"队列水位 / 各模型今日调用次数 / 失败率 / P50-P95 耗时"这类运营指标（Triton / Grafana 标配），只有 4 个静态数。

### 2.3 数据中心（/data）
- ✅实测 只有 1 行数据（1 例 demo），表格能力（排序 / 列显隐 / 筛选 chip / 密度）看不出来；表格本身也没用 TanStack Table，仅 Dashboard 用了。
- ✅实测 操作列 3 个按钮"详情 / 送去分析 / 阅片"，其中"送去分析"与"阅片"跳同一 URL；`StudyDrawer` 底部两个按钮也是同一链接。
- ✅实测 **`StudyDrawer` 是手写遮罩，`Escape` 关不掉、无焦点锁定、无 `role=dialog`**（Playwright 实测 Esc 后遮罩仍拦截点击）。应换 Radix Dialog / shadcn Sheet。
- 搜索需要按回车或点"搜索"才生效，无 debounce 即时搜索；筛选只有模态一个维度（缺部位 / 日期范围 / 是否已分析 / 机构）；无 URL 同步（刷新丢筛选）。
- 表格缺"AI 状态"列（该 Study 最近一次分析：模型 / 状态 / 时间）——Infervision / Qure 的 worklist 都把 AI Result 作为一列，这是"影像 AI 平台"数据表与普通 PACS 列表的核心差别。
- 上传对话框：无进度条、无逐文件状态、无失败重试、无文件夹拖拽说明；"生成演示数据"按钮藏在上传弹窗里，空状态里也应有。

### 2.4 阅片器（/viewer/:id）—— 最重要、问题最多
**布局 / 视口**
- ✅实测 **影像只占视口约 25%**（256² 影像在 820×800 视口里渲染为 ~250px，四周大片黑边，N-F13 未修）；1280 宽下更小。必须 fit-to-window。
- ✅实测 **1280 宽下工具条溢出**：W/L 两个滑杆与"AI 分析"面板标题重叠（`ViewerToolbar` 是单行 flex 无 overflow 策略）。
- 单视口固定，无 1×1 / 1×2 / 2×2 布局切换，无 MPR（设计文档明确承诺过"打开胸部 CT 自动 2×2 MPR"，Hanging Protocol 一项未做）。
- 视口没有"激活态"边框；没有比例尺；没有方向标记（A/P/L/R）；四角信息不可配置且不随浅色主题变化。
- ✅实测 顶部条暴露开发用链接 **"CS3D Spike"**（viewer-home 卡片里也有"打开 CS3D Spike →"），应从用户可见 UI 移除（走 `?experimental=cs3d` 或 Settings 开关）。

**工具条**
- 5 个工具图标语义弱：缩放用 `MoveHorizontal`（左右箭头），卷帘用 `Rows3`；无文字标签、只有 `title`，没有 Tooltip 组件显示快捷键。
- 缺 PACS 必备：**W/L 预设下拉（肺窗 / 纵隔窗 / 骨窗 / 脑窗）、适应窗口、1:1、翻转 H/V、旋转、反色（有但图标是 `FlipVertical2`，语义错）、探针 HU、放大镜、Cine 播放、截图、清除测量**。
- 层滑杆与 W/L 滑杆挤在工具条中间，占 1/3 宽度：W/L 应改为拖动 + 预设，层导航靠滚轮 + 键盘 + 视口右侧细滑条（OHIF 风格）。
- 测量只有 Length；无 ROI（椭圆/矩形）、角度、双向径；测量结果没有列表面板，无法删除单条。

**AI 结果叠加**
- ✅实测 运行 lung_seg 成功后**视口无任何变化**——仍停在第 1 层（无肺），掩膜不可见，用户必须自己去 Findings 点一下才知道有结果。成功后应自动跳到代表层并短暂闪烁高亮。
- ✅实测 检测框颜色固定琥珀色、线宽 1.5px、标签文字与框重叠；被选中 finding 与其它 finding 视觉无差别；无"仅显示选中"模式。
- 分类结果没有 CAM 叠加（模型描述里写了"CAM 示意叠加"）；标签英文 `Benign / Malignant` 未本地化。
- 掩膜只有整体透明度；无 outline / fill 切换、无 outline 宽度（OHIF segmentation settings 齿轮里的四项）。

**右侧 AI 面板（信息架构）**
- ✅实测 一个 320px 面板从上到下线性堆叠：模型选择 → 描述 → 参数表单 → 运行按钮 → 进度 → 摘要 → 3 个开关 + 滑杆 → Findings → 报告面板。跑一次后 **Findings 被推到第二屏**，报告在第三屏。这是"表单页"不是"阅片辅助面板"。
- ✅实测 Findings 里 "Lung 95%" 把 Dice 当置信度显示；进度卡 stage 显示英文 `done`；缓存命中显示"耗时 0 ms"。
- 面板不可调宽、不可拖出为浮层、无 Tabs；没有"历史结果"（同一 series 之前跑过的任务）切换；没有"对比两次结果"。
- 模型下拉是原生 `<select>`，选项文字 `肺实质分割 · segmentation` 中英混排；不可用模型（模态不匹配）没有灰显与原因。

### 2.5 模型仓库（/models, /models/:id）
- ✅实测 分类 / 检测卡片显示 **`Dice 0.000`**（N-F12 未修）；卡片只有延迟 + Dice 两个数，没有"今日调用 / 成功率 / 最近一次运行"等运营信息。
- ✅实测 卡片网格 3 列在 1600 宽下第二行只有 1 张，视觉失衡；卡片高度不一致（描述长短）。
- 详情页"概览"一张卡后**整页空白 70%**；"输入约束"Tab 直接 `JSON.stringify` 展示 JSON——应渲染为表格（模态 / 部位 / 最小层数 / 层厚范围）；"版本历史"是写死的 `v1.0.0（当前）`。
- 缺：inputs/outputs schema 表、样例输入/输出图、评估集说明、变更日志、就绪状态历史（MLflow / HF Model Card / Triton 的标准区块）。
- `toggling={patchMutation.isPending}` 全局共享，点一张卡所有开关一起 disabled。

### 2.6 推理任务（/tasks, /tasks/:id）
- ✅实测 列表只有一个"状态"下拉筛选；无模型 / 患者 / 日期范围 / 关键字；无批量选择；无 URL 同步；成功任务全是 `100% · done` 绿条，一屏 12 行毫无信息量差异（应把"进度"列在终态折叠为耗时 + 缓存徽章，用颜色只标失败 / 运行中）。
- ✅实测 "模型"列显示 `lung_seg`；"任务"列显示 `8d02df43e8…4a43` 这种截断 hash——医生需要的是**患者 / 检查 / 模型名**，hash 应在详情。
- 详情页"阶段耗时"甘特在缓存命中时四段全 `—`，卡片空着；"推理结果"卡把整段 `result_json` **原样 `<pre>` 输出**（含 40 条 artifacts），这是调试视图不是产品视图；产物 Tab 是一串 `lung_0000.png`…`lung_0039.png` 文件名列表，应按类型分组（掩膜栈 1 项 + 报告 + SEG/SR/GSPS）并给预览。
- 日志时间线无 level 颜色、无 stage 过滤、无自动滚动到底、无复制；缺"打开阅片并加载此结果"深链（现在"打开阅片"只打开 study，结果丢失）。
- 取消 / 重试没有确认对话框、没有 Toast 反馈；mutation 全局单例导致按一行全表禁用。

### 2.7 系统设置 / 临床应用 / 标注质控 / 阅片首页
- Settings 只有主题开关 + 关于；设计文档承诺的"语言 / 默认布局与 Hanging Protocol / 默认 W/L 预设 / 存储路径 / 并发数 / 快捷键表"全无。
- ✅实测 临床应用页是**两段说明文字 + 一个 API 端点**——对医生完全无意义。要么做成"报告中心"（已生成报告列表、按患者查、预览 / 下载 SEG/SR/GSPS、发送 PACS 占位），要么合并进任务详情，把导航项去掉。
- `/viewer`（阅片首页）与 `/data` 功能重复；应改为"最近打开 / 待读 worklist"或直接跳转 `/data`。

### 2.8 基础组件与视觉细节（全站）
- `Select` / `Slider` 是原生控件，深色主题下下拉面板由浏览器渲染（白底），与整体风格割裂；`Switch` 手写；无 `Tooltip`（全靠 `title`，延迟 1s 且无样式）；无 `Toast`（所有 mutation 成功 / 失败靠行内红字或什么都没有）；无 `DropdownMenu`（操作列全部平铺按钮）；无 `Sheet`（Drawer 手写）；无 `Command`；无 `Resizable`（面板宽度固定）；无 `Breadcrumb`；无 `AlertDialog`（取消/重试无确认）。
- 字号体系：页面里出现 `text-[10px]` / `text-[11px]` 共 40+ 处，Findings 正文 11px、meta 10px——在 1080p 显示器上低于可读下限（Carbon / Ant 最小 12px；医院阅片室常用 24"+ 显示器远距离阅读）。
- `Badge` 全部同尺寸同圆角，状态徽章（成功/失败）与分类徽章（分割/CT）视觉无区分；`StatusBadge` 无图标、无脉冲动效区分"运行中"。
- 浅色主题：卡片 `shadow-sm` 几乎不可见、表头与内容对比弱；阅片页在浅色下左右面板变白而视口纯黑，边界刺眼——OHIF 的做法是阅片页**强制深色**，不跟随全局主题。
- 中英混排不一致：`Findings` / `Ready · 模型可用` / `done` / `series 1.2.826…` / `Im: 1 / 40` / `Anonymous`；应统一术语表（中文为主、DICOM 缩写保留）。
- 无 `prefers-reduced-motion`；键盘可达性：表格行 `onClick` 但不可 Tab 聚焦；纯图标按钮部分缺 `aria-label`。

## 三、对照标杆的差距清单（勾选 = 已具备）

| 领域 | 标杆做法 | 现状 |
|---|---|---|
| 壳 | 图标可折叠侧栏 + 面包屑 + `Cmd/Ctrl+K` + 通知铃 + 用户菜单（shadcn dashboard-01 / Linear） | ☑ 侧栏 ☐ 其余全部 |
| 阅片布局 | 阅片时导航退为图标栏；左序列 / 中 N×M 视口 / 右面板；面板可拖宽可折叠（OHIF / Weasis） | ☑ 折叠 ☐ 自动收侧栏 ☐ 拖宽 ☐ 多视口 |
| 工具条 | 主工具互斥高亮 + W/L 预设下拉 + 布局选择器 + 测量组 + 更多菜单；Tooltip 显示快捷键（OHIF） | ☑ 互斥高亮 ☐ 其余 |
| 视口 | fit-to-window、鼠标中心缩放、四角信息、比例尺、方向标、激活边框（OHIF / Cornerstone） | ☑ 四角 ☐ 其余 |
| AI 结果 | 找到结果自动跳代表层；findings 列表 + 置信度条 + 直径/体积/HU + 接受/拒绝 + hover 高亮；segment 列表带色块/眼睛/透明度/outline（Lunit / Annalise / OHIF Segmentation panel） | ☑ 列表+跳层 ☐ 自动跳 ☐ 接受/拒绝 ☐ hover 联动 ☐ outline |
| 数据表 | 标题 + 工具栏（搜索/筛选 chip/列设置/密度）+ 排序 + 分页 + 行选择 + 批量操作 + URL 状态（Carbon / ProTable / Vercel） | ☑ 分页 ☐ 其余 |
| 任务 | 状态 chip 语义色 + 筛选栏（状态/日期/模型/搜索）+ 批量 + 详情 Gantt + 日志（级别色/搜索/自动滚动）+ 重跑（GitHub Actions / Dagster / Temporal） | ☑ Gantt ☑ Tabs ☐ 筛选 ☐ 批量 ☐ 日志能力 |
| 模型 | 模型卡（描述/预期用途/限制）+ 版本表 + 指标按任务类型 + I/O schema 表 + 运行统计（MLflow / HF / NGC） | ☑ Tabs 骨架 ☐ 内容 |
| Dashboard | 只画真实时序；阈值配色；"总-分"层级；无数据显示 No data（Grafana / Ant 可视化规范） | ☐ |
| 状态与 a11y | Skeleton / Empty / Error 三态；Toast；AlertDialog 确认；WCAG AA 对比；12px 下限；焦点环 | ☑ 三态 ☐ Toast ☐ 确认 ☐ 字号 |

## 四、重构方案（不怕推倒重来的部分）

### 4.1 设计系统：补齐 shadcn/ui 基座（1 轮，是后面所有页面的前置）
- 用 shadcn CLI 正式引入并替换手写组件：`Tooltip`(+Provider) / `Select` / `Slider` / `Switch` / `DropdownMenu` / `Sheet` / `AlertDialog` / `Command` / `Popover` / `Breadcrumb` / `Sonner`(Toast) / `Resizable` / `ScrollArea` / `Toggle` + `ToggleGroup`（工具条用）/ `Separator`。保留现有 token 命名，把 shadcn 的 `--background/--foreground/--primary…` 映射到 `--surface-*/--fg/--brand`。
- 字号规范：正文 14 / 次要 13 / 最小 12；`text-[10px]`/`text-[11px]` 全部清零。数字列统一 `tabular-nums` + 右对齐。
- Badge 分两族：`StatusBadge`（带圆点，running 带脉冲）与 `TagBadge`（方角小字）。
- 阅片页强制 `data-theme=dark`，不跟随全局主题。
- 建立 `lib/i18n/terms.ts` 术语表（Findings→检出、Ready→就绪、Study→检查、Series→序列、done→完成…），全站文案走它。

### 4.2 阅片器：以"相机 + 图层"为核心重写 `features/viewer`（2 轮）
- **核心抽象** `features/viewer/core/`：`Camera {scale, tx, ty, flipH, flipV, rotation}`、`toScreen()/toImage()`、`fitToWindow(container, image)`、`zoomAt(point, factor)`；`Layer` 接口（`ImageLayer` / `MaskLayer` / `AnnotationLayer(SVG)` / `OverlayLayer`）共用同一相机矩阵。`StackViewport` 只做胶水；将来换 Cornerstone3D 只替换 `ImageLayer` 与相机来源。
- **布局** `ViewportGrid`：支持 1×1 / 1×2 / 2×2；`HangingProtocol` 规则表（CT CHEST → 1×1 默认，多序列 → 1×2）；激活视口 1px 品牌色边框；双击最大化。
- **工具条** `ViewerToolbar` 重做为三组：主工具 `ToggleGroup`（卷帘 / W/L / 平移 / 缩放 / 测距 / ROI / 探针）+ W/L 预设 `DropdownMenu`（肺 / 纵隔 / 骨 / 脑 / 自动）+ 视图 `DropdownMenu`（适应窗口 / 1:1 / 翻转 H·V / 旋转 / 反色 / 重置）+ 布局选择器 + 更多（Cine / 截图 / 清除测量）。每个按钮 `Tooltip` 显示名称与快捷键；窄屏自动收进"更多"。层导航：滚轮 / `↑↓` / `PgUp PgDn` / `Home End` + 视口右侧细滑条。
- **四角信息**：TL 患者、TR 检查/序列 + 激活工具、BL W/L + Zoom + 层厚 + HU 探针值、BR `Im n/N` + 比例尺；方向标 A/P/L/R。
- **AI 叠加**：结果到达 → 自动跳代表层 + 高亮 800ms；选中 finding 描边加粗 + 其它淡化；掩膜 outline/fill/opacity/width 四项；检测框颜色按标签色板、标签放框外并带背景；分类结果给 CAM 热图层（后端已承诺 `cam_overlay_uri`）。
- **进入阅片自动折叠导航侧栏**为图标栏；`[` `]` 折叠左右、`F` 全屏。

### 4.3 AI 面板：重组为 Tabs + 工作流（1 轮）
- 面板顶部 `Tabs`：**分析**（模型选择 Combobox：中文名 + 类型徽章 + 不适用灰显原因 → 参数 Accordion（默认收起，显示"参数 3 项"）→ 运行按钮 + 进度）｜**检出**（Findings：置信度排序、色块、直径/体积/层、接受 ✓ / 拒绝 ✗ / 待定，hover 联动视口，顶部统计"3 检出 · 2 已接受"，全选修正）｜**图层**（掩膜 per-label 开关 + 颜色 + outline/fill/opacity）｜**报告**（勾选项 → 生成 → 预览 → 下载 SEG/SR/GSPS）。
- 面板顶部固定"当前结果"卡：模型名 + 版本 + 完成时间 + 缓存徽章 + 历史结果切换下拉（同 series 的其它任务）。
- 面板可 `Resizable` 拖宽（280–480px）。

### 4.4 Dashboard 重做（0.5 轮）
- 第一行 KPI：今日任务 / 运行中+排队（阈值色）/ 成功率 / 平均耗时；**去掉 sparkline**，除非后端提供 `daily_tasks[7]`；hint 用真实同比（有则显示，无则不显示）。
- 第二行 8:4：左"近 7 日任务量 × 模型"堆叠柱（后端提供）或"待处理 worklist"；右"模型应用分布"环形 + 中心总数 + 右侧条形明细（rough.png）。
- 第三行：模型健康表（名称 / 类型 / 就绪 / 今日调用 / 成功率 / P50 耗时 / 指标按类型）+ 近期任务（患者 / 模型名 / 状态 / 耗时 / 时间）。
- 加"影像速览"卡：最近 4 个 series 缩略图 + "打开并分析"按钮，让总览有影像感。

### 4.5 数据中心 / 任务中心：统一 DataTable（1 轮）
- 抽 `components/DataTable`（TanStack Table + shadcn）：工具栏（搜索 debounce / 筛选 chip / 列显隐 / 密度）、排序、分页、行选择、批量操作条、空态、骨架、`useSearchParams` 同步。
- 数据中心列：患者 / 模态·部位 / 检查日期 / 序列·帧 / **AI 状态**（最近分析：模型名 + 状态徽章 + 时间）/ 入库 / 操作（主按钮"阅片"，其余进 `DropdownMenu`）。行点开 `Sheet`（Radix，Esc 可关）。
- 任务中心列：患者·检查 / 模型名 / 状态 / 耗时（终态）或进度（运行中）/ 创建时间 / 操作；筛选栏：状态多选 / 模型 / 日期范围 / 关键字；批量取消/重试带 `AlertDialog`；Toast 反馈。
- 任务详情："推理结果"改为结构化卡（分割：标签 / 体积 / 层范围；检测：表格；分类：概率条），JSON 折叠到"原始数据"；产物按类型分组；日志 level 色 + stage 过滤 + 自动滚动；"打开阅片"深链带 `?task=`。

### 4.6 模型仓库（0.5 轮）
- 卡片：名称 / 版本 / 类型 / 模态·部位 / 就绪点 / **指标按任务类型**（分割 Dice·HD95，检测 mAP·敏感度，分类 AUC）/ 今日调用 / 启停；固定高度。
- 详情：概览（预期用途 / 限制 / 描述）、输入约束**表格**、I/O 表、指标卡、版本表、运行统计（后端 `/stats/models/{id}`）、配置。

### 4.7 收口与删除
- 删除用户可见的 CS3D Spike 入口（保留路由，走 Settings→实验特性开关）；`/clinical` 改为"报告中心"或移除；`/viewer` 首页改为"最近打开"；`/annotation` 从主导航移除。
- Settings 补：主题 / 语言 / 默认 W/L 预设 / 默认布局 / 快捷键一览 / 关于。

## 五、建议轮次（前端专项，独立于 R8～R12 后端轮次；FE-1 是其余所有轮的前置）

| 轮 | 内容 | 验收（Playwright 断言 + 截图对照） |
|---|---|---|
| **FE-1 基座** | 4.1 全部；`Suspense` 下沉到 `Outlet`；删除残留资产与 Spike 入口；术语表 | 全站无原生 select/range；无 `text-[10px]/[11px]`；Esc 可关所有浮层；每个 mutation 有 Toast；axe 无 serious 违规 |
| **FE-2 阅片器 A** | 4.2 相机/图层核心 + fit-to-window + 工具条重做 + 四角/比例尺 + 侧栏自动折叠 | 1280/1600/2560 三档影像占视口短边 ≥ 90%；放大后拖动 1:1 跟手；鼠标中心缩放不漂；截图对照 OHIF toolbar |
| **FE-3 阅片器 B + AI 面板** | 4.2 布局网格/HP + AI 叠加增强 + 4.3 面板 Tabs/工作流 | 运行 lung_seg 后 1s 内视口自动到代表层且掩膜可见（读像素）；finding hover 高亮；接受/拒绝进报告 |
| **FE-4 表格与任务** | 4.5 DataTable + 数据中心 / 任务中心 / 任务详情 | 筛选状态 URL 可复现；批量取消带确认；任务详情不再出现原始 JSON 首屏 |
| **FE-5 总览与模型** | 4.4 + 4.6 + Settings | 首屏无一处虚构数据；分类/检测卡不显示 Dice；模型详情无 `JSON.stringify` |

> 依赖后端的最小改动（不在本轮，但 FE-3/FE-5 需要）：`/stats/overview` 补 `daily_tasks[7]` 与 per-model 统计；`ModelSpec.metrics` 按 task_type 判别联合；`/studies` 项补 `last_task{model_id,status,created_at}`；`InferenceResult` 掩膜 finding 不再复用 `dice` 字段当置信度。

## 六、优先级提醒
1. **先做 FE-1**：没有 Tooltip/Toast/Select/Sheet/AlertDialog 这套基座，后面每一页都会再手写一遍。
2. **阅片器（FE-2/3）占前端总工时的一半是合理的**——它是医院用户 90% 停留时间所在，也是与"普通后台"拉开差距的唯一地方。
3. 一切"看得见的假/错"（假 sparkline、Dice 0.000、0 帧、0 ms、model_id 当名字、英文 stage）必须在任何视觉打磨之前清零。

---

# （以下为原始审查条目备份，勾选状态以上方为准）

## A. Critical（原始）

- [x] **A-1 ✅实测 demo 数据重复入库导致影像/AI 结果错位**：`StudyService.ensure_demo_data` 先 `write_synthetic_dicom_series` 写 40 张 `IMG*.dcm` 到 series 目录，再 `ingest_path` 把同目录文件复制回同目录成 `0001_*.dcm`——磁盘上 80 个文件。模型侧 `read_series_volume` 按目录读出 **80 层** 体数据，而前端 instances 只有 40 层 → 实测检测结果 `slice_index=53` 超出 0–39 范围，**检测框在前端永远不显示、掩膜 slice 对不上**。修法：合成数据写到临时目录再 ingest；或 ingest 时按 SOP UID 去重。（`backend/app/services/study_service.py:202-226`）
- [x] **A-2 ✅实测 SSE 进度事件从未发出**：`progress_cb` 里 `asyncio.get_event_loop()` 在 worker 线程中拿不到运行中的主 loop（`loop.is_running()` 恒 False），`queue.emit` 从不执行；`_worker_loop` 也不发 `succeeded/canceled` 终态事件。实测 SSE 连接全程只收到 1 条 snapshot，任务完成也无事件。修法：TaskQueue 启动时保存主 loop 引用（`asyncio.get_running_loop()`），worker 用 `run_coroutine_threadsafe(…, self._loop)`；worker loop 补发终态事件。（`backend/app/services/task_service.py:277-297`、`backend/app/infra/queue.py:97-127`）
- [x] **A-3 ✅实测 `num_instances` 恒为 0**：`SessionLocal` 配了 `autoflush=False`，`_upsert_study` 里 `db.add(InstanceRow…)` 后立刻 `select(InstanceRow)` 统计——pending 对象未 flush，查出来是 0。实测 API 返回 series/study 的 `num_instances=0`（实际 40）。连锁影响：模型 `max(series.num_instances, 8)` 的兜底、前端切片总数显示。修法：统计前 `db.flush()`，或直接 `len(series_items)` 累加。（`backend/app/services/study_service.py:162-181`、`backend/app/infra/db.py:39`）
- [x] **A-4 安全：产物下载目录遍历**：`get_artifact` 的 fallback `Path(task.work_dir)/"output"/name` 未对 `name` 归一化，`name=../../…` 可读任意文件；且目录型产物（PNG stack）会落到 `FileResponse(目录)` 直接 500。修法：`name` 白名单比对 artifacts 列表 + `resolve()` 后 `relative_to` 校验；目录产物改为 zip 打包或列表接口。（`backend/app/api/routes/tasks.py:159-189`）
- [x] **A-5 安全：ZIP zip-slip + 临时目录泄漏**：`_extract_zip_dicoms` 用 `zf.extractall` 未过滤 `..`/绝对路径；解压出的 tmp 目录无人清理。另 DICOM UID（study/series/sop）直接拼存储路径，恶意 UID 含 `../` 可越界写——入库前校验 `^[0-9.]+$`。（`backend/app/imaging/dicom_io.py:128-132`、`backend/app/infra/storage.py:19-33`）
- [ ] **A-6 前端掩膜叠加是"全屏色块"不是像素掩膜**：`maskHint` 只是给整个画布盖一层纯色 div（`mix-blend-screen`），完全没读取 `mask.uri` 的真实掩膜数据；多 label 只取第一个。这是医学阅片的核心能力，必须改为：加载掩膜 PNG/数据 → 离屏 canvas 按 label 着色 → 与影像 canvas 合成（或 SVG path）。（`frontend/src/features/viewer/StackViewport.tsx:89-92,120-129`）
- [ ] **A-7 前端帧缓存形同虚设**：加载 effect 依赖数组含 `sliceIndex`，每次滚动切片先 `cacheRef.current.clear()` 再加载——缓存永远只有 1 帧，每层都重新网络请求+解码，滚动体验差。修法：清缓存只在 `seriesUid` 变化时做（拆成两个 effect），并加相邻层预取。（`frontend/src/features/viewer/StackViewport.tsx:39-77`）
- [x] **A-8 错误响应体两套并存**：`HTTPException` 走 FastAPI 默认 `{"detail": {...}}`，兜底处理器返回 `{code,message,trace_id}`，违背设计的统一错误体（前端 `err as ApiError` 解析也会随之出错）。修法：加 `@app.exception_handler(HTTPException)` 统一改写；兜底处理器不要 `bind_trace_id()` 重新生成 trace（会与日志 trace 不一致），也不要把 `str(exc)` 原样返回给客户端。（`backend/app/main.py:67-73` + 各 routes）
- [x] **A-9 测试数据库/存储不隔离**：`engine` 模块导入即创建，测试改 `database_url` 无效（测试文件注释已自认）；实测 pytest 把 8 个 study 写进了真实 `storage/`。修法：engine 延迟/工厂化创建，测试用 tmp_path 覆盖 storage_dir 与 db。（`backend/app/infra/db.py:38`、`backend/tests/test_api.py`）

## B. Major（显著影响质量/体验/可维护性）

后端：
- [x] **B-1 分层违规**：4 个模型插件的 `postprocess` 直接 `from app.infra.storage import StorageService`（违背"models_hub 只依赖 domain"）；`TaskService` 依赖具体类 `BaseFakeModel` 而非 `ModelPlugin` 协议（`isinstance` 分支限定插件必须继承它）；`api/routes/tasks.py` 直接操作 StorageService。修法：产物落盘/to_uri 收敛到 Orchestrator，服务层面向 Protocol。
- [x] **B-2 上传阻塞事件循环**：`upload_studies` 在 async 路由里同步做解析/复制/缩略图，大 ZIP 会卡死所有请求 → `await asyncio.to_thread(...)`。（`backend/app/api/routes/studies.py:14-27`）
- [x] **B-3 参数未按 `params_schema` 校验**：`TaskCreateRequest.params` 只合并默认值，错误类型会在模型内部炸出 500 而非 400 → 用 `jsonschema` 在 `create_task` 校验。幂等哈希应含 `model_version` 且 `params` 用 `json.dumps(sort_keys=True)`（nodule_seg 的 seed 也有 `str(ctx.params)` 键序不稳问题）。
- [x] **B-4 幂等并发竞态**：同 `(series,model,params)` 并发创建会重复计算——`(series_uid,model_id,params_hash,status)` 加唯一约束或建任务加锁。
- [x] **B-5 lung_seg 只保留单侧肺**：先 `largest_connected_component` 再取 top-2 连通域，顺序反了（先 label 取 top-2 再合并）。`stage_timings` 声明后从未填充（设计承诺的阶段耗时打点）。SSE 端点应自建 `SessionLocal()` 而非复用 Depends 会话撑长连接；补 `Cache-Control: no-cache`、`X-Accel-Buffering: no` 头。
- [ ] **B-6 测试覆盖太薄**：仅 4 条。补：上传（含恶意 zip/坏文件）、取消/重试、SSE 事件序列、artifact 下载（含遍历攻击用例）、错误路径（未知模型/禁用模型/409）、队列并发、`dicom_io`/`mask_utils` 单测。

前端：
- [ ] **B-7 阅片器交互缺失**：无 Pan（只有固定中心的 CSS scale 缩放）、无测量工具（Length/ROI）、无鼠标位置感知缩放、wheel 闭包用 `sliceIndex` 而非 `setSliceIndex(prev=>…)`（快速滚动丢层）。检测框 SVG `preserveAspectRatio="none"` 在非等比容器会拉伸变形。
- [x] **B-8 SSE/轮询主次颠倒 + 无重连**：实现是 1s 轮询为主、SSE 只用来触发 invalidate；`sse.ts` 无 onerror/重连/backoff。改为 SSE 主通道（收到事件 setQueryData 或 invalidate）+ 轮询兜底，封装 `useTaskSSE(taskId)`（指数退避重连）。
- [x] **B-9 路由未按页 lazy 分包**：`BrowserRouter` 同步 import 全部页面，单 chunk 763KB → `React.lazy` + `Suspense`（或 `createBrowserRouter` + lazy loader），本身就是设计文档承诺项。
- [x] **B-10 类型安全**：`request<T>` 里 `undefined as T`、多处 `as X` 强转、手写 `types/api.ts`。落地设计承诺的 `openapi-typescript`（后端已有 /openapi.json），脚本 `generate:api` + CI diff 校验，消除前后端类型漂移。
- [x] **B-11 `ModelParamsForm` 未用 react-hook-form + zod**（依赖已装未用）：无 min/max/required 校验、无错误提示；应由 `params_schema` 驱动动态生成 + zod 校验。
- [x] **B-12 零散正确性**：`task-detail.tsx` retry 后 `window.location.assign` 整页刷新 → `useNavigate`；`model-detail.tsx` refetch 会覆盖用户已改参数（依赖 `model.data` 引用）；`_stale/` 目录是重复废弃文件，删除；`useCornerstoneInit` 空桩被调用后 `void` 丢弃，删除或真正接入；缩略图 `<img>` 无 onError 兜底。
- [x] **B-13 可访问性**：自写 Dialog 无 `role="dialog"`/`aria-modal`/焦点锁定，Tabs 无 `role="tablist"`，Slider 无 aria-label。设计选型本是 shadcn/ui（Radix 基座），现在是手写仿制——建议引入 Radix primitives 换掉手写 Dialog/Tabs，可访问性免费获得。
- [x] **B-14 阅片布局无响应式**：固定 `grid-cols-[200px_1fr_320px]`，小屏无法折叠左右栏；补面板折叠 + 快捷键（设计承诺的 `1-4` 切工具、`R` 重置等一项都没做）。

## C. 界面/产品力提升（对照高质量项目）

- [ ] **C-1 视口四角信息叠加（OHIF 范式）**：左上患者（姓名/ID/性别/年龄）、右上检查/序列描述、左下 W/L+Zoom+层厚、右下 slice n/N。现在只有左下一条，信息密度不够"专业阅片"。
- [x] **C-2 AI 结果面板 → Findings 列表**：masks/boxes/predictions 统一为按置信度排序的 findings 列表（标签、置信度色条、直径/体积、所在层、颜色点、显示开关），点击跳层+高亮+居中。这是 Lunit/Aidoc 等商用产品的标准形态，比现在的分区块罗列专业得多。
- [x] **C-3 任务详情页升级（GitHub Actions/Prefect 范式）**：阶段横向时间线（preprocess→infer→postprocess→writing 各段耗时甘特，依赖 B-5 的 stage_timings）+ 实时日志流（SSE 追加、level 高亮、stage 过滤）+ Tabs（概览/日志/产物/参数），产物可下载。
- [x] **C-4 Dashboard 打磨（Grafana/Vercel 范式）**：KPI 卡加 sparkline 微趋势和阈值变色（如队列积压>N 变红）；图表颜色引用 CSS 主题变量而非硬编码 hex（浅色主题下现有硬编码色会失衡）；表格换 TanStack Table（排序/分页，依赖已装未用）；数字 `tabular-nums`。
- [x] **C-5 模型仓库补"模型卡"**：详情页展示 inputs/outputs/约束/指标/版本历史（MONAI Bundle metadata 范式）；后端补 `GET /models/{id}/ready`、health 拆 live/ready 分层（Triton 范式），为将来接真模型留口。
- [x] **C-6 结构化报告（二期，正式对接医院的关键差异化）**：勾选 findings 生成中文结构化报告；后端用 highdicom 导出 DICOM SEG（掩膜）/ SR-TID1500（测量）/ GSPS（检出框），结果写入模型身份（Contributing Equipment）。此为设计文档"非目标（留接口）"，纳入二期而非本轮。

## D. 建议整改轮次（按依赖排序，每轮可独立验收）

| 轮 | 内容 | 验收 |
|---|---|---|
| R1 | A-1~A-5、A-8、A-9（后端正确性+安全+测试隔离），补 B-6 对应回归测试 | pytest 全绿且能复现修复；SSE 用例收到 progress+succeeded；恶意 zip/遍历用例被拒 |
| R2 | A-6、A-7、B-7（阅片器：像素掩膜、缓存/预取、Pan/测量/滚动修复）+ C-1 | 手动阅片：滚动流畅、掩膜逐像素贴合、框不变形 |
| R3 | B-8~B-11（SSE 主通道、lazy 路由、OpenAPI 类型、动态表单）| build 分包生效；类型由 openapi 生成；表单有校验 |
| R4 | B-1~B-5、B-12~B-14（分层/校验/竞态/细碎修复/可访问性/响应式）| ruff+mypy 干净；Radix 基座落地 |
| R5 | C-2~C-5 产品力打磨 + Playwright E2E 冒烟（上传→推理→叠加全链路）| E2E 一条过；界面对照验收 |
| R6（二期）| C-6 结构化报告/DICOM SEG/SR 导出；Cornerstone3D 视口替换评估 | 另行设计定稿 |

> 备注：调研中评估过"直接换 Cornerstone3D"——结论是**先修好自研 viewer 的 A/B 级问题**（掩膜、缓存、Pan/测量满足 MVP 演示），Cornerstone3D 迁移放 R6 单独 spike（WASM/worker/Vite 配置风险高，见轮次1风险清单），避免在正确性 bug 未清的情况下引入新的大变量。