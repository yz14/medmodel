from __future__ import annotations
import hashlib
import json
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import jsonschema
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.domain.contracts import InferenceContext, InferenceResult, ModelPlugin, SeriesMeta, WorkDir
from app.domain.enums import TaskStage, TaskStatus
from app.infra.config import get_settings
from app.infra.logging import get_logger, bind_trace_id, trace_id_var
from app.infra.orm import ArtifactRow, SeriesRow, StudyRow, TaskLogRow, TaskRow
from app.infra.queue import get_task_queue
from app.infra.storage import StorageService
from app.infra.timeutil import utc_iso
from app.models_hub.constraints import UnsupportedInputError, check_input_constraints
from app.models_hub.registry import registry
from app.services.model_service import ModelService
from app.services.serializers import inference_result_to_dict
logger = get_logger(__name__)
_INFLIGHT = (TaskStatus.QUEUED.value, TaskStatus.RUNNING.value)

def _db_session():
    from app.infra import db as db_mod
    if db_mod.SessionLocal is None:
        db_mod.configure_engine()
    assert db_mod.SessionLocal is not None
    return db_mod.SessionLocal()

def params_hash(model_id: str, model_version: str, series_uid: str, params: dict[str, Any]) -> str:
    payload = json.dumps(
        {
            "model_id": model_id,
            "model_version": model_version,
            "series_uid": series_uid,
            "params": params,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def merge_and_validate_params(
    schema: dict[str, Any],
    stored_defaults: dict[str, Any] | None,
    user_params: dict[str, Any] | None,
) -> dict[str, Any]:
    properties = schema.get("properties") if isinstance(schema, dict) else None
    defaults: dict[str, Any] = {}
    if isinstance(properties, dict):
        for key, prop in properties.items():
            if isinstance(prop, dict) and "default" in prop:
                defaults[key] = prop["default"]
    if stored_defaults:
        defaults.update(stored_defaults)
    if user_params:
        defaults.update(user_params)
    if schema:
        try:
            jsonschema.validate(instance=defaults, schema=schema)
        except jsonschema.ValidationError as exc:
            path = ".".join(str(p) for p in exc.absolute_path) or "(root)"
            raise ValueError(f"参数校验失败 [{path}]: {exc.message}") from exc
    return defaults

def run_plugin(plugin: ModelPlugin, ctx: InferenceContext) -> InferenceResult:
    """Run any ModelPlugin — prefer optional `.run`, else preprocess→infer→postprocess."""
    runner = getattr(plugin, "run", None)
    if callable(runner):
        return runner(ctx)  # type: ignore[no-any-return]
    t0 = time.perf_counter()
    data = plugin.preprocess(ctx)
    ctx.stage_timings["preprocess"] = round((time.perf_counter() - t0) * 1000, 1)
    t0 = time.perf_counter()
    raw = plugin.infer(data, ctx)
    ctx.stage_timings["infer"] = round((time.perf_counter() - t0) * 1000, 1)
    t0 = time.perf_counter()
    result = plugin.postprocess(raw, ctx)
    ctx.stage_timings["postprocess"] = round((time.perf_counter() - t0) * 1000, 1)
    return result

def materialize_storage_uris(result: InferenceResult, storage: StorageService) -> None:
    """Convert absolute paths written by plugins into storage:// URIs."""
    def fix(uri: str) -> str:
        if uri.startswith("storage://"):
            return uri
        return storage.to_uri(Path(uri))
    for art in result.artifacts:
        art.uri = fix(art.uri)
    for mask in result.masks:
        mask.uri = fix(mask.uri)
    if result.cam_overlay_uri:
        result.cam_overlay_uri = fix(result.cam_overlay_uri)

class TaskService:
    def __init__(self, db: Session, storage: StorageService | None = None) -> None:
        self.db = db
        self.storage = storage or StorageService()
    def list_tasks(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        model_id: str | None = None,
        q: str | None = None,
    ) -> tuple[list[TaskRow], int]:
        stmt = select(TaskRow)
        count_stmt = select(func.count()).select_from(TaskRow)
        if status:
            stmt = stmt.where(TaskRow.status == status)
            count_stmt = count_stmt.where(TaskRow.status == status)
        if model_id:
            stmt = stmt.where(TaskRow.model_id == model_id)
            count_stmt = count_stmt.where(TaskRow.model_id == model_id)
        if q:
            pattern = f"%{q.strip()}%"
            clause = or_(
                TaskRow.task_id.ilike(pattern),
                TaskRow.series_uid.ilike(pattern),
                TaskRow.study_uid.ilike(pattern),
                TaskRow.model_id.ilike(pattern),
                TaskRow.error_code.ilike(pattern),
                TaskRow.error_message.ilike(pattern),
            )
            stmt = stmt.where(clause)
            count_stmt = count_stmt.where(clause)
        total = int(self.db.scalar(count_stmt) or 0)
        rows = self.db.scalars(
            stmt.order_by(TaskRow.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        ).all()
        return list(rows), total
    def get_task(self, task_id: str) -> TaskRow | None:
        return self.db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
    def create_task(self, series_uid: str, model_id: str, params: dict[str, Any] | None = None) -> TaskRow:
        if model_id not in registry:
            raise KeyError(f"未知模型: {model_id}")
        model_svc = ModelService(self.db)
        if not model_svc.is_enabled(model_id):
            raise ValueError(f"模型已禁用: {model_id}")
        series = self.db.scalar(select(SeriesRow).where(SeriesRow.series_uid == series_uid))
        if series is None:
            raise KeyError(f"未知序列: {series_uid}")
        plugin = registry.get(model_id)
        check_input_constraints(
            plugin.spec,
            modality=series.modality,
            body_part=series.body_part,
            num_instances=int(series.num_instances or 0),
        )
        state_model = model_svc.get_model(model_id)
        defaults = merge_and_validate_params(
            plugin.spec.params_schema,
            state_model.get("default_params") or {},
            params,
        )
        ph = params_hash(model_id, plugin.spec.version, series_uid, defaults)
        inflight = self.db.scalar(
            select(TaskRow)
            .where(
                TaskRow.series_uid == series_uid,
                TaskRow.model_id == model_id,
                TaskRow.params_hash == ph,
                TaskRow.status.in_(_INFLIGHT),
            )
            .order_by(TaskRow.created_at.desc())
        )
        if inflight is not None:
            return inflight
        cached = self.db.scalar(
            select(TaskRow)
            .where(
                TaskRow.series_uid == series_uid,
                TaskRow.model_id == model_id,
                TaskRow.params_hash == ph,
                TaskRow.status == TaskStatus.SUCCEEDED.value,
            )
            .order_by(TaskRow.finished_at.desc())
        )
        task_id = uuid.uuid4().hex
        work = self.storage.task_dir(task_id)
        task = TaskRow(
            task_id=task_id,
            series_uid=series_uid,
            study_uid=series.study_uid,
            model_id=model_id,
            model_version=plugin.spec.version,
            params=defaults,
            params_hash=ph,
            status=TaskStatus.QUEUED.value,
            stage=TaskStage.QUEUED.value,
            progress=0.0,
            message="任务已入队",
            work_dir=str(work),
            trace_id=trace_id_var.get() if trace_id_var.get() != "-" else None,
        )
        self.db.add(task)
        self._add_log(task_id, "任务创建", stage=TaskStage.QUEUED.value)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            raced = self.db.scalar(
                select(TaskRow)
                .where(
                    TaskRow.series_uid == series_uid,
                    TaskRow.model_id == model_id,
                    TaskRow.params_hash == ph,
                    TaskRow.status.in_(_INFLIGHT),
                )
                .order_by(TaskRow.created_at.desc())
            )
            if raced is not None:
                return raced
            raise
        if cached is not None and cached.result_json is not None:
            task.status = TaskStatus.SUCCEEDED.value
            task.stage = TaskStage.DONE.value
            task.progress = 1.0
            task.message = "命中幂等缓存"
            task.result_json = cached.result_json
            task.cache_hit = True
            task.cached_from = cached.task_id
            # Prefer source runtime for display; 0 means "instant cache" — UI shows 缓存 badge
            task.runtime_ms = cached.runtime_ms
            task.stage_timings = cached.stage_timings
            task.started_at = datetime.now(timezone.utc)
            task.finished_at = datetime.now(timezone.utc)
            # N-B2: reuse artifact URIs (content-addressed) on the new task row
            for art in cached.artifacts:
                self.db.add(
                    ArtifactRow(
                        task_id=task_id,
                        name=art.name,
                        uri=art.uri,
                        media_type=art.media_type,
                        size_bytes=art.size_bytes,
                    )
                )
            self._add_log(task_id, f"复用结果自任务 {cached.task_id}", stage=TaskStage.DONE.value)
            self.db.flush()
            return task
        return task
    async def enqueue(self, task_id: str) -> None:
        queue = get_task_queue()
        async def _run() -> None:
            await InferenceOrchestrator.run_task(task_id)
        await queue.enqueue(task_id, _run)
    def cancel(self, task_id: str) -> TaskRow:
        task = self.get_task(task_id)
        if task is None:
            raise KeyError(task_id)
        if task.status in {TaskStatus.SUCCEEDED.value, TaskStatus.FAILED.value, TaskStatus.CANCELED.value}:
            return task
        get_task_queue().request_cancel(task_id)
        task.status = TaskStatus.CANCELED.value
        task.message = "任务已取消"
        task.finished_at = datetime.now(timezone.utc)
        self._add_log(task_id, "用户取消任务", stage=task.stage)
        self.db.flush()
        return task
    def retry(self, task_id: str) -> TaskRow:
        old = self.get_task(task_id)
        if old is None:
            raise KeyError(task_id)
        return self.create_task(old.series_uid, old.model_id, old.params)
    def resolve_mask_frame(
        self,
        task_id: str,
        slice_index: int,
        *,
        prefix: str = "label",
    ) -> Path:
        if slice_index < 0:
            raise ValueError("slice_index < 0")
        task = self.get_task(task_id)
        if task is None:
            raise KeyError(task_id)
        if task.status != TaskStatus.SUCCEEDED.value or not task.result_json:
            raise LookupError(f"status={task.status}")
        masks = task.result_json.get("masks") or []
        if not masks:
            raise FileNotFoundError("no masks")
        uri = masks[0].get("uri")
        if not uri:
            raise FileNotFoundError("mask uri missing")
        stack_dir = self.storage.resolve_uri(uri)
        if not stack_dir.is_dir():
            if stack_dir.is_file():
                stack_dir = stack_dir.parent
            else:
                raise FileNotFoundError(uri)
        filename = f"{prefix}_{slice_index:04d}.png"
        path = self.storage.safe_join_under(stack_dir, filename)
        if not path.is_file():
            raise FileNotFoundError(filename)
        return path
    def resolve_artifact(self, task_id: str, name: str) -> tuple[Path, str]:
        if not name or name != Path(name).name or ".." in name or "/" in name or "\\" in name:
            raise ValueError("非法产物名")
        task = self.get_task(task_id)
        if task is None:
            raise KeyError(task_id)
        art = next((a for a in task.artifacts if a.name == name), None)
        if art is None and task.result_json:
            # Fallback: result_json artifacts (legacy / incomplete cache rows)
            for ref in task.result_json.get("artifacts") or []:
                if ref.get("name") == name and ref.get("uri"):
                    art = ArtifactRow(
                        task_id=task_id,
                        name=name,
                        uri=ref["uri"],
                        media_type=ref.get("media_type") or "application/octet-stream",
                        size_bytes=ref.get("size_bytes"),
                    )
                    break
        if art is None:
            raise FileNotFoundError(name)
        path = self.storage.resolve_uri(art.uri)
        if path.is_dir():
            raise IsADirectoryError(name)
        if not path.is_file():
            raise FileNotFoundError(name)
        if task.work_dir:
            try:
                path.resolve().relative_to(Path(task.work_dir).resolve())
            except ValueError:
                path.resolve().relative_to(self.storage.settings.storage_dir.resolve())
        return path, art.media_type or "application/octet-stream"
    def task_to_dict(
        self,
        task: TaskRow,
        include_logs: bool = False,
        *,
        study: StudyRow | None = None,
    ) -> dict[str, Any]:
        if study is None and task.study_uid:
            study = self.db.scalar(select(StudyRow).where(StudyRow.study_uid == task.study_uid))
        model_name: str | None = None
        if task.model_id in registry:
            model_name = registry.get(task.model_id).spec.name
        data: dict[str, Any] = {
            "task_id": task.task_id,
            "series_uid": task.series_uid,
            "study_uid": task.study_uid,
            "model_id": task.model_id,
            "model_version": task.model_version,
            "model_name": model_name,
            "patient_name": study.patient_name if study else None,
            "patient_id": study.patient_id if study else None,
            "modality": study.modality if study else None,
            "study_description": study.study_description if study else None,
            "params": task.params,
            "status": task.status,
            "stage": task.stage,
            "progress": task.progress,
            "message": task.message,
            "cache_hit": task.cache_hit,
            "cached_from": task.cached_from,
            "runtime_ms": task.runtime_ms,
            "stage_timings": task.stage_timings,
            "error_code": task.error_code,
            "error_message": task.error_message,
            "trace_id": task.trace_id,
            "created_at": utc_iso(task.created_at),
            "started_at": utc_iso(task.started_at),
            "finished_at": utc_iso(task.finished_at),
            "artifacts": [
                {
                    "name": a.name,
                    "uri": a.uri,
                    "media_type": a.media_type,
                    "size_bytes": a.size_bytes,
                    "url": f"/api/v1/tasks/{task.task_id}/artifacts/{a.name}",
                }
                for a in task.artifacts
            ],
        }
        if include_logs:
            data["logs"] = [
                {
                    "level": log.level,
                    "stage": log.stage,
                    "message": log.message,
                    "created_at": utc_iso(log.created_at),
                }
                for log in task.logs
            ]
        return data

    def tasks_to_dicts(self, tasks: list[TaskRow], include_logs: bool = False) -> list[dict[str, Any]]:
        """Batch-enrich tasks with Study demographics (avoids N+1)."""
        study_uids = {t.study_uid for t in tasks if t.study_uid}
        studies: dict[str, StudyRow] = {}
        if study_uids:
            rows = self.db.scalars(select(StudyRow).where(StudyRow.study_uid.in_(study_uids))).all()
            studies = {s.study_uid: s for s in rows}
        return [
            self.task_to_dict(t, include_logs=include_logs, study=studies.get(t.study_uid or ""))
            for t in tasks
        ]

    def _add_log(self, task_id: str, message: str, *, stage: str | None = None, level: str = "info") -> None:
        self.db.add(TaskLogRow(task_id=task_id, level=level, stage=stage, message=message))

class InferenceOrchestrator:
    @staticmethod
    async def run_task(task_id: str) -> None:
        import asyncio
        await asyncio.to_thread(InferenceOrchestrator._run_sync, task_id)
    @staticmethod
    def _run_sync(task_id: str) -> None:
        queue = get_task_queue()
        db = _db_session()
        storage = StorageService()
        try:
            task = db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
            if task is None:
                return
            if task.trace_id:
                bind_trace_id(task.trace_id)
            if queue.is_canceled(task_id) or task.status == TaskStatus.CANCELED.value:
                return
            series = db.scalar(select(SeriesRow).where(SeriesRow.series_uid == task.series_uid))
            if series is None:
                raise RuntimeError(f"序列不存在: {task.series_uid}")
            plugin = registry.get(task.model_id)
            task.status = TaskStatus.RUNNING.value
            task.started_at = datetime.now(timezone.utc)
            task.message = "开始执行"
            db.add(TaskLogRow(task_id=task_id, level="info", stage="preprocess", message="worker 领取任务"))
            db.commit()
            work = WorkDir.create(Path(task.work_dir or storage.task_dir(task_id)))
            spacing = None
            if series.spacing_z and series.spacing_y and series.spacing_x:
                spacing = (series.spacing_z, series.spacing_y, series.spacing_x)
            series_meta = SeriesMeta(
                series_uid=series.series_uid,
                study_uid=series.study_uid,
                modality=series.modality,
                body_part=series.body_part,
                description=series.description,
                rows=series.rows,
                cols=series.cols,
                num_instances=series.num_instances,
                spacing=spacing,
                series_path=Path(series.storage_path),
            )
            def progress_cb(pct: float, stage: str, message: str) -> None:
                if queue.is_canceled(task_id):
                    raise RuntimeError("TASK_CANCELED")
                t = db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
                if t is None:
                    return
                t.progress = max(0.0, min(float(pct), 0.99))
                t.stage = stage
                t.message = message
                db.add(TaskLogRow(task_id=task_id, level="info", stage=stage, message=message))
                db.commit()
                queue.emit_threadsafe(
                    {
                        "type": "progress",
                        "task_id": task_id,
                        "progress": t.progress,
                        "stage": stage,
                        "message": message,
                        "status": TaskStatus.RUNNING.value,
                    }
                )
            ctx = InferenceContext(
                task_id=task_id,
                work_dir=work,
                series=series_meta,
                params=task.params or {},
                progress_cb=progress_cb,
                latency_scale=get_settings().task_fake_latency_scale,
                cancel_check=lambda: queue.is_canceled(task_id),
            )
            # N-B8: Orchestrator preloads volume + phantom sidecar; plugins stay compute-only
            from app.imaging.dicom_io import read_series_volume

            volume = None
            if series.storage_path:
                try:
                    volume = read_series_volume(series.storage_path)
                except Exception:  # noqa: BLE001
                    logger.exception("volume_preload_failed", series_uid=series.series_uid)
            if volume is None:
                import numpy as np

                volume = np.random.default_rng(42).normal(
                    loc=-200,
                    scale=180,
                    size=(
                        max(series.num_instances, 8),
                        max(series.rows, 32),
                        max(series.cols, 32),
                    ),
                ).astype(np.float32)
            ctx.volume = volume
            extras: dict[str, Any] = {}
            if series.storage_path:
                meta_path = Path(series.storage_path) / "phantom_meta.json"
                if meta_path.is_file():
                    try:
                        extras = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:  # noqa: BLE001
                        logger.warning("phantom_meta_read_failed", path=str(meta_path))
            ctx.extras = extras
            result = run_plugin(plugin, ctx)
            materialize_storage_uris(result, storage)
            result_dict = inference_result_to_dict(result)

            # N-B3: optimistic lock — do not overwrite canceled
            if queue.is_canceled(task_id):
                raise RuntimeError("TASK_CANCELED")

            finished = datetime.now(timezone.utc)
            upd = db.execute(
                update(TaskRow)
                .where(
                    TaskRow.task_id == task_id,
                    TaskRow.status == TaskStatus.RUNNING.value,
                )
                .values(
                    result_json=result_dict,
                    status=TaskStatus.SUCCEEDED.value,
                    stage=TaskStage.DONE.value,
                    progress=1.0,
                    message=result.summary,
                    runtime_ms=result.runtime_ms,
                    stage_timings=dict(ctx.stage_timings),
                    finished_at=finished,
                )
            )
            if upd.rowcount == 0:
                # Canceled (or otherwise left running) — do not emit succeeded
                db.rollback()
                return

            for art in result.artifacts:
                db.add(
                    ArtifactRow(
                        task_id=task_id,
                        name=art.name,
                        uri=art.uri,
                        media_type=art.media_type,
                        size_bytes=art.size_bytes,
                    )
                )
            db.add(TaskLogRow(task_id=task_id, level="info", stage="done", message="任务成功完成"))
            db.commit()
            queue.emit_threadsafe(
                {
                    "type": "succeeded",
                    "task_id": task_id,
                    "progress": 1.0,
                    "status": TaskStatus.SUCCEEDED.value,
                    "message": result.summary,
                }
            )
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            canceled = str(exc) == "TASK_CANCELED" or queue.is_canceled(task_id)
            finished = datetime.now(timezone.utc)
            if canceled:
                db.execute(
                    update(TaskRow)
                    .where(
                        TaskRow.task_id == task_id,
                        TaskRow.status.in_([TaskStatus.RUNNING.value, TaskStatus.QUEUED.value, TaskStatus.CANCELED.value]),
                    )
                    .values(
                        status=TaskStatus.CANCELED.value,
                        error_code="CANCELED",
                        error_message="任务已取消",
                        error_traceback=None,
                        message="任务已取消",
                        finished_at=finished,
                    )
                )
                db.add(
                    TaskLogRow(
                        task_id=task_id,
                        level="warning",
                        stage="canceled",
                        message="任务已取消",
                    )
                )
                db.commit()
                queue.emit_threadsafe(
                    {
                        "type": "canceled",
                        "task_id": task_id,
                        "status": TaskStatus.CANCELED.value,
                        "message": "任务已取消",
                    }
                )
            else:
                t = db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
                if t is not None and t.status == TaskStatus.RUNNING.value:
                    t.status = TaskStatus.FAILED.value
                    t.error_code = "INFERENCE_ERROR"
                    t.error_message = str(exc)
                    t.error_traceback = traceback.format_exc()
                    t.message = t.error_message
                    t.finished_at = finished
                    db.add(
                        TaskLogRow(
                            task_id=task_id,
                            level="error",
                            stage=t.stage,
                            message=t.error_message or "",
                        )
                    )
                    db.commit()
                    queue.emit_threadsafe(
                        {
                            "type": "failed",
                            "task_id": task_id,
                            "status": TaskStatus.FAILED.value,
                            "message": str(exc),
                        }
                    )
            if not canceled:
                logger.exception("task_failed", task_id=task_id)
        finally:
            db.close()
