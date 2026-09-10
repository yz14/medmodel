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
做一个医学智能影像平台，集成自研 AI 模型（结节分割/肺分割/检测/分类等）给医院实际使用。前端要美观、专业、实用；模型用假模型跑通全流程即可。请先仔细理解readme, workflow, design文档（如发现这三份文档有误，请在下面指出即可）。


## TODO-1 代码审查

详尽、彻底、严谨、认真的审查代码是否正确、规范；设计、架构、流程是否有优化提质空间等等。允许借鉴高质量项目（现在是2026/09，相关或者不相关的领域都可以）。

审查结果（不说废话，只写有用信息）：

> 审查日期 2026-09-06。范围：backend/app 全部、backend/tests、alembic、frontend/src 全部、e2e、CI、Docker、文档。
> 实测基线：`pytest` 38 passed（250s，偏慢）；`ruff check app tests` 32 项（F401/F841/I001/UP）；`ruff format --check` 38/49 文件未格式化；`mypy app` 14 errors / 10 files；`tsc --noEmit` 0 错误；`oxlint` 0 错误 24 警告（4 个 exhaustive-deps）；`generate:api:check` 通过。
> 严重度：P0 = 结果错误/主链路不可用；P1 = 明显缺陷或数据一致性问题；P2 = 一般缺陷/性能/规范；P3 = 建议。

### A. P0 —— 结果会“看起来对、实际错”，或主链路在部署态不可用

1. **同参重复 POST 会把同一任务执行两次（并发覆写）**
   `api/routes/tasks.py:45-46` 与 `:190-191`：只要 `not task.cache_hit` 就 `enqueue`，但 `create_task()` 命中 inflight 时返回的是**已存在**的任务，路由仍再次入队；`retry` 同理。`TaskQueue.enqueue` 无去重，`_run_sync` 也不做“只领取 queued 状态”的原子 claim（`task_service.py:406` 直接 `status=RUNNING`）。结果：两个 worker 同时跑同一 task_id，progress/日志交叉写，第二次成功会覆盖第一次结果。现有 `test_inflight_dedup` 只断言 task_id 相同，未捕获。
   修复：`create_task` 返回 `(task, created)`，仅 `created` 时入队；`_run_sync` 用 `UPDATE tasks SET status='running' WHERE task_id=? AND status='queued'`，rowcount==0 直接返回；队列侧加 `_pending: set` 去重。
2. **切片顺序不按空间位置排序，多处顺序源不一致 → 掩膜/检出框与影像错位**
   `imaging/dicom_io.py:194-197` 体数据顺序 = 文件名（`NNNN_sop后8位`）字典序；`study_service.py:71-78`/`routes/series.py:54` 前端帧顺序 = `InstanceRow.instance_number`，**平局顺序未定义**；两者都不用 `ImagePositionPatient`。InstanceNumber 缺失（全为 1）、重复、或非空间序（多期、多回波）时，AI 掩膜层号与阅片层号对不上。`report_service._load_series_images` 是第三个排序源。
   修复：入库时计算 `ImagePositionPatient·法向量` 投影，写入 `InstanceRow.slice_position` 与稳定 `slice_index`；volume、帧接口、报告导出统一按该字段排序；无 IPP 才回退 InstanceNumber，再回退 SOP UID。
3. **体数据读取失败静默回退为随机噪声继续推理**
   `task_service.py:460-478`：`read_series_volume` 返回 None（压缩传输语法无解码器、层形状不一致、多帧、彩色图像等都会触发）时用 `rng.normal` 造假体积，任务仍“成功”。这是产品原则里明令优先消灭的“看得见的假”。
   修复：非 demo 序列读取失败 → 任务 `failed`，`error_code=VOLUME_READ_FAILED` 并给出具体原因；随机体积仅允许 `series.is_phantom` 显式标记时使用。
4. **前端 DICOM 解码器不满足真实数据最低要求**（`features/viewer/dicom-decoder.ts`）
   - 未读 `PhotometricInterpretation`，MONOCHROME1 显示反相；
   - 未处理 `BitsStored/HighBit`，12 位左对齐数据数值放大 → HU 探针错误；
   - `RescaleSlope/Intercept` 用 `Number()` 直接转 DS 多值字符串（`"1\1"`）→ NaN 全黑；
   - 固定小端；不识别压缩传输语法（JPEG/J2K/RLE）直接按裸像素解析 → 花屏或 RangeError；
   - 不处理 Modality/VOI LUT。
   后端 `read_series_volume` 同样缺 MONOCHROME1、`SamplesPerPixel`、多帧、压缩语法处理，`requirements.txt` 无 `pylibjpeg`/`gdcm`。
   修复：后端提供解码后的帧接口（如 `/frames/{idx}?format=raw16` 返回已 rescale 的 int16 + 元数据 JSON），前端不再自解 DICOM；或至少补齐上述 5 项并对不支持的语法明确报错。
5. **`AiPanel` 结果加载无过期保护，旧任务结果覆盖新任务叠加**
   `features/viewer/AiPanel.tsx:130-134`：`getTaskResult(activeTaskId).then(setResult)` 无 taskId 校验、无 abort；快速切模型/切任务时旧 promise 后到会写入全局 `result`。同类问题：`StackViewport.tsx:176-219` 掩膜绘制的 `cancelled` 只在 `paintMaskOverlay` 完成后检查，`putImageData` 前不检查，快速滚层会把上一层掩膜画到新层。
   修复：结果改用 `useQuery(['task-result', taskId])`；`paintMaskOverlay` 增加 `shouldCommit()` 回调在提交前判定。
