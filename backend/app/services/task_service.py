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
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.domain.contracts import InferenceContext, InferenceResult, ModelPlugin, SeriesMeta, WorkDir
from app.domain.enums import TaskStage, TaskStatus
from app.infra.config import get_settings
from app.infra.logging import get_logger
from app.infra.orm import ArtifactRow, SeriesRow, TaskLogRow, TaskRow
from app.infra.queue import get_task_queue
from app.infra.storage import StorageService
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
    ) -> tuple[list[TaskRow], int]:
        stmt = select(TaskRow)
        count_stmt = select(func.count()).select_from(TaskRow)
        if status:
            stmt = stmt.where(TaskRow.status == status)
            count_stmt = count_stmt.where(TaskRow.status == status)
        if model_id:
            stmt = stmt.where(TaskRow.model_id == model_id)
            count_stmt = count_stmt.where(TaskRow.model_id == model_id)
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
            task.runtime_ms = 0
            task.started_at = datetime.now(timezone.utc)
            task.finished_at = datetime.now(timezone.utc)
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
    def task_to_dict(self, task: TaskRow, include_logs: bool = False) -> dict[str, Any]:
        data: dict[str, Any] = {
            "task_id": task.task_id,
            "series_uid": task.series_uid,
            "study_uid": task.study_uid,
            "model_id": task.model_id,
            "model_version": task.model_version,
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
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "finished_at": task.finished_at.isoformat() if task.finished_at else None,
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
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in task.logs
            ]
        return data
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
            )
            result = run_plugin(plugin, ctx)
            materialize_storage_uris(result, storage)
            result_dict = inference_result_to_dict(result)
            t = db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
            if t is None:
                return
            t.result_json = result_dict
            t.status = TaskStatus.SUCCEEDED.value
            t.stage = TaskStage.DONE.value
            t.progress = 1.0
            t.message = result.summary
            t.runtime_ms = result.runtime_ms
            t.stage_timings = dict(ctx.stage_timings)
            t.finished_at = datetime.now(timezone.utc)
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
            t = db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
            if t is not None:
                canceled = str(exc) == "TASK_CANCELED" or queue.is_canceled(task_id)
                t.status = TaskStatus.CANCELED.value if canceled else TaskStatus.FAILED.value
                t.error_code = "CANCELED" if canceled else "INFERENCE_ERROR"
                t.error_message = "任务已取消" if canceled else str(exc)
                t.error_traceback = None if canceled else traceback.format_exc()
                t.message = t.error_message
                t.finished_at = datetime.now(timezone.utc)
                db.add(
                    TaskLogRow(
                        task_id=task_id,
                        level="warning" if canceled else "error",
                        stage=t.stage,
                        message=t.error_message or "",
                    )
                )
                db.commit()
                queue.emit_threadsafe(
                    {
                        "type": "canceled" if canceled else "failed",
                        "task_id": task_id,
                        "status": t.status,
                        "message": t.error_message,
                    }
                )
            logger.exception("task_failed", task_id=task_id)
        finally:
            db.close()
