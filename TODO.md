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

验证：`pytest` 全绿；`npm run build` 通过。日常只跟下方「前端专项」未完成项。

---

# 前端专项：界面美观 / 实用 / 专业 —— 重构路线（当前主线）

> 壳子合格，但页面更像后台而不够像医疗产品；**阅片器是全站最重要也是最弱的一页，应整体重做而非继续零敲碎打**。  
> 标杆：OHIF / Weasis / Lunit / Aidoc / Grafana / shadcn / Carbon DataTable 等。  
> 已有能力（相机/fit/W-L 预设/探针/比例尺、Findings 接受拒绝、任务筛选、部分 a11y 等）计入对照表；**未完成项以本节 FE-1～FE-5 为准**。

## 一、总体结论

- **保留**：路由/lazy、TanStack Query + Zustand、OpenAPI 类型、Design Token、深色主色、loading/empty/error、Radix Dialog/Tabs、Findings 列表与阶段甘特方向。
- **仍需重做**：① 阅片器视口布局与交互模型（多视口/HP、工具条信息架构）② AI 面板 Tabs 化 ③ Dashboard 真实运营指标 ④ UI 基座补齐（Tooltip / Toast / Sheet / Command / DropdownMenu / 正式 Select·Slider 等）。

## 二、仍开放的主要缺口（摘要）

### 壳 / 全局
- 顶栏缺全局搜索 / 任务铃 / 用户菜单；阅片页应自动收侧栏为图标栏。
- `Suspense` 应下沉到 `Outlet`，避免切页整壳闪骨架。
- 残留无用资产、开发向文案（如健康徽章）应收敛。

### Dashboard
- 缺真实时序与运营指标（队列水位、按模型调用、失败率、P50/P95）；无影像速览。
- 表格/环形图信息架构仍偏空；模型列等应用中文名。

### 数据中心 / 任务
- 统一 DataTable（排序/列显隐/筛选 chip/密度/URL 同步/行选择批量）。
- StudyDrawer 换 Sheet；上传进度与失败重试；AI 状态列。
- 任务详情：结构化结果卡（JSON 折叠）、产物按类型分组、日志能力、深链 `?task=`。

### 阅片器 / AI 面板
- 多视口网格 + Hanging Protocol；工具条分组与窄屏收纳；ROI/角度等测量面板。
- AI 面板改为 Tabs（分析｜检出｜图层｜报告）+ 可拖宽；自动跳代表层、hover 联动、outline 等增强。
- CAM / 标签本地化等仍待产品化。

### 模型仓库 / Settings / 其它页
- 指标按任务类型展示；输入约束与 I/O 用表格而非 JSON；运行统计。
- Settings：语言 / 默认 W/L·布局 / 快捷键表。
- `/clinical` 报告中心化或移除；`/viewer` 首页与 `/data` 去重；标注从主导航拿掉。

### 基础组件与视觉
- 正式引入 shadcn 上述组件；清零 `text-[10px]/[11px]`；术语表；阅片强制深色；Toast / AlertDialog。

## 三、对照标杆（勾选 = 已具备）

| 领域 | 现状 |
|---|---|
| 壳 | ☑ 侧栏 ☐ 搜索/铃/用户菜单 ☐ 阅片自动收栏 |
| 阅片布局 | ☑ 折叠 ☐ 多视口 ☐ 拖宽面板 ☐ HP |
| 工具条 | ☑ 互斥/部分预设·fit·探针·比例尺 ☐ Tooltip 快捷键 ☐ 完整测量组 ☐ 窄屏收纳 |
| 视口 | ☑ 四角·fit·比例尺·部分交互 ☐ 方向标 ☐ 激活边框 ☐ 相机抽象彻底化 |
| AI 结果 | ☑ 列表+跳层 ☑ 接受/拒绝 ☐ Tabs 面板 ☐ hover 联动 ☐ outline ☐ 自动跳代表层 |
| 数据表 | ☑ 分页 ☐ 完整 DataTable 能力 |
| 任务 | ☑ Gantt·Tabs·部分筛选 ☐ 批量 ☐ 日志增强 ☐ 结构化结果首屏 |
| 模型 | ☑ Tabs 骨架 ☐ 内容与指标按类型 |
| Dashboard | ☐ 真实时序与运营指标 |
| a11y / 基座 | ☑ 三态·部分 a11y ☐ Toast ☐ AlertDialog ☐ 字号下限 ☐ 全站 shadcn |