6. **nginx 未设 `client_max_body_size`**（`frontend/nginx.conf`）
   默认 1 MB，Docker 部署下所有真实 DICOM/ZIP 上传都被 nginx 413，后端的 512 MiB 限制形同虚设。修复：`client_max_body_size 512m;`（与 `VOXFLOW_MAX_UPLOAD_BYTES` 对齐）。
7. **后端 Dockerfile 未复制 `alembic/` 与 `alembic.ini`**
   `migrate.py` 找不到 ini 只 warning 后跳过，容器内只靠 `create_all`，迁移中的数据回填/索引永不执行。修复：`COPY alembic ./alembic` + `COPY alembic.ini .`。

### B. P1 —— 明显缺陷 / 一致性 / 可运维性

8. **进程重启后 queued/running 任务变僵尸**：队列纯内存，无启动对账。`main.py` lifespan 应在 `queue.start()` 前把 DB 中 `running` 标为 `failed(INTERRUPTED)`，`queued` 重新入队（或同样标失败并提示重试）。
9. **`_run_sync` 在 `status=RUNNING` 之前抛错时任务永久卡在 queued**：`task_service.py:402-405`（序列不存在、插件被卸载）抛出后进入 except，`t.status == RUNNING` 不满足，不写 failed。修复：failed 分支放宽为 `status in (queued, running)`。
10. **取消依赖魔法字符串**：`RuntimeError("TASK_CANCELED")` 在 `task_service.py:429/494/542` 靠 `str(exc) ==` 判别。定义 `TaskCanceled(Exception)` 放 `domain/`，`base.py` 与编排器统一使用。
11. **`ModelService.patch_model` 不校验 `default_params`**：写入不符合 `params_schema` 的默认值后，该模型所有 `POST /tasks` 400，且 UI 无法定位原因。修复：patch 时用 `merge_and_validate_params` 校验。
12. **`check_input_constraints` 对 modality/body_part 为空一律放行**（`models_hub/constraints.py:39-43,63-67`）：`SeriesRow.modality=None` 时 CT 专用模型照跑。改为缺失即拒绝（或模型声明 `allow_unknown`）。
13. **DB 内存放绝对路径**：`SeriesRow.storage_path`、`InstanceRow.file_path`、`thumbnail_path`、`TaskRow.work_dir` 都是宿主机绝对路径（`study_service.py:166,189,216`）；本机与 Docker、迁移存储目录后全部失效，与 DESIGN §5.2 “逻辑 URI”自相矛盾。统一存 `storage://` 相对 URI，读取时 `resolve_uri`。
14. **ORM 关系全部 `lazy="selectin"` 造成级联全量加载**（`infra/orm.py:46-48,73-75,149-154`）：`GET /studies` 每页会把每个 Study → 所有 Series → **所有 Instance** 行拉出；`GET /tasks` 每页会拉所有 `logs`。真实 CT（300-500 层）× 20 条 = 上万行/请求。改 `lazy="select"/"raise"` + 按需 `selectinload`，列表接口不加载 instances/logs。
15. **帧接口 O(N) 查全表**：`routes/series.py:54` 每帧请求 `list_instances()` 取整序列再下标；阅一套 400 层 CT = 400×400 行查询。改为 `WHERE series_uid=? ORDER BY slice_index LIMIT 1 OFFSET idx`，或前端从 `/instances` 拿到的 `sop_uid` 直接请求 `/instances/{sop_uid}/file`；帧/缩略图响应加 `Cache-Control: immutable` + ETag。
16. **前端上传 `Path(name).name` 同名覆盖**（`routes/studies.py:71-72`、`study_service.py:85`）：多文件夹上传时 `1.dcm` 重名互相覆盖，静默丢层。改用序号前缀或保留相对路径（webkitRelativePath）。
17. **ZIP 解压无解压后体积上限**（`dicom_io.py:159-186`）：上传预算只按压缩字节计，zip bomb 可撑爆磁盘。解压时累计 `info.file_size` 与 `budget` 比较。
18. **前端 `uploadStudies` 在 signal 已 aborted 时 Promise 永久 pending**（`lib/api.ts:94-120`）：`xhr.abort(); return` 未 `reject`。
19. **`getTaskResult` 失败被 `.catch(() => undefined)` 吞掉**（`AiPanel.tsx:133`）：任务显示成功但无叠加，用户无从排查。
20. **`nodule_seg` 参数 `min_diameter_mm > max_diameter_mm` 未约束**（`nodule_seg/__init__.py:76-90`）→ `rng.uniform` 抛错任务失败。JSON Schema 或代码兜底。
21. **`nodule_cls` 直接 `planted[0]["z"/"y"/"x"]`**（`nodule_cls/__init__.py:60-61,81-82`），与 `nodule_det/seg` 的 `.get` 风格不一致，sidecar 缺键即崩。
22. **`_read_spacing` 的 z 间距只取 `SliceThickness`**（`dicom_io.py:51-59`）：有 gap/overlap 时 `volume_mm3`、`diameter_mm` 系统性偏差。用排序后的 IPP 差值。
23. **标尺用 y 向 spacing 画 x 向长度**（`StackViewport.tsx:231-233`；后端 `spacing=[z,y,x]`）；且渲染不考虑各向异性像素（`core/camera.ts` 1:1 缩放），DR/MR 非方像素会形变。
24. **切层期间旧帧 + 新层叠加并存**（`useFrameStack.ts:71-95`）：`setLoading(true)` 但保留旧 `frame`，掩膜/框却按新 `sliceIndex` 绘制，短暂错位。目标帧不在缓存时先清空叠加层。
25. **检出框颜色跨组件不一致**：`FindingsList.tsx:65` 用 `items.length`，`StackViewport.tsx:571` 用切片内下标 `bi`。统一按 `box.id` 哈希取色。
26. **任务详情页取消/重试后未失效 `['tasks']`/`['overview']`**（`pages/task-detail.tsx:46-63`），列表与仪表盘残留旧状态。
27. **模型详情表单只在 `model.data?.id` 变化时回填**（`pages/model-detail.tsx:45-54`），保存后服务端新 `default_params` 不回显；oxlint 4 个 exhaustive-deps 警告（`AiPanel`、`model-detail`、`ModelParamsForm`、`models`）均为同类隐患。
28. **Findings 审阅状态只存前端内存**：`ReportPanel` 提交 `reviews` 后后端不落库，刷新即丢，`FindingReviewItem.note` 前端也未提交。需要 `finding_reviews` 表（task_id, finding_id, status, note, reviewer, ts）。
29. **`np_where_labels` 隐藏 label 不匹配**（`report_service.py:415-423`）：`label_id=1` 匹配不到时把所有 >0 当作 1 导出 SEG，属于静默篡改。改为抛错。
30. **`TaskQueue` 状态健壮性**（`infra/queue.py`）：`start()` 重建队列会丢弃 start 前 enqueue 的项且不清 `_canceled`；`_running.add`/`emit` 在 `try` 外，异常时 `_running` 泄漏；`_canceled` 跨线程无锁。
31. **`dicom_export` 把所有源影像 `FrameOfReferenceUID` 改写为第一个**（`dicom_export.py:78-87`），混合 FoR 时产出非法 SEG/SR。不一致应报错。
32. **CI 与文档不符**（`.github/workflows/ci.yml:27,29`）：ruff 只查 5 个文件、mypy 只查 3 个文件，README/WORKFLOW 却写 `ruff check app tests`；实际全量 ruff 32 项、mypy 14 错。先修后扩到 `app tests`。
33. **测试缺口**（`tests/test_api.py`）：未覆盖 `GET /series/{uid}`、`/frames/{idx}` 越界、`/thumbnail`、`result` 409、SSE ping/断连、`artifacts` 目录分支、`mask-frames` 越界与 prefix 非法、`PATCH /models` 校验、上传坏文件/非 DICOM、studies 过滤分页、双重入队（见 #1）、重启对账（见 #8）。`test_cancel_and_retry:343` 断言 `in {全部 5 种状态}` 等于没断言。`_wait_task` 50ms 轮询 + 单测 250s 说明假模型延迟没有在测试里缩到 0（应设 `VOXFLOW_TASK_FAKE_LATENCY_SCALE=0`）。

