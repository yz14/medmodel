# VoxFlow 设计文档

本文档整理 VoxFlow 的架构约定、分层边界、领域契约与扩展方式。README 负责导航与上手，[`WORKFLOW.md`](WORKFLOW.md) 负责端到端时序；本文件把实现背后的设计原则和跨模块关系讲清楚。

## 0. 产品边界

| 在范围内 | 不在范围内（MVP） |
|---|---|
| Study / Series / Instance 入库与帧服务 | 真实 PACS / HL7 / 工作列表对接 |
| 模型插件注册、启停、参数校验 | 真权重训练与部署（假模型跑通流程） |
| 异步推理任务（队列 + SSE + 轮询） | 生产级 Celery/Redis（接口形态已对齐，实现可替换） |
| 自研阅片视口 + AI 叠加 + Findings / 报告演示 | Cornerstone3D 作为默认交付（仅实验 spike） |

**假模型、真流程**：插件算法可替换；上传 → 任务 → 产物 URI → 阅片叠加的契约保持稳定。

## 1. 总体架构

```text
浏览器 (React / Vite)
  ├── pages / features / stores
  └── fetch /api/v1/*  (+ SSE /events)
        │
        ▼
FastAPI (app.main)
  ├── api/routes + schemas     # HTTP 边界、OpenAPI
  ├── services/*               # 业务编排（唯一写业务规则处）
  ├── models_hub/*             # 模型插件（preprocess→infer→postprocess）
  ├── imaging/*                # DICOM IO / mask / 演示导出
  ├── domain/*                 # 契约 dataclass + 枚举（无 IO）
  └── infra/*                  # DB / 队列 / 存储 / 配置 / 日志
        │
        ├── SQLite (data/)
        └── 文件存储 (storage/)
```

### 1.1 分层职责

| 层 | 真相源 | 允许依赖 | 禁止 |
|---|---|---|---|
| `domain` | `contracts.py` / `enums.py` | 标准库 | DB、HTTP、文件系统细节 |
| `infra` | `config` / `orm` / `queue` / `storage` | domain（类型） | 业务规则、插件算法 |
| `models_hub` | `ModelPlugin` + `registry` | domain、imaging 工具 | 直接写 HTTP / 改 TaskRow |
| `services` | Study / Task / Model / Stats / Report | infra + models_hub + domain | 绕过 service 在 route 里堆逻辑 |
| `api` | routes + Pydantic schemas | services | 直接操作队列/插件细节 |
| `frontend` | `lib/api.ts` + OpenAPI 类型 | `/api/v1` | 假设私有存储路径 |

### 1.2 启动时序

```text
create_app()
  └── lifespan
        ├── setup_logging / ensure_dirs
        ├── configure_engine + init_db（含 Alembic upgrade）
        ├── load_all_plugins() → registry
        ├── TaskQueue.start()（并发 worker）
        └── StudyService.ensure_demo_data()
```

请求经 `X-Trace-Id` 中间件绑定；任务行回显 `trace_id`，worker 日志同源。

## 2. 领域契约（单一真相源）

核心类型在 `backend/app/domain/contracts.py` 与 `enums.py`。HTTP schema（`api/schemas.py`）是对外投影，应与契约对齐，而不是另起一套语义。

### 2.1 模型规格 `ModelSpec`

插件对外声明：

- 身份：`id` / `name` / `version` / `task_type`
- 适用性：`modalities` / `body_parts` / `input_constraints`
- 参数：`params_schema`（JSON Schema）
- 产物声明：`outputs[]`（`result_type`）
- 展示：`metrics` / `expected_latency_ms` / `tags` / `enabled`

前端模型卡片、兼容性检查、参数表单都从这里派生。

### 2.2 推理上下文 `InferenceContext`

编排器（`TaskService.run_task`）构造并注入：

