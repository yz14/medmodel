# VoxFlow — 医学影像 AI 平台（导航地图）

VoxFlow 是面向院内自研模型的 **模型运营 + 阅片** MVP：统一注册、异步推理、产物回传与阅片叠加。策略是 **假模型、真流程**——插件可换成真权重，上传 → 任务 → 叠加这条链路保持稳定。

> 设计级细节见 [`docs/DESIGN.md`](docs/DESIGN.md)，端到端流程见 [`docs/WORKFLOW.md`](docs/WORKFLOW.md)。产品原则与开放项见 [`TODO.md`](TODO.md)。

## 模块树

```text
medmodels/
├── backend/app/
│   ├── main.py              # FastAPI 入口与 lifespan
│   ├── api/                 # HTTP 路由、Pydantic schemas、OpenAPI
│   ├── services/            # 业务编排（Study / Task / Model / Stats / Report）
│   ├── domain/              # 契约 dataclass、枚举（无 IO）
│   ├── infra/               # DB / 队列 / 存储 / 配置 / 日志 / ORM
│   ├── models_hub/          # 模型插件 + registry（lung_seg / nodule_*）
│   └── imaging/             # DICOM IO、掩膜、演示用 DICOM 导出
├── backend/tests/           # pytest
├── frontend/src/
│   ├── app/                 # 路由、布局、providers
│   ├── pages/               # 路由页面
│   ├── features/            # 业务纵切：viewer / models / tasks / data
│   ├── components/          # UI 与复合组件
│   ├── stores/              # viewer / ui 状态
│   ├── lib/                 # api、sse、errors、format
│   └── types/               # api.ts + openapi.d.ts
├── frontend/e2e/            # Playwright 冒烟
├── docs/
│   ├── DESIGN.md            # 架构与契约
│   ├── WORKFLOW.md          # 端到端流程
│   └── r6-cornerstone3d-spike.md
├── data/                    # SQLite（本地）
├── storage/                 # DICOM 与任务产物
└── docker-compose.yml       # 单入口 nginx + API
```

## 关键概念

- **分层**：`domain` 契约 → `services` 编排 → `api` 暴露；插件只实现 `ModelPlugin`，不读 HTTP、不自读 DICOM（体积由编排器注入 `InferenceContext.volume`）。
- **任务语义**：`POST /tasks` → **202 + task_id**；进度用轮询或 `GET /tasks/{id}/events`（SSE）。进程内队列，接口形态按 Celery 可替换。
- **产物 URI**：插件写文件后物化为 `storage://…`；前端经 artifacts / mask-frames API 拉取，不硬编码盘符。
- **阅片主路径**：自研 `StackViewport`（`/viewer/:studyId`）。Cornerstone3D 仅为实验 spike（默认关闭，见 docs）。
- **类型契约**：后端 OpenAPI ↔ `frontend` `generate:api:check`，禁止前后端字段静默漂移。
- **可观测性**：`X-Trace-Id` 贯通请求与 worker；`/health/live|ready` + Prometheus `/metrics`。

## 快速开始

### 1. 后端

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API 文档：http://127.0.0.1:8000/docs  
- 健康：http://127.0.0.1:8000/api/v1/health  
- 指标：http://127.0.0.1:8000/api/v1/metrics  

启动时自动迁移 DB、注册假模型、种子化多模态 Demo。

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。默认将 `/api` 代理到 `http://127.0.0.1:8000`。

后端改用其它端口（例如 `8040`）时：

```powershell
$env:VOXFLOW_API_PROXY="http://127.0.0.1:8040"
npm run dev
```

### 3. Docker（可选）

```bash
docker compose up --build
```

浏览器访问 http://localhost:8080（nginx 反代 `/api`）。

## 端到端验收路径

1. **数据中心**：确认 Demo 检查或上传 DICOM/ZIP  
2. **阅片**：滚轮切层、窗宽窗位  
3. 右侧选模型（如肺分割 / 结节检测）→ **运行 AI**  
4. 等待进度 → 查看分割 / 检出框 / 分类；Findings 审阅后生成报告  
5. **推理任务** 查历史与日志；**模型仓库** 启停模型  

更细的时序图与分支见 [`docs/WORKFLOW.md`](docs/WORKFLOW.md)。

## 内置假模型

| ID | 名称 | 类型 |
|---|---|---|
| `lung_seg` | 肺实质分割 | segmentation |
| `nodule_seg` | 肺结节分割 | segmentation |
| `nodule_det` | 肺结节检测 | detection |
| `nodule_cls` | 结节良恶性分类 | classification |

新增模型：在 `backend/app/models_hub/` 增加插件包并实现 `ModelPlugin`，加入 `load_all_plugins` 列表即可被 `GET /models` 发现（步骤见 DESIGN §9）。

## 环境变量（`VOXFLOW_` 前缀）

| 变量 | 默认 | 说明 |
|------|------|------|
| `VOXFLOW_DATA_DIR` | `./data` | SQLite / 本地数据 |
| `VOXFLOW_STORAGE_DIR` | `./storage` | DICOM 与任务产物 |
| `VOXFLOW_DATABASE_URL` | `sqlite:///{data}/voxflow.db` | 数据库 |
| `VOXFLOW_TASK_MAX_CONCURRENCY` | `2` | 推理并发 |
| `VOXFLOW_MAX_UPLOAD_BYTES` | `536870912` (512MiB) | 单次上传总字节 → 超限 **413** |
| `VOXFLOW_MAX_UPLOAD_FILES` | `500` | 单次上传文件数 → 超限 **413** |
| `VOXFLOW_CORS_ORIGINS` | localhost:5173/8080 | CORS |

持久化建议挂载 `data/` 与 `storage/`。

## 数据库迁移（Alembic）

API 启动时会自动 `alembic upgrade head`。手动：

```bash
cd backend
alembic upgrade head
```

当前修订：

- `20260905_0001` — `num_instances` 回填 + `uq_task_inflight`
- `20260906_0002` — `tasks.trace_id`

## 运维探针

- Liveness：`GET /api/v1/health/live`
- Readiness：`GET /api/v1/health/ready`
- Metrics：`GET /api/v1/metrics`

请求可带 `X-Trace-Id`；任务详情回显 `trace_id`，worker 日志绑定同一 ID。

## 测试与 CI

```bash
# 后端
cd backend
python -m pytest tests -q
ruff check app tests

# 前端
cd frontend
npm run build
npm run generate:api:check   # OpenAPI → TS 不得漂移
npm run test:e2e             # Playwright 起 API+Vite；上传→推理→叠加冒烟
                             # CS3D 实验用例需 VOXFLOW_E2E_CS3D=1
```

GitHub Actions：`.github/workflows/ci.yml`。

## 文档索引

| 文档 | 用途 |
|------|------|
| [`docs/DESIGN.md`](docs/DESIGN.md) | 分层、契约、插件、队列、前端边界、扩展指南 |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | 起服、入库、阅片、推理、叠加、测试清单 |
| [`docs/r6-cornerstone3d-spike.md`](docs/r6-cornerstone3d-spike.md) | CS3D 评估结论（非默认路径） |
| [`TODO.md`](TODO.md) | 质量原则与仍开放项 |
| [`frontend/README.md`](frontend/README.md) | 前端包内说明（若有） |

## 说明

- MVP **不含** 真实 PACS / 真权重；DICOM SEG / SR / GSPS 为阅片侧演示导出  
- **正式阅片**为自研堆栈；CS3D 默认关闭  
- 队列可替换为 Redis/Celery，保持 `202 + task_id` + 轮询/SSE 对外形态  