### C. P2 —— 规范 / 性能 / 设计一致性

34. 代码格式失控：`task_service.py`、`schemas.py`、`stats_service.py` 等方法/类之间无空行、类体内随机空行；38 个文件未过 `ruff format`。加 pre-commit（ruff format + ruff check --fix + oxlint + tsc）。
35. `schemas.py` 用 `TaskStatusLiteral | str` 等“字面量 | str”，OpenAPI 退化为 `string`，前端 `types/api.ts:44` 只能再手写 `| string`，枚举穷尽检查全失效。后端确定的枚举就用纯 `Literal`/`Enum`；`ArtifactRef` 与 `ReportArtifact` 重复。
36. `lib/api.ts:19-32,217-233` 手写 `LiveHealthResponse`/`ReportResponse` 等类型绕过 OpenAPI 生成，`generate:api:check` 防漂移形同虚设；`lib/api.ts` 也不发 `X-Trace-Id`（DESIGN §8 要求）。
37. `init_db` 先 `create_all` 再 `alembic upgrade`（`infra/db.py:57-63`）：schema 真相源二元化，迁移形同 no-op；正确顺序是空库 `alembic upgrade head`，`create_all` 仅测试用。SQLite 未设 `busy_timeout`，2 worker + API + SSE 并发下会偶发 `database is locked`。
38. `parse_dicom_file` 未 `stop_before_pixels` 读全像素只取元数据；`InstanceNumber/SeriesNumber` 直接 `int()` 无兜底（`dicom_io.py:62-113`）；`read_series_volume` 不校验形状一致性。
39. 死代码/重复：`imaging/mask_utils.py` 整文件无人引用，且与 `models_hub/io_png.py`、`anatomy.py` 重复；`MaskEncoding.RLE` 无实现；`dicom_export.py:14` 未用的 `highdicom` import；`study_service.py:5` 未用 `uuid`；前端 `assets/react.svg、vite.svg、hero.png` 未引用；`lib/i18n/terms.ts` 无人调用，`settings.locale` 切换无效（要么实现要么去掉英文选项）；`maskComposite.ts:3-18` 与 `overlayStyle.ts:20-35` 各写一遍颜色解析。
40. `BaseFakeModel.run()` 每次推理 `self.load()`（`base.py:53-79`），换真模型会重复加载权重。
41. `resolve_mask_frame` 只取 `masks[0].uri`（`task_service.py:291`），多标签分割靠同一 PNG 的 label 值区分，`prefix` 参数意义不明；接口契约应写清“单栈多标签”。
42. `StackViewport.tsx` 600+ 行、工具栏经 `window.dispatchEvent('voxflow:viewer-*')` 通讯，多视口 grid 下所有视口同时响应；应拆 `usePointerTools`/`useWheel`/`useKeyboard`，命令走 store。快捷键 `f`/`r` 未 `preventDefault`（与浏览器查找/刷新冲突）。
43. W/L 只在 `windowWidth===1500 && windowCenter===-600` 时从 DICOM 播种（`StackViewport.tsx:124-130`），切序列后沿用上一序列窗宽窗位；MR/DR 首帧前用的是 CT 肺窗。应按 series 维度存 W/L 并在切序列时重置。
44. 性能：DICOM 解码与掩膜合成全部主线程（`useFrameStack.ts:53`、`maskComposite.ts:135-213` 每帧新建 canvas/ImageData、逐像素 5 次 `labelAt`）；`clearMaskImageCache()` 在每个 `StackViewport` mount/unmount 触发，多视口互相清缓存重复下载；无掩膜层也请求 `mask-frames` 产生 404 噪音；`useFrameStack` 不用 AbortController。建议 Worker + `ImageBitmap`，缓存清理上提到 `viewer.tsx`。
45. `pages/tasks.tsx:41-52` 无条件 5s 轮询（`data.tsx` 已有按 inflight 条件轮询的正确写法，复用）；`SeriesList.tsx:26-29` 既回调又直写 store（双真相源）。
46. 路由 `path="*"` 静默跳首页、无 ErrorBoundary（`app/router.tsx:51`）；`index.html` 写死 `class="dark"` 浅色主题闪烁；`models.tsx:74` 一个模型 toggling 禁用全部卡片；`TaskLogsTimeline.tsx:149` key 含 idx。
47. 数据中心无删除 Study/Series 能力，无任务清理/产物 GC，`storage/tasks/` 只增不减。
48. 上传限制前端硬编码（`uploadSchema.ts:4-5`），后端改 `VOXFLOW_MAX_UPLOAD_*` 后割裂；应由 `/health` 或 `/config` 下发。
49. 仓库：`frontend/_audit/*.png`（29 个截图）已被 git 跟踪，应 `git rm --cached` 并加入 `.gitignore`；`frontend` 缺 `.dockerignore`；e2e `cs3d-spike.spec.ts:14` 硬编码 `127.0.0.1:8000`。
50. 文档漂移：README/WORKFLOW 的 CI 描述（见 #32）；DESIGN §5.2 “逻辑 URI” 与实现（见 #13）；DESIGN §8 `X-Trace-Id` 前端未实现（见 #36）；`.env.example` 只列 2 个变量。

