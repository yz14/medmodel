# R7 Cornerstone3D Spike — 可运行 dual-run

> 日期：2026-09-03 · 路由：`/viewer-cs3d/:studyId` · **主路径 `/viewer/:studyId` 未替换**

## 结论

1. **可运行 spike 已落地**：独立 lazy chunk（约 3MB gzip≈831KB），正式阅片仍走自研 `StackViewport`。
2. **Vite 8 / Rolldown + `@cornerstonejs/tools`**：生产构建会因 compute worker 解析失败。本轮 **不引入 tools**，用滚轮手动切层 + 默认 CT VOI。
3. **Vite 8 开发态**：CS3D metadata → `xmlbuilder2` 需要 Node `events` 等 polyfill → `vite-plugin-node-polyfills`。
4. **依赖**：`@cornerstonejs/core` / `dicom-image-loader` / `metadata` @5.8.2；Vite：commonjs + nodePolyfills + worker.es。
5. **影像源**：`wadouri:{origin}/api/v1/series/{uid}/frames/{i}`（经现有 Vite proxy）。

## 验收对照（相对 R6 评估清单）

| 项 | 状态 |
|----|------|
| 独立路由 feature dual-run | ✅ `/viewer-cs3d/:studyId` |
| `ensureCornerstoneInit` 单例 | ✅ module Promise |
| 卸载 destroy RenderingEngine | ✅ |
| Stack + scroll（无 MPR/3D） | ✅ 滚轮切层 |
| 现有 frames API 作为 imageId | ✅ wadouri |
| Vite worker/wasm 文档化 | ✅ 本文件 + `vite.config.ts` |
| 性能对照 vs 自研 | ⏳ 人工对照（未自动化） |
| Tools（W/L 拖拽） | ❌ 暂缓（Vite 8 构建 blocker） |

## 入口

- 阅片列表卡片：「打开 CS3D Spike」
- 正式阅片顶栏：「CS3D Spike」
- Playwright：`e2e/cs3d-spike.spec.ts`

## 后续（另开）

- 等 Vite/Rolldown 对 CS3D tools worker 兼容，或改用 Vite 5/6 再接入 WindowLevel/StackScrollTool
- 像素级 Labelmap 叠加 AI 掩膜
- 首帧时间 / 切层 FPS 对照表写入本文
