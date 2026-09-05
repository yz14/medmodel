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
- 启动时自动注册 4 个假模型，并种子化 1 例 Demo Chest CT

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

## 端到端验收路径

1. 打开 **数据中心**，确认 Demo 检查存在（或上传 DICOM/ZIP）
2. 进入 **阅片**，滚轮切层，调节窗宽窗位
3. 右侧选择模型（如肺分割 / 结节检测）→ **运行 AI**
4. 等待任务进度 → 查看分割标签 / 检出框 / 分类概率
5. 在 **推理任务** 查看历史、日志、重试；在 **模型仓库** 启停模型

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

## 测试

```bash
cd backend
python -m pytest tests -q
```

## 说明

- MVP **不包含** 真实 PACS、真权重；DICOM SEG / SR / GSPS 可通过阅片 AI 面板报告导出（演示用）
- 阅片器当前为自定义 DICOM 堆栈视口（`dicom-parser` + canvas）；Cornerstone3D 迁移评估见 `docs/r6-cornerstone3d-spike.md`
- 任务接口形态按 Celery 语义设计（`202 + task_id` + 轮询/SSE），进程内队列可替换为 Redis/Celery