### D. P3 —— 建议

51. `report_service.py` 用 stdlib `logging` 而非 `infra/logging.get_logger`，日志无 trace_id。
52. `InferenceContext.volume: Any` 改 `np.ndarray | None`；`queue._canceled` 加锁或改走 loop。
53. `last_tasks_for_studies` 拉全部任务再取首条，改窗口函数 `ROW_NUMBER() OVER (PARTITION BY study_uid ORDER BY created_at DESC)`。
54. `list_studies`/`list_tasks` 的 `ilike` 未转义 `%`/`_`；`tasks.created_at` 无索引却按其排序。
55. `ViewportCorners` 对 MR/DR 也显示 `HU:`；CS3D spike 写死 CT 窗（`Cs3dStackViewport.tsx:69-71`）；canvas/svg 无 `aria-label`。
56. `index.html` 引 Google Fonts，院内离线环境需自托管字体。
57. CI actions 用浮动大版本 tag，建议锁 SHA。

### E. 做得好的（保持）

- 分层清晰（domain → services → api），插件严格走 `require_volume`，`materialize_storage_uris` 统一物化，路由不碰队列细节。
- `StorageService` 路径遍历防护（`resolve_uri`/`safe_join_under`/UID 正则）、ZIP zip-slip 防护、上传流式写盘 + 预算控制。
- 任务成功写入用 `UPDATE ... WHERE status='running'` 乐观锁，取消不会被成功覆盖；`uq_task_inflight` 部分唯一索引 + IntegrityError 兜底处理并发创建。
- 结构化错误体 `{code,message,details,trace_id}`、live/ready 分离、Prometheus 指标、SSE 15s ping + snapshot。
- 前端 `camera.ts` 2D 相机数学正确；zustand selector 细粒度订阅；`useFrameStack` generation stamp 防旧序列写缓存；`lib/sse.ts` 指数退避；`lib/errors.ts` 统一错误归一化；OpenAPI → TS 生成并 CI 校验；`tsconfig` strict 全开且 `tsc` 零错误。
- 测试用 `tmp_path` 隔离 data/storage，teardown drop_all。

### F. 建议修复顺序（每轮一个清晰目标）

1. **正确性底线**：#1 双重执行、#2 切片排序统一、#3 去掉随机体积兜底、#9 queued 卡死、#8 重启对账。
2. **真实 DICOM 可用**：#4 解码（建议后端出解码帧接口）、#16/#17 上传、#22 spacing、#12 约束。
3. **部署可用**：#6 nginx、#7 Dockerfile、#13 相对 URI、#37 迁移顺序 + busy_timeout。
4. **前端一致性**：#5、#24、#25、#26、#27、#43、#45。
5. **工程规范**：#34 格式 + pre-commit、#32 CI 全量、#35/#36 类型契约、#39 死代码清理、#33 补测试。
6. **性能**：#14、#15、#44。


## TODO-2 只关注外观界面