## 四、重构方案（摘要）

### 4.1 FE-1 设计系统基座（其余轮前置）
- shadcn：`Tooltip` / `Select` / `Slider` / `Switch` / `DropdownMenu` / `Sheet` / `AlertDialog` / `Command` / `Popover` / `Breadcrumb` / `Sonner` / `Resizable` / `ScrollArea` / `Toggle`+`ToggleGroup` / `Separator`；token 映射现有 CSS 变量。
- 字号：正文 14 / 次要 13 / 最小 12；Badge 分 Status / Tag 两族；阅片强制深色；`lib/i18n/terms.ts`。
- `Suspense`→`Outlet`；清残留资产与用户可见 Spike 入口（实验特性走 Settings）。

### 4.2～4.3 FE-2/FE-3 阅片器 + AI 面板
- `features/viewer/core/`：`Camera` + `Layer`（Image/Mask/Annotation/Overlay）；`ViewportGrid` + HP；工具条三组 + 层导航。
- AI：自动跳代表层、选中高亮、outline/fill、检测色板；面板 Tabs + 历史结果 + Resizable。

### 4.4～4.6 FE-4/FE-5 表格、总览、模型
- 统一 `DataTable`；数据中心 / 任务中心 / 详情结构化。
- Dashboard 只画真实数据；模型卡指标按类型；Settings 补齐；临床/阅片首页/标注导航收口。

## 五、建议轮次（当前待办）

| 轮 | 内容 | 验收要点 |
|---|---|---|
| **FE-1 基座** | 4.1 | 无原生 select/range；无 10/11px；Esc 关浮层；mutation 有 Toast；axe 无 serious |
| **FE-2 阅片 A** | 相机/图层 + fit + 工具条 + 四角/比例尺 + 侧栏自动折叠 | 三档宽度影像占短边 ≥90%；缩放不漂 |
| **FE-3 阅片 B + AI** | 网格/HP + 叠加增强 + 面板 Tabs | lung_seg 后约 1s 可见掩膜并到代表层；hover/接受拒绝进报告 |
| **FE-4 表格与任务** | DataTable + 数据/任务页 | URL 可复现筛选；批量确认；详情首屏无原始 JSON |
| **FE-5 总览与模型** | Dashboard + 模型卡 + Settings | 无虚构趋势；指标按类型；约束非 JSON.stringify |

> 后端最小配合（FE-3/FE-5 可能需要）：`/stats/overview` 补 `daily_tasks` 与 per-model 统计；`ModelSpec.metrics` 按 task_type；`/studies` 补 `last_task`；掩膜 finding 勿用 `dice` 当置信度。

## 六、优先级
1. **先做 FE-1**（基座不到位，后面每页会再手写一遍）。
2. **阅片器 FE-2/3 占前端一半工时合理**——医院用户主要停留处。
3. 一切「看得见的假/错」优先于纯视觉打磨。

---

# 杂项技术债（可选，非阻塞 FE）

- [ ] Dashboard /stats 聚合与真实时序 API
- [ ] 日志时间线 level 色 / stage 过滤 / 自动滚动
- [ ] 关键表单 zod 解析边界与 mutation 反馈统一走 Toast
- [ ] Playwright E2E 全链路冒烟（上传→推理→叠加）
- [ ] Cornerstone3D 正式替换主视口（当前为实验/降级路径，见 `docs/` 下 CS3D spike 文档）