| 字段 | 含义 |
|---|---|
| `task_id` / `work_dir` | 任务工作区 `input/` + `output/` |
| `series` | `SeriesMeta`（UID、模态、几何摘要） |
| `params` | 已 merge + jsonschema 校验后的参数 |
| `progress_cb` | 进度 → DB 日志 + SSE |
| `volume` | **编排器预加载的体数据**；插件禁止自行读 DICOM |
| `cancel_check` | 协作式取消 |
| `extras` | sidecar（如 phantom 种植结节） |

约定（N-B8）：插件通过 `require_volume(ctx)` 取体积，保证 IO 路径统一、可测、可替换。

### 2.3 推理结果 `InferenceResult`

按 `ResultType` 填充对应字段：

- segmentation → `masks[]`（`MaskArtifact`：label、color、encoding、uri、体积等）
- detection → `boxes[]`（2D/3D bbox、置信度、层号）
- classification → `predictions[]` + 可选 `cam_overlay_uri`
- 通用 → `artifacts[]`、`summary`、`runtime_ms`

插件可写本地绝对路径；编排器用 `materialize_storage_uris` 转为 `storage://…`，前端经 `/tasks/{id}/artifacts|mask-frames` 拉取。

### 2.4 任务状态机

```text
queued → running → succeeded
                 ↘ failed
                 ↘ canceled
```

阶段 `TaskStage`：`queued` / `preprocess` / `infer` / `postprocess` / `writing` / `done`。  
进度与阶段写入 `TaskLogRow`，并通过队列 `emit` 推 SSE。

## 3. 模型插件体系

### 3.1 契约 `ModelPlugin`

```text
load() → preprocess(ctx) → infer(data, ctx) → postprocess(raw, ctx) → InferenceResult
```

假模型基类 `BaseFakeModel` 提供：

- 分阶段进度与 `stage_timings`
- 可中断 sleep（取消）
- 稳定随机种子 `stable_seed`

`TaskService.run_plugin`：若插件有 `.run` 则调用，否则按三步执行。

### 3.2 注册

`models_hub/__init__.py` 的 `_PLUGIN_MODULES` 显式 import；模块导出 `plugin`，`registry.register`。  
新增模型：新建包 → 实现契约 → 加入列表 → 重启即可被 `GET /models` 发现。

### 3.3 输入约束与去重

- `constraints.check_input_constraints`：模态 / 部位 / `min_slices` 等
- `params_hash(model, version, series, params)`：同参 inflight 复用；成功缓存可短路（见 TaskService）

## 4. 任务编排与队列

### 4.1 HTTP 语义（Celery 形态）

| 操作 | 行为 |
|---|---|
| `POST /tasks` | **202** + `task_id` |
| `GET /tasks/{id}` | 状态 / 进度 / 错误 |
| `GET /tasks/{id}/result` | 成功结果 |
| `GET /tasks/{id}/events` | SSE 事件流 |
| `POST …/cancel` / `retry` | 取消 / 重试 |

### 4.2 进程内队列 `TaskQueue`

- `max_concurrency`（`VOXFLOW_TASK_MAX_CONCURRENCY`）
- `enqueue` / `request_cancel` / `subscribe` / `emit`
- worker 线程侧用 `emit_threadsafe` 回主 loop

替换 Redis/Celery 时：保持上述 HTTP 与事件字段，换掉 `infra/queue.py` 实现即可。

### 4.3 `run_task` 骨架

```text
加载 TaskRow + Series
  → 校验模型启用 / 约束 / 参数
  → 建 WorkDir，预加载 volume → InferenceContext
  → run_plugin
  → URI 物化、结果落库、ArtifactRow
  → 状态 succeeded / failed / canceled + SSE
```

## 5. 影像与存储

### 5.1 实体关系

```text
Study 1─* Series 1─* Instance
Task *─1 Series（推理绑定序列）
Task 1─* Artifact / TaskLog
```

### 5.2 路径约定