对外观界面的美观度和专业度有极致的追求（因为外观界面就是产品的第一印象）；不要害怕推倒重来而只是修修补补和微调，除非是真的没有优化空间。允许借鉴高质量项目（现在是2026/09，相关或者不相关的领域都可以）。

审查结果（不说废话，只写有用信息）：

> 审查日期 2026-09-07。方法：通读 `frontend/src` 全部页面/组件/样式 + 实跑前后端，Playwright 在 1440×900 / 1280×720 / 1024×768 下截取全部页面（深/浅色）、阅片器（CT/MR/DX、检测/分割结果、2×2、404）共 39 张。
> 参照基准：OHIF v3 / 3D Slicer（阅片交互与叠加规范）、Linear / Vercel Dashboard / shadcn 官方站（信息密度与层级）、Radiology 阅片器通用约定（四角信息、标签屏幕空间、掩膜半透明+轮廓）。
> 严重度：V0 = 第一印象即"坏/假/不可用"；V1 = 明显不专业或误导；V2 = 一致性/细节；V3 = 建议。
> 总体判断：**管理端（总览/数据/模型/任务/设置）骨架合格但"模板感"重、信息密度低、可推倒重排；阅片器是产品第一印象却是最弱一环，建议整页重做**（布局、工具栏、叠加渲染、右侧 AI 面板全部重构，而非微调）。

### A. V0 —— 打开就看得见的问题

1. **阅片工具栏在 1440 宽下就溢出、半数工具不可见**（`ViewerToolbar.tsx:126` `overflow-x-auto`）。1440×900 只看到到"放大"，适应窗口 / 1:1 / 翻转 / 反色 / 重置 / 布局 / 图层全部被截断，需要在工具栏里横向滚动才能点到；1024 下更甚。这是院内最常见分辩率。
   重做：工具栏按优先级分组收纳——常用 6 工具 + 层导航 + 预设常驻；视图操作收进 `···` 溢出菜单（`DropdownMenu`）或第二行；W/L 双滑块从工具栏移除（右键拖拽 + 预设 + 角标已足够，OHIF 亦不放滑块）。
2. **MR / DX 打开为整屏纯白**（`viewer.tsx:77-81` 强制应用设置里的 CT 肺窗；`StackViewport.tsx:124-130` 只在恰好等于 1500/-600 时播种 DICOM W/L，且 DICOM 无 W/L 时无兜底）。同时四角白字压在白图上不可读，`Thk: 1.25 mm` 出现在 DX 上，"HU 探针"对 MR 有效。
   重做：W/L 初始化顺序 = DICOM WindowCenter/Width → 按模态默认（MR/DX 用像素 min/max 或 1%–99% 分位自动窗）→ 用户偏好仅对 CT 生效；角标按模态裁剪字段（DX 无层厚/层数，MR 无 HU）。
3. **检出框标签随缩放放大，遮挡病灶**（`StackViewport.tsx:588-596` 文字/线宽写在图像坐标 SVG 内，`fontSize = width/40` 再乘相机缩放；截图中 "Nodule 90%" 占视口 1/5）。测距文字同理。
   重做：叠加层拆为两层——几何（图像坐标 SVG）与标注文字/线宽（屏幕坐标层，用 `imageToScreen` 反算位置），标签用 11–12px 带半透明底色的 chip，放框外角。
4. **2×2 / 1×2 挂片 = 同一序列复制 4 份、同层同 W/L 联动**（`ViewportGrid.tsx` 所有格子共用 store）。用户看到 4 张一样的图，属于"看得见的假"；小格内四角文字互相重叠。
   重做：要么每格独立 state（各自 series/slice/W/L，拖拽序列缩略图到格子），要么在只有 1 个序列时禁用多视口按钮。角标在格子高度 < 300px 时降级为只显示 `Im`/`W/L`。
5. **切片导航是 96px 的 `Slider`**（`ViewerToolbar.tsx:158`），400 层 CT 每像素 4 层，无法精确定位；无 findings 层位标记。
   重做：视口右侧竖向层位条（OHIF 风格），带 findings 刻度（检出层高亮色点）+ 当前层号；工具栏只保留 `n/N` 可编辑输入框。
6. **阅片页离开时若刷新/关标签，App 侧栏永久变成收起状态**（`AppLayout.tsx:36-41` 依赖 effect cleanup 恢复，但 `sidebarCollapsed` 被 zustand `persist` 落盘；整页刷新无 cleanup）。截图证实：任何先进阅片再 `goto` 其它页的会话侧栏都是收起的。
   修复：阅片页不写持久化字段，用一个非持久化 `viewerMode` 覆盖显示；或 `partialize` 排除它。
7. **总览首屏"模型类型分布"饼图的样本量是 4 个模型**（分割 2 / 检测 1 / 分类 1），为了有图而有图；深色下 recharts 默认白色描边把环切成白线。`Legend` 未走主题色。
   重做：去掉饼图；该位置换成"今日队列/并发利用率"或"模型健康（ready/禁用/失败率）"卡；全部 recharts 元素显式传 `stroke="var(--surface-1)"` 与 `Legend` 自定义渲染。
8. **视口白底区域上的浅色叠字不可读**：比例尺 "25 mm"、`W/L` 角标在 CT 检查床/体部白区、MR/DX 白图上几乎消失（`ViewportCorners.tsx:38` 与 `StackViewport.tsx:631` 只有 `drop-shadow`）。比例尺固定放在底部中央、正压在图像内容上。
   修复：角标与比例尺加 `bg-black/45 backdrop-blur-[2px] px-1.5 rounded` 底板，或改用 1px 黑描边字（`paint-order: stroke`）；比例尺移到右下角 `Im` 上方。

