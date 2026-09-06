# VoxFlow 流程总览

本文档描述开发与运维最常碰到的端到端路径：本地起服、数据入库、推理任务、阅片叠加、报告演示，以及测试/部署。设计原则见 [`DESIGN.md`](DESIGN.md)。

## 0. 共享主干

产品主链路只有一条：

```text
上传或 Demo 种子 → Study/Series/Instance 入库
  → 阅片加载帧
  → 选择模型 + 参数 → POST /tasks（202）
  → 队列 worker：preload volume → preprocess → infer → postprocess → 写产物
  → SSE / 轮询进度 → GET result
  → 视口叠加 mask / box / 分类概率
  → Findings 审阅 → 报告导出（演示）
```

差异只在 **模型插件**（分割 / 检测 / 分类产物形状）与 **前端叠加层**，编排与 HTTP 形态不变。

### 任务类型对照

| | segmentation | detection | classification |
|---|---|---|---|
| 代表模型 | `lung_seg` / `nodule_seg` | `nodule_det` | `nodule_cls` |
| 结果字段 | `masks[]` | `boxes[]` | `predictions[]` (+ CAM 可选) |
| 阅片叠加 | PNG stack / mask-frames | 层上 bbox | 概率列表 / 可选热力 |
| Findings | 标签体积等 | 检出框置信度 | 类别概率 |

---

## 1. 本地开发起服

### 1.1 双进程（日常开发）

```text
终端 A：uvicorn app.main:app --reload --port 8000
终端 B：npm run dev（Vite :5173，代理 /api → 8000）
```

浏览器只访问前端源。若 API 改端口（如 `8040`）：

```powershell
$env:VOXFLOW_API_PROXY="http://127.0.0.1:8040"
npm run dev
```

代理未对齐时表现为前端 `ECONNREFUSED`，优先查端口与 `VOXFLOW_API_PROXY`。

### 1.2 单入口（接近生产）

```text
docker compose up --build
  → 浏览器 :8080
  → nginx 反代 /api 到后端容器
```

持久化挂载 `data/` 与 `storage/`。

### 1.3 启动后应具备

- 插件已注册（`GET /api/v1/models`）
- Demo 多模态检查已种子（CT 胸/头、MR 脑、DR 胸等）
- 队列 worker 已起（`GET /api/v1/health/ready` 含 queue 统计）

---

## 2. 数据入库

### 2.1 Demo 种子

```text
lifespan → StudyService.ensure_demo_data()
  或 POST /api/v1/studies/seed-demo
```

用于无 DICOM 时的冒烟与演示。

### 2.2 上传

```text
前端：数据中心 multipart 上传（DICOM / ZIP）
  → POST /api/v1/studies/upload
        ├── 校验体积 / 文件数（超限 413）
        ├── 解析 DICOM，按 Study/Series/SOP 归组
        ├── 写入 storage/，缩略图可选
        └── DB：StudyRow / SeriesRow / InstanceRow
  ← StudyUploadResponse（study_uid 等）
```

前端 Zod 与后端上限应对齐；错误走统一 Toast（`lib/errors`）。

### 2.3 列表与最近任务

```text
GET /studies?page&modality&body_part&q
  → StudySummary（可含 last_task 摘要）
```

数据表在任务 queued/running 时可短轮询，刷新 AI 状态列。

---

## 3. 阅片加载

### 3.1 进入检查

```text
/viewer/:studyId
  → GET /studies/{uid}
  → 选 Series → GET /series/{uid}/instances
  → 按层 GET /series/{uid}/frames/{idx}
  → 解码 → StackViewport（窗宽窗位 / 滚轮 / 网格）
```

正式路径不依赖 Cornerstone3D。实验路径：`/viewer-cs3d/:studyId`（设置里开启入口）。

### 3.2 工具与图层

状态在 `viewer-store`：窗宽窗位预设、mask 显隐与透明度、box、标注开关、当前层号、选中模型与 activeTaskId。

---

## 4. 推理任务（核心）

### 4.1 创建

```text
AiPanel / 任务页
  → 兼容性检查（modality / body_part / min_slices）
  → POST /api/v1/tasks { series_uid, model_id, params }
        ├── 模型存在且 enabled
        ├── check_input_constraints
        ├── merge_and_validate_params（schema + 默认 + 用户）
        ├── params_hash：inflight 同参直接返回已有任务
        ├── 可选：成功缓存短路
        ├── 插入 TaskRow(queued) + 入队
        └── 202 TaskCreateResponse
```

### 4.2 Worker 执行

```text
TaskQueue worker
  → TaskService.run_task(task_id)
        ├── status=running，绑定 trace_id
        ├── 读 Series → 预加载 volume
        ├── InferenceContext(work_dir, progress_cb, cancel_check, …)
        ├── run_plugin：
        │     preprocess → infer → postprocess（或 .run）
        │     progress_cb → TaskLog + SSE(progress/stage)
        ├── materialize_storage_uris
        ├── 持久化 result JSON / ArtifactRow
        └── status=succeeded | failed | canceled
```