| 用途 | 位置 |
|---|---|
| SQLite | `VOXFLOW_DATA_DIR`（默认 `./data`） |
| DICOM / 产物 | `VOXFLOW_STORAGE_DIR`（默认 `./storage`） |
| 逻辑 URI | `storage://…`（禁止前端硬编码绝对盘符） |

### 5.3 帧服务

- `GET /series/{uid}/frames/{idx}` — 阅片像素源（含 wadouri 实验路径）
- `GET /series/{uid}/thumbnail`
- `GET /tasks/{id}/mask-frames/{slice}` — 分割叠加

成像工具在 `imaging/dicom_io.py`、`mask_utils.py`；DICOM SEG/SR/GSPS 演示导出在 `dicom_export.py`（非生产 PACS 对接）。

## 6. 前端边界

### 6.1 目录约定

| 目录 | 职责 |
|---|---|
| `pages/` | 路由级页面组合 |
| `features/*` | 业务纵切（viewer / models / tasks / data） |
| `components/` | 通用 UI 与复合件 |
| `stores/` | 跨组件 UI 状态（viewer / ui） |
| `lib/api.ts` | **唯一** HTTP 客户端门面 |
| `types/api.ts` + `openapi.d.ts` | 契约类型；`generate:api:check` 防漂移 |

### 6.2 阅片栈

正式路径 `/viewer/:studyId`：

- 帧栈加载 → 自研 `StackViewport`（`features/viewer/core`：camera / layers / presets）
- `AiPanel`：选模 → `POST /tasks` → `useTaskSSE` → `setResult` → mask/box 叠加
- Findings 审阅 → `ReportPanel` 导出演示报告

实验路径 `/viewer-cs3d/:studyId`：见 [`r6-cornerstone3d-spike.md`](r6-cornerstone3d-spike.md)；默认设置关闭入口。

### 6.3 错误与上传

- 统一 `ApiError` / `errorMessage` / Toast
- 上传 Zod schema 与后端 413 上限对齐（`MAX_UPLOAD_BYTES` / `MAX_UPLOAD_FILES`）

## 7. API 面一览

前缀：`/api/v1`

| 资源 | 主要端点 |
|---|---|
| health / metrics | `/health`、`/health/live`、`/health/ready`、`/metrics` |
| stats | `/stats/overview` |
| studies | upload / list / get / seed-demo |
| series | summary / instances / frames / thumbnail |
| models | list / get / patch(启停等) / ready |
| tasks | create / list / get / result / events / cancel / retry / reports / mask-frames / artifacts |

OpenAPI：`/docs`；前端类型由 OpenAPI 生成并 CI 校验。

## 8. 可观测性与运维约定

- 结构化日志 + `trace_id`
- Prometheus text：`/api/v1/metrics`
- Liveness vs Readiness 分离（ready 含 DB / 模型数 / 队列）
- 错误体：`{ code, message, details?, trace_id }`

## 9. 扩展指南（最短路径）

### 9.1 新假模型

1. `models_hub/<id>/__init__.py` 实现 `BaseFakeModel` + `spec`
2. 加入 `_PLUGIN_MODULES`
3. 写约束与 `params_schema`；按需更新前端兼容展示
4. 后端 pytest + 可选 e2e 冒烟

### 9.2 新业务 API

1. schema → service 方法 → route
2. 再生 OpenAPI / 跑 `generate:api:check`
3. `lib/api.ts` 增加方法；页面走 React Query

### 9.3 换真推理后端

保持 `ModelPlugin` 与 `InferenceResult`；在 `infer` 内调外部服务，或替换 `TaskQueue` 为 Celery，**不要**让 route 直接耦合执行器。

## 10. 相关文档

- [`../README.md`](../README.md) — 导航与快速开始
- [`WORKFLOW.md`](WORKFLOW.md) — 端到端流程
- [`r6-cornerstone3d-spike.md`](r6-cornerstone3d-spike.md) — CS3D 评估结论
- [`../TODO.md`](../TODO.md) — 产品原则与仍开放项