### B. V1 —— 不专业 / 误导

9. **原始 DICOM 值直出**：患者名 `Zhang^Wei`（PN 分隔符）、性别 `O`、年龄 `045Y`、`lung_seg`/`nodule_cls`（模型 id 而非名称，数据中心 AI 状态列、任务列表、任务详情副标题）、阶段 `done`（任务列表/详情，`stageLabel()` 已存在却未用）、`segmentation`（AiPanel 模型下拉拼接 task_type 原值）。全部要走 `formatPatientName / formatSex / formatAge / stageLabel / taskTypeLabel`。
10. **模型描述泄露研发内话**："假肺分割（无硬编码椭圆）"、"确定性伪分类"、"phantom 预埋结节"直接出现在模型仓库卡片与阅片面板（来源 `models_hub/*/__init__.py` `description`）。面向医院的文案必须是能力描述；调试说明放 `tags`/内部字段。
11. **任务列表每行都有 100% 满格进度条 + "done"**，20 行蓝条噪音；进度条只应对 `queued/running` 显示，完成态显示耗时/结果摘要。同页无患者/检查信息，只有 `series 1.2.826…`，放射科用户无法关联到病人。任务详情标题是 `任务 0eaaa32a1c19…` 哈希——应为"患者 · 模型 · 时间"，task_id 放次级 mono。
12. **AiPanel 无兼容模型时仍默认选中不兼容模型并展示其 HU 参数**（`AiPanel.tsx:87-90` 回退 `models[0]`；MR/DX 截图里显示"肺实质分割（不支持…）"+ HU 上下限）。应显示"当前 MR 序列暂无适用模型"空态并隐藏参数表。控制台还有 `Select is changing from uncontrolled to controlled`（`value={selected?.id}` 初始 undefined）。
13. **Toast 位置与阅片右面板冲突**（`providers.tsx:1256` 全局 `top-right`）："已创建推理任务"精准盖住 分析/检出/图层/报告 四个 tab。阅片页应 `bottom-center` 或 `bottom-left`，且成功类提示时长 ≤ 2s。
14. **数据中心操作列三个按钮语义重叠**：`详情`（行点击已能打开抽屉）、`送去分析`、`阅片`（两者都去 viewer，仅差 `?panel=ai`）。1024 宽下按钮文字折行成"送去分/析"、表头折成"模/态"、日期折成两行（`StudiesTable.tsx` 无 `whitespace-nowrap`/列宽）。重做：主操作一个"阅片"，次操作收进行尾 `···`；列加 `min-w`/`nowrap`，低宽度隐藏 `Study UID`、`入库`。
15. **上传对话框不支持文件夹**（`UploadDialog.tsx:414-424` 无 `webkitdirectory`，拖拽目录不递归），真实 DICOM 是几百文件的目录；未展示后端上限（512 MiB / 500 文件）；"生成演示数据"混在上传流程里。重做：双入口（选择文件夹 / 选择 ZIP）+ 拖拽目录展开 + 限额提示；演示数据入口移到空态或设置。
16. **分割叠加缺轮廓、选中态白边成"灰晕"**（`maskComposite.ts:184-214` 只给 emphasized 画 1px 白边并用 alpha 230，经 CSS 放大后呈毛边灰晕；默认无轮廓）。行业做法：填充 25–35% + 同色 1.5px 屏幕空间轮廓（marching squares 或 `filter: drop-shadow` 技巧），选中态加粗轮廓而非提高填充不透明度（当前 ×1.35 后近乎实心遮挡肺内结节）。
17. **Findings 列表信息设计**：每条都常驻 接受/拒绝/修正 三按钮 + 分数进度条 + 复选框 + 掩膜开关，一条 finding 五个可点区域；无"当前层"标识；标签 `Nodule`/`Lung`/`Benign` 英文。重做：列表项 = 颜色条 + 标签(中文) + 关键量(⌀/mL/置信度) + 层号；hover 才出审阅三键；当前层的 findings 置顶或高亮；分数用文字不用进度条。
18. **阅片页首屏与 404 状态**：加载态是三块无间隙 `Skeleton` 拼成的整屏灰板（`viewer.tsx:112-116`）；Study 不存在时因 `retry: 1` 先空白 >1s 才出错误。加载态应保留壳（顶栏 + 左右面板占位 + 黑视口 + spinner）；404 类错误 `retry: false`。
19. **模型详情五个 Tab 各放几行内容**（概览/输入约束/输出/指标/配置），首屏 70% 空白，`保存` 按钮却在页头（只对"配置"tab 有意义）。重做为单页两栏：左侧模型卡 + 指标 + 约束/输出表；右侧"运行配置"卡自带保存。总览页两块 `Table` 内容也可合并成一张"模型运行"表。
20. **深色主题浅色闪烁与首屏**：`index.html` 固定 `class="dark"`，浅色用户每次刷新先深后浅；`PageFallback` 在 `<main class="p-6">` 内再 `p-6`，骨架双倍缩进。
21. **DOM 非法嵌套**：`DataTable.tsx:142-156` 表头统一包 `<button>`，`selectColumn` 的 Radix `Checkbox`（也是 button）嵌进去 → React 报 `<button> cannot contain a nested <button>`，全选框可点性受影响。不可排序列不应包 button。
22. **分类结果无可视化**：`nodule_cls` 结果只在列表显示两条概率条，视口无 CAM 叠加（`cam_overlay_uri` 契约存在但前端未消费）；任务详情"检出摘要"把 Benign/Malignant 当两条 finding 画满宽进度条。应做一张"良/恶性概率"双色条 + CAM 热图图层开关。
23. **Sheet / Dialog / Tooltip 无进出场动画**：`sheet.tsx` 写了 `transition ease-in-out` 但没有 `data-[state]` 位移类；`select.tsx` `animate-in/out` 依赖的 `tailwindcss-animate` 未安装（`package.json` 无），类名全部无效。要么装 `tw-animate-css`，要么删掉这些死类名。
24. **光标/交互反馈**：`wwwc` 工具用 `ns-resize` 光标（应为自定义对比度光标或 `default`），`zoom` 用 `zoom-in` 但拖拽向下是缩小；探针只在点击/移动时更新且无十字标记；测距无删除单条能力，只有 `R` 全清。

