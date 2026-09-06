# R7 Cornerstone3D Spike — 评估结论（R12 收口）

> 日期：2026-09-06 · 路由：`/viewer-cs3d/:studyId` · **主路径 `/viewer/:studyId` 未替换且为唯一生产阅片路径**

## 评估结论（N-F9）

**CS3D 保留为实验评估 spike，不作为医院交付默认路径。**

| 结论 | 说明 |
|------|------|
| 主路径 | 自研 `StackViewport`（R9 相机/PACS 工具已验收） |
| Spike 状态 | 可加载壳层；headless / 部分环境黑屏（`no COMPRESSED_FRAME_DATA`）未彻底消除 |
| Tools | Vite 8 + Rolldown 下 `@cornerstonejs/tools` / `@icr/polyseg-wasm` 仍阻塞，本轮不接入 |
| 产品入口 | **默认隐藏**；仅在「系统设置 → 实验功能」开启后显示链接 |
| E2E | `e2e/cs3d-spike.spec.ts` 标为 experimental，不阻塞主 CI 冒烟 |

正式交付以自研阅片器为准；CS3D 仅供后续迁移对照。

## 历史记录（R7）

1. **可运行 spike 已落地**：独立 lazy chunk（约 3MB），正式阅片仍走自研 `StackViewport`。
2. **Vite 8 / Rolldown + `@cornerstonejs/tools`**：生产构建会因 compute worker 解析失败。本轮 **不引入 tools**。
3. **影像源**：`wadouri:{origin}/api/v1/series/{uid}/frames/{i}`。

## 验收对照

| 项 | 状态 |
|----|------|
| 独立路由 feature dual-run | ✅ `/viewer-cs3d/:studyId` |
| 正式路径零 CS3D 依赖 | ✅ 主 `/viewer` 不导入 CS3D |
| Tools（W/L 拖拽） | ❌ 评估降级，暂缓 |
| 真浏览器 canvas 非黑 | ⏳ 未作为交付门槛；见上结论 |
| 默认 UI 入口 | ✅ R12 默认关闭 |

## 后续（另开，非 R12）

- 等 Vite/Rolldown 对 CS3D tools worker 兼容后再评估接入
- 若需继续验证 wadouri，优先核对 frames 响应是否完整 Part-10 + Transfer Syntax
