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
4. 前端一些修改可能需要 node build 才生效。  
5. 再次强调：要多花时间深入思考、分析，提倡多花时间高质量完成，忌讳快速马马虎虎的完成。  


## 产品目标  
做一个医学智能影像平台，集成自研 AI 模型（结节分割/肺分割/检测/分类等）给医院实际使用。前端要美观、专业、实用；模型用假模型跑通全流程即可。设计可参考 `rough.png` 增加理解，但不必严格照搬。

---

# 已交付基线（不再跟踪明细）

前后端主链路已可交付：上传/解析、假模型插件、任务队列 + SSE、自定义堆栈阅片、AI 叠加、结构化报告（SEG/SR/GSPS）、数据正确性与约束、观测性与 CI、流式上传与限流等。

验证：`pytest` 全绿；`npm run build` 通过。日常只跟下方「前端专项」未完成 / 可选增强项。

---

# 前端专项：界面美观 / 实用 / 专业 —— 重构路线

> 壳子合格，但页面更像后台而不够像医疗产品；**阅片器是全站最重要也是最弱的一页，应整体重做而非继续零敲碎打**。  
> 标杆：OHIF / Weasis / Lunit / Aidoc / Grafana / shadcn / Carbon DataTable 等。  
> **FE-1～FE-5 已完成**；后续为可选增强与杂项技术债。

## 一、总体结论

- **保留**：路由/lazy、TanStack Query + Zustand、OpenAPI 类型、Design Token、深色主色、loading/empty/error、Radix Dialog/Tabs、Findings 列表与阶段甘特方向。
- **FE-1～FE-5 已完成**：设计系统、阅片相机/图层/网格/AI、DataTable/任务、Dashboard 真实指标、模型卡按类型、Settings 与导航收口。

## 二、仍开放的可选缺口（摘要）

### 壳 / 全局
- 顶栏缺全局搜索 / 任务铃 / 用户菜单。

### 数据中心 / 任务
- `/studies` 补 `last_task` 后的 AI 状态列；日志时间线增强。

### 阅片器 / AI 面板
- 高级 Hanging Protocol；完整测量组；窄屏工具条收纳；CAM / 标签本地化。

### 其它
- 全量 i18n（Settings 已存 locale 偏好）；CS3D 正式替换主视口。

## 三、对照标杆（勾选 = 已具备）

| 领域 | 现状 |
|---|---|
| 壳 | ☑ 侧栏 ☑ 阅片自动收栏 ☐ 搜索/铃/用户菜单 |
| 阅片布局 | ☑ 折叠 ☑ 多视口 1×1/1×2/2×2 ☑ 拖宽 AI 面板 ☐ 高级 HP |
| 工具条 | ☑ 互斥/预设·fit·探针·比例尺 ☑ Tooltip ☑ Tools/View/Layers ☑ 布局切换 ☐ 完整测量组 ☐ 窄屏收纳 |
| 视口 | ☑ 四角·fit·比例尺·相机 ☑ 缩放不漂 ☑ 激活边框 ☐ 方向标 |
| AI 结果 | ☑ 列表+跳层 ☑ 接受/拒绝 ☑ Tabs 面板 ☑ hover 联动 ☑ outline ☑ 自动跳代表层 |
| 数据表 | ☑ 分页 ☑ DataTable 排序/列显隐/密度/行选择 ☑ URL 筛选 chip |
| 任务 | ☑ Gantt·Tabs·筛选 ☑ 批量确认 ☑ 结构化结果首屏 ☐ 日志增强 |
| 模型 | ☑ Tabs ☑ 指标按类型 ☑ 约束/输出表格 |
| Dashboard | ☑ 真实日任务时序 ☑ 按模型调用 ☑ 成功率 KPI |
| a11y / 基座 | ☑ 三态·部分 a11y ☑ Toast ☑ AlertDialog ☑ 字号下限 ☑ 基座 shadcn |
| Settings / 导航 | ☑ 语言·默认 W/L·布局·快捷键 ☑ 临床/标注/阅片首页主导航收口 |

## 四、重构方案（摘要）