### C. V2 —— 一致性 / 细节

25. 顶栏是一句口号 "院内自研模型统一注册 · 调用 · 质控 · 交付"，占据整条栏；应放面包屑/页面上下文 + 全局搜索 + 通知/用户位（当前 TODO 已列，是壳层第一印象的关键空位）。
26. 侧栏 Logo 是字母 `V` 色块，非品牌标识；折叠态 Logo 不可点回首页；折叠按钮"收起侧栏"占一整行，可放到 Logo 行右侧。
27. 主题 token 双份定义（`@theme --color-*` 与 `:root --*`，`index.css:5-80`），recharts 与 `Sparkline` 用 `--brand`，Tailwind 用 `--color-brand`；浅色 `--color-surface-3` 与 `--surface-3` 不同步。统一为一套 `--color-*`，图表通过 `getComputedStyle` 读同一套。
28. 语义色被当分类色：饼图/`chartColors` 用 brand/info/success/warning 表示分割/检测/分类，与状态徽标 成功=绿 / 运行=蓝 冲突。分类色应独立调色板（`overlayStyle.ts` 的 PALETTE 可复用）。
29. 图标尺寸不统一：`h-4 w-4` / `h-3.5 w-3.5` / `h-3 w-3` / `h-5 w-5` 混用于同类按钮；`Badge` `text-xs` 与 `text-[11px]`、`text-[12px]` 硬编码并存（`TaskLogsTimeline.tsx:643`、`AiPanel.tsx:260`）。
30. 表格排序指示用字符 ` ↑`/` ↓` 拼接在表头文字后（`DataTable.tsx:152`、`dashboard.tsx:515`），与 lucide 图标风格不一致；`列`/`紧凑` 工具条在无 toolbar 时独占一行右浮。
31. 阅片顶栏 `patientLabel` 与工具栏 `patientLabel` 与角标三处重复显示患者/序列；工具栏左侧的截断文字挤占工具空间。
32. 空态文案不一致："暂无 findings"、"Findings"、"运行推理后…"、"完成推理并勾选 findings 后…" 中英混排；`Ready · 模型可用`。术语统一：findings → 检出。
33. 数据中心 `AI 状态` 列同时显示徽标 + 百分比 + 模型 id 链接三行，行高被撑到 60px；应只显示徽标（hover 显示模型/时间），进行中显示环形进度。
34. `KpiCard` 四张同构（左文右圆角图标），无趋势/对比（`sparkline` prop 从未被传入，`daily_tasks` 已有 14 天数据可用于"今日推理"卡）。
35. 模型卡启用/停用只靠 Switch，停用卡片外观与启用一致；应整卡降饱和 + "已停用"标签；一个切换中所有卡片 Switch 一起 disabled（`models.tsx:74`）。
36. 设置页"界面语言 English"选项无效（i18n 未实现）；"实验功能 CS3D"面向医院用户不应可见；"关于"卡混入健康信息。
37. `/clinical`、`/annotation` 两页已从导航移除但仍可 URL 访问，内容是"API 说明"和"占位"，会被误入；应删除路由或 302 到对应位置。
38. 任务日志时间戳 `2026-09-06 11:37:24` 与列表 `1 天前` 两种时间格式在同页并存；统一为绝对时间 + hover 相对（或反之）。
39. 阅片左侧序列卡 `aspect-square` 大缩略图 + 两行文字，一列只能放 3 个；真实检查 5–10 个序列需滚动。改为 96px 缩略图 + 右侧文字的横向卡，或缩略图网格。
40. 深色视口周围：`bg-black` 视口紧贴 `bg-surface-1` 面板无过渡；活动格子 `ring-2 ring-brand ring-inset` 单视口时也显示（无意义）。
41. 焦点环仅按钮有 `focus-visible:ring`，`FindingsList` 原生 checkbox、`SeriesList` 卡、表格行点击无键盘可达性（行 `onClick` 无 `tabIndex`/`role`）。

### D. V3 —— 建议

42. 字体：`Noto Sans SC` 优先于 `Inter` 导致数字/拉丁字符全部用 Noto 渲染，`tabular-nums` 在 Noto Sans SC 无效（无 tnum 特性）→ 表格数字不对齐。改 `Inter, "Noto Sans SC"` 顺序或数字列用 `font-mono`；院内离线需自托管字体（Google Fonts 已在 TODO-1 #56）。
43. 引入 8pt 间距与三级圆角规范（`rounded-md/lg/xl` 目前随机），卡片阴影在深色下不可见可去掉 `shadow-sm`。
44. 阅片默认打开中间层（AI 演示场景更有信息量）或记住上次层位。
45. 结果到达时的视口反馈：当前仅 tab 切换 + 跳层；可加 800ms 轮廓脉冲动画定位新检出，并在层位条上出现刻度。
46. 报告 tab 的 `pre` 纯文本报告改为分节卡片（患者/检查/所见/结论）+ 复制/打印按钮。