阶段进度典型：`preprocess` → `infer` → `postprocess` → `writing` → `done`。

### 4.3 前端跟踪

```text
useTaskSSE(taskId)
  → GET /tasks/{id}/events（SSE）
  → 更新进度条 / 阶段；结束则 GET /tasks/{id}/result
  → setResult → 视口叠加
```

SSE 不可用时可回退轮询 `GET /tasks/{id}`。任务详情页另有日志时间线与阶段 Gantt。

### 4.4 取消与重试

```text
POST /tasks/{id}/cancel  → queue.request_cancel；插件 cancel_check 抛 TASK_CANCELED
POST /tasks/{id}/retry   → 新任务或重入队（202）
```

---

## 5. 产物与叠加

### 5.1 分割

```text
插件写 PNG stack（或约定 encoding）到 work_dir/output
  → uri → storage://…
  → 前端 GET /tasks/{id}/mask-frames/{slice}
  → layers 合成（opacity / enabledMaskIds）
```

### 5.2 检测

```text
boxes[]（slice_index + bbox）
  → 当前层绘制矩形 / 高亮 Finding
```

### 5.3 分类

```text
predictions[] 展示概率
  → 可选 cam_overlay_uri 作为叠加图
```

### 5.4 Findings → 报告

```text
buildFindings(result)
  → 接受 / 拒绝 / 修正（前端审阅状态）
  → POST /tasks/{id}/reports（演示 SEG/SR/GSPS 等）
  → ReportPanel 下载或展示
```

---

## 6. 模型运营

```text
GET /models?enabled=
GET /models/{id} / PATCH（启停、默认参数等）
GET /models/{id}/ready
```

模型仓库页按 `task_type` 展示卡片与指标；详情页可改运营态。禁用后 `POST /tasks` 应拒绝。

---

## 7. 仪表盘与任务中心

```text
GET /stats/overview → 仪表盘真实统计
GET /tasks?status&model_id&q → 任务列表筛选
GET /tasks/{id} + logs → 详情排障
```

排障优先看：`trace_id`、阶段日志、`error_code` / `error_message`、队列 ready 探针。

---

## 8. 配置与数据流（运维）

| 变量 | 作用 |
|---|---|
| `VOXFLOW_DATA_DIR` | SQLite 等 |
| `VOXFLOW_STORAGE_DIR` | DICOM 与产物 |
| `VOXFLOW_DATABASE_URL` | DB URL |
| `VOXFLOW_TASK_MAX_CONCURRENCY` | 推理并发 |
| `VOXFLOW_MAX_UPLOAD_*` | 上传上限 |
| `VOXFLOW_CORS_ORIGINS` | CORS |

迁移：启动自动 `alembic upgrade head`；手工见 README。

```text
请求 X-Trace-Id
  → 中间件 bind
  → 响应头回显
  → 任务行 / worker 日志同源
```

---

## 9. 测试路径

### 9.1 后端

```bash
cd backend
python -m pytest tests -q
ruff check app tests
```

### 9.2 前端契约与构建

```bash
cd frontend
npm run build
npm run generate:api:check
```

### 9.3 E2E 冒烟（Playwright）

```text
npm run test:e2e
  → global-setup 准备上传 fixture（或脚本 write_e2e_upload_fixture）
  → webServer 拉起 API + Vite
  → 用例：上传 ZIP → 阅片 → lung_seg → findings/mask
  → 可选 seed-demo 路径
```

CS3D 实验用例需 `VOXFLOW_E2E_CS3D=1`，不阻塞主冒烟。

### 9.4 CI

`.github/workflows/ci.yml`：ruff / mypy 子集 / pytest / build / OpenAPI check / smoke e2e。

---

## 10. 开发者日常检查清单

改后端契约时：

1. 更新 `domain` / `schemas` / service
2. 跑 pytest
3. 再生并检查 OpenAPI 类型
4. 更新 `lib/api.ts` 与调用方

改模型插件时：

1. 遵守 `require_volume` 与 `InferenceResult` 形状
2. 进度阶段命名与现有 UI 一致
3. 约束与 params_schema 写清；前端兼容提示同步

改阅片叠加时：

1. 只消费 `InferenceResult` 公开字段与 mask-frames API
2. 不假设 storage 绝对路径
3. 主路径勿引入 CS3D

---

## 11. 相关文档

- [`../README.md`](../README.md) — 导航与快速开始
- [`DESIGN.md`](DESIGN.md) — 架构与契约
- [`r6-cornerstone3d-spike.md`](r6-cornerstone3d-spike.md) — CS3D spike
- [`../TODO.md`](../TODO.md) — 仍开放项