### 4.1 FE-1 设计系统基座 —— ✅ 已完成
- shadcn：Tooltip / Select / Slider / Switch / DropdownMenu / Sheet / AlertDialog / Command / Popover / Breadcrumb / Sonner / Resizable / ScrollArea / Toggle+ToggleGroup / Separator。
- 字号：正文 14 / 次要 13 / 最小 12；Badge Status / Tag；阅片强制深色；`lib/i18n/terms.ts`。
- Suspense→Outlet；Spike 入口仅 Settings；mutation Toast。

### 4.2 FE-2 阅片 A —— ✅ 已完成
- Camera：`isNearFit` / `shortSideFillRatio`；resize 近 fit 才重适配；用户缩放不改写 `fitScale`。
- Layer：`core/layers.ts`（image/mask/overlay/annotation）；工具条图层开关。
- 工具条三组 Tools | View | Layers + 层导航；App 侧栏阅片自动折叠。

### 4.3 FE-3 阅片 B + AI —— ✅ 已完成
- ViewportGrid：1×1 / 1×2 / 2×2，激活视口可交互，共享序列/叠加。
- AI Tabs：分析｜检出｜图层｜报告；右侧 Resizable。
- 结果落地自动跳代表层 + 开掩膜；hover/选中 outline；检测色板。

### 4.4 FE-4 表格与任务 —— ✅ 已完成
- `DataTable` + `useUrlFilters`；数据/任务 URL 可复现；FilterChips。
- 任务批量取消/重试 + AlertDialog；详情 TaskResultCards（JSON 折叠）；产物分组。
- StudyDrawer→Sheet；上传 XHR 进度 + 失败重试。

### 4.5 FE-5 总览与模型 —— ✅ 已完成
- `/stats/overview`：`daily_tasks`（14 日）、`model_usage`、全类型 `model_metrics.metrics`、成功率 KPI。
- Dashboard：真实柱状时序 + 按模型调用表；无数据 EmptyState（无虚构趋势）。
- 模型卡/详情：`features/models/metrics.ts` 按 task_type；约束与输出为表格。
- Settings：语言 / 默认 W/L·布局 / 快捷键表；阅片打开时应用默认值。
- 导航：去掉临床/标注/阅片首页；`/viewer` → `/data`；报告说明收口到 Settings。

## 五、建议轮次

| 轮 | 内容 | 验收要点 | 状态 |
|---|---|---|---|
| **FE-1 基座** | 4.1 | 无原生 select/range；无 10/11px；Esc 关浮层；mutation 有 Toast | ✅ |
| **FE-2 阅片 A** | 相机/图层 + fit + 工具条 + 四角/比例尺 + 侧栏自动折叠 | 三档宽度影像占短边 ≥90%；缩放不漂 | ✅ |
| **FE-3 阅片 B + AI** | 网格/HP + 叠加增强 + 面板 Tabs | lung_seg 后可见掩膜并到代表层；hover/接受拒绝进报告 | ✅ |
| **FE-4 表格与任务** | DataTable + 数据/任务页 | URL 可复现筛选；批量确认；详情首屏无原始 JSON | ✅ |
| **FE-5 总览与模型** | Dashboard + 模型卡 + Settings | 无虚构趋势；指标按类型；约束非 JSON.stringify | ✅ |

## 六、优先级
1. 可选增强：顶栏搜索/铃、AI 状态列（需 `last_task`）、阅片测量/窄屏、日志时间线。
2. 一切「看得见的假/错」仍优先于纯视觉打磨。

---

# 杂项技术债（可选，非阻塞 FE）

- [ ] `/studies` 补 `last_task`（数据表 AI 状态列）
- [ ] 日志时间线 level 色 / stage 过滤 / 自动滚动
- [ ] 上传表单 zod 解析边界与 mutation 反馈统一走 Toast（主路径已接 Toast，边界场景可再扫）
- [ ] Playwright E2E 全链路冒烟（上传→推理→叠加）
- [ ] Cornerstone3D 正式替换主视口（当前为实验/降级路径，见 `docs/` 下 CS3D spike 文档）
- [ ] 全量界面 i18n（Settings 已持久化 `locale`）