### E. 做得好的（保持）

- 深浅双主题 token 化、`color-scheme` 正确；浅色管理端整体干净。
- 空态 `EmptyState` 有图标 + 主行动；错误态都有重试。
- 阅片四角信息布局、PACS 鼠标约定（右键 W/L、中键平移、Ctrl+滚轮缩放）、快捷键表齐全。
- 数据表有列显隐/密度切换/批量选择，任务批量操作有二次确认。
- 模型参数表单由 JSON Schema 驱动并即时校验。

### F. 建议重做顺序（每轮一个清晰目标）

1. **阅片器壳与工具栏重做**：#1 #5 #31 #39 —— 三栏布局定稿（56px 图标工具栏可放左侧竖排以释放宽度）、溢出菜单、层位条、序列面板紧凑化。
   - [x] 2026-09-09 Round1 已落地：工具栏常驻 6 工具 + 可编辑层号 + 窗位预设 + 缩放；视图/布局/图层进 `···`；去掉 W/L 滑块与工具栏患者文案；`SliceScrollbar` 竖条+检出刻度；序列卡改为 64px 横排；#6 `viewerShellActive` 非持久化强制收起侧栏（不再写 persist）；顺带修 G：`.gitignore` `/data/` + 回收 `frontend/src/features/data/*`。
2. **阅片渲染与叠加**：#2 #3 #8 #16 #22 #24 —— W/L 初始化、屏幕空间标注层、掩膜轮廓、角标底板、CAM 图层。
   - [x] 2026-09-09 Round2 已落地：`resolveInitialWindow`（DICOM→CT 预设→分位自动）；角标按模态裁剪 + `bg-black/45` 底板；比例尺右下；几何/标注分层（`OverlayScreenLabels`）；掩膜固定半透明填充+同色轮廓（选中加粗轮廓）；CAM `screen` 混合+图层开关；探针十字；测距可选中 Delete 删除；wwwc/zoom 光标修正；`f`/`r` preventDefault；多视口角标 compact。
3. **AI 面板与 Findings**：#12 #13 #17 #46 —— 空态、列表重设计、审阅交互、报告卡片化。
   - [x] 2026-09-10 Round3 已落地：无兼容模型空态+Select 仅列适用模型（受控）；`AppToaster` 阅片 bottom-center/2s；Findings 色条+中文标签+关键量/层号、当前层置顶、hover 审阅、良恶性双色条；报告分节卡片+复制/打印；阶段/任务类型中文；结果加载失败 toast。
4. **管理端信息架构**：#7 #11 #14 #19 #25 #26 #33 #34 —— 总览去饼图加真实趋势、任务列表/详情以患者为中心、模型详情单页化、顶栏换面包屑+搜索。
   - [x] 2026-09-10 Round4 已落地：总览去饼图→队列/模型健康 +「今日推理」sparkline + 合并「模型运行」表；`TaskSummary`/`StudyLastTask` 补患者与模型名；任务列表/详情以患者·模型为标题、进行中才显示进度条；数据中心主操作「阅片」+ `···`、AI 列徽标+进行中转圈、低宽隐藏 UID/入库；模型详情单页两栏；顶栏面包屑+搜索/铃/用户占位；侧栏 Logo 可回首页、折叠钮进 Logo 行。
5. **文案与格式化**：#9 #10 #32 #38 —— 一次性建 `lib/format` 的 PN/性别/年龄/阶段/任务类型格式器并全站替换；模型描述改写。
   - [x] 2026-09-10 Round5 已落地：阅片角标/顶栏/抽屉走 `formatPatientName/Sex/Age`；四模型 description 改为院内能力文案（研发内话进 `synthetic` tag）；Findings→检出、Study/Series 英文碎片中文化；新增 `AbsoluteTime`（绝对时间 + hover 相对）统一任务/数据/总览/日志时间展示。
6. **多视口与上传**：#4 #15。
7. **设计系统收口**：#20 #21 #23 #27 #28 #29 #30 #42 #43 —— token 单一来源、动画库、图标尺寸、字体顺序、修 DOM 嵌套。

### G. 顺带发现（非外观，但必须修）

- [x] `.gitignore` 第 18 行 `data/` 未锚定，导致 **`frontend/src/features/data/` 整个目录未被 git 跟踪**（`git ls-files` 为空、`git check-ignore -v` 命中）。新克隆仓库前端无法编译。已改为 `/data/`（同理 `/storage/`），并 `git add` 回收四文件。


# 仍开放（可选）

## 阅片器 / AI
- [ ] 高级 Hanging Protocol
- [ ] 完整测量组（ROI / 角度等）
- [ ] 窄屏工具条收纳
- [ ] 视口方向标
- [ ] CAM / 标签本地化

## 壳 / 体验
- [ ] 顶栏全局搜索 / 任务铃 / 用户菜单
- [ ] 全量界面 i18n（Settings 已持久化 `locale`）

## 实验 / 替换
- [ ] Cornerstone3D 正式替换主视口（当前为实验路径，见 `docs/` 下 CS3D spike 文档）

## 优先级
1. 看得见的假/错仍优先于纯视觉打磨。
2. CS3D 主视口替换范围大，需单独设计后再动手。