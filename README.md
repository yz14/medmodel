# VoxFlow · 医学影像 AI 模型平台

把院内自研 AI 模型统一注册、调用与交付的 **模型运营 + 阅片** MVP。假模型、真流程：上传 → 推理任务 → 产物回传 → 阅片叠加。

## 快速开始（本地开发）

### 1. 后端

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API 文档：http://127.0.0.1:8000/docs  
- 健康检查：http://127.0.0.1:8000/api/v1/health  
- Prometheus 指标：http://127.0.0.1:8000/api/v1/metrics  
- 启动时自动注册假模型，并种子化多模态 Demo（CT 胸/头、MR 脑、DR 胸）

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。Vite 已将 `/api` 代理到 `:8000`。

### 3. Docker（可选）

```bash
docker compose up --build
```

浏览器访问 http://localhost:8080 （nginx 反代 `/api`）。

## 部署与升级

### 环境变量（`VOXFLOW_` 前缀）

| 变量 | 默认 | 说明 |
|------|------|------|
| `VOXFLOW_DATA_DIR` | `./data` | SQLite / 本地数据 |
| `VOXFLOW_STORAGE_DIR` | `./storage` | DICOM 与任务产物 |
| `VOXFLOW_DATABASE_URL` | `sqlite:///{data}/voxflow.db` | 数据库 |
| `VOXFLOW_TASK_MAX_CONCURRENCY` | `2` | 推理并发 |
| `VOXFLOW_MAX_UPLOAD_BYTES` | `536870912` (512MiB) | 单次上传总字节上限 → 超限 **413** |
| `VOXFLOW_MAX_UPLOAD_FILES` | `500` | 单次上传文件数上限 → 超限 **413** |
| `VOXFLOW_CORS_ORIGINS` | localhost:5173/8080 | CORS |

持久化卷建议挂载 `data/` 与 `storage/`。

### 数据库迁移（Alembic）

API 启动时会自动 `alembic upgrade head`。手动升级：

```bash
cd backend
alembic upgrade head
```

当前修订：

- `20260905_0001` — `num_instances` 回填 + `uq_task_inflight`
- `20260906_0002` — `tasks.trace_id`（请求 → worker 关联）

### 运维探针

- Liveness：`GET /api/v1/health/live`
- Readiness：`GET /api/v1/health/ready`
- Metrics：`GET /api/v1/metrics`（Prometheus text）

创建请求可带 `X-Trace-Id`；任务详情会回显 `trace_id`，worker 日志绑定同一 ID。

## 端到端验收路径

1. 打开 **数据中心**，确认 Demo 检查存在（或上传 DICOM/ZIP）
2. 进入 **阅片**，滚轮切层，调节窗宽窗位
3. 右侧选择模型（如肺分割 / 结节检测）→ **运行 AI**
4. 等待任务进度 → 查看分割标签 / 检出框 / 分类概率；Findings 可接受/拒绝/修正后生成报告
5. 在 **推理任务** 查看历史、筛选、错误徽章；在 **模型仓库** 启停模型

## 内置假模型

| ID | 名称 | 类型 |
|---|---|---|
| `lung_seg` | 肺实质分割 | segmentation |
| `nodule_seg` | 肺结节分割 | segmentation |
| `nodule_det` | 肺结节检测 | detection |
| `nodule_cls` | 结节良恶性分类 | classification |

新增模型：在 `backend/app/models_hub/` 增加插件包并实现 `ModelPlugin` 契约，平台零改动即可 `GET /models` 发现。

## 目录结构

```
backend/app/
  api/          HTTP 路由与 schema
  services/     业务编排
  domain/       契约与枚举
  infra/        DB / 队列 / 存储 / 配置
  models_hub/   模型插件
  imaging/      DICOM IO 与掩膜工具
frontend/src/
  pages/        路由页面
  features/     业务纵切（viewer/models/tasks/data）
  components/   UI 与复合组件
```

## 测试与 CI

```bash
# 后端
cd backend
python -m pytest tests -q
ruff check app tests

# 前端
cd frontend
npm run build
npm run generate:api:check   # OpenAPI → TS 类型不得漂移
npm run test:e2e             # Playwright 自动起 API+Vite；含上传→推理→叠加冒烟
                             # CS3D 实验用例需 VOXFLOW_E2E_CS3D=1
```

GitHub Actions：`.github/workflows/ci.yml`（ruff / mypy 子集 / pytest / build / OpenAPI check / smoke e2e）。

## 说明

- MVP **不包含** 真实 PACS、真权重；DICOM SEG / SR / GSPS 可通过阅片 AI 面板报告导出（演示用）
- **正式阅片路径**为自研堆栈视口；Cornerstone3D 仅为评估 spike（默认关闭，见 `docs/r6-cornerstone3d-spike.md`）
- 任务接口形态按 Celery 语义设计（`202 + task_id` + 轮询/SSE），进程内队列可替换为 Redis/Celery
