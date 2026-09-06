from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse

from app.api.deps import get_report_service, get_task_service
from app.api.schemas import (
    InferenceResult,
    Page,
    ReportCreateRequest,
    ReportResponse,
    TaskCreateRequest,
    TaskCreateResponse,
    TaskSummary,
)
from app.infra.queue import get_task_queue
from app.models_hub.constraints import UnsupportedInputError
from app.services.report_service import ReportService
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=TaskCreateResponse)
async def create_task(
    body: TaskCreateRequest,
    svc: TaskService = Depends(get_task_service),
) -> TaskCreateResponse:
    try:
        task = svc.create_task(body.series_uid, body.model_id, body.params)
        svc.db.commit()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": str(exc)}) from exc
    except UnsupportedInputError as exc:
        raise HTTPException(
            status_code=400, detail={"code": exc.code, "message": str(exc)}
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": str(exc)}) from exc

    if not task.cache_hit:
        await svc.enqueue(task.task_id)

    return TaskCreateResponse(task_id=task.task_id, status=task.status, cache_hit=task.cache_hit)


@router.get("", response_model=Page[TaskSummary])
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    model_id: str | None = None,
    q: str | None = Query(None, description="Search task_id / series / model / error"),
    svc: TaskService = Depends(get_task_service),
) -> Page[TaskSummary]:
    rows, total = svc.list_tasks(
        page=page, page_size=page_size, status=status_filter, model_id=model_id, q=q
    )
    return Page(
        items=[TaskSummary.model_validate(svc.task_to_dict(t)) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{task_id}", response_model=TaskSummary)
def get_task(task_id: str, svc: TaskService = Depends(get_task_service)) -> TaskSummary:
    task = svc.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id})
    return TaskSummary.model_validate(svc.task_to_dict(task, include_logs=True))


@router.get("/{task_id}/result", response_model=InferenceResult)
def get_result(task_id: str, svc: TaskService = Depends(get_task_service)) -> InferenceResult:
    task = svc.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id})
    if task.status != "succeeded" or not task.result_json:
        raise HTTPException(
            status_code=409,
            detail={"code": "RESULT_NOT_READY", "message": f"status={task.status}"},
        )
    return InferenceResult.model_validate(task.result_json)


@router.get("/{task_id}/events")
async def task_events(task_id: str) -> StreamingResponse:
    from app.infra import db as db_mod

    if db_mod.SessionLocal is None:
        db_mod.configure_engine()
    factory = db_mod.SessionLocal
    assert factory is not None

    db = factory()
    try:
        svc = TaskService(db)
        task = svc.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id})
    finally:
        db.close()

    queue = get_task_queue()
    event_q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def listener(event: dict[str, Any]) -> None:
        if event.get("task_id") == task_id:
            await event_q.put(event)

    unsubscribe = queue.subscribe(listener)

    async def event_stream() -> AsyncIterator[str]:
        db2 = factory()
        try:
            svc2 = TaskService(db2)
            current = svc2.get_task(task_id)
            if current is not None:
                snapshot = {
                    "type": "snapshot",
                    "task_id": task_id,
                    "status": current.status,
                    "stage": current.stage,
                    "progress": current.progress,
                    "message": current.message,
                }
                yield f"data: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
                if current.status in {"succeeded", "failed", "canceled"}:
                    return

            while True:
                try:
                    event = await asyncio.wait_for(event_q.get(), timeout=15.0)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if event.get("type") in {"succeeded", "failed", "canceled"}:
                        break
                except asyncio.TimeoutError:
                    db2.expire_all()
                    current = svc2.get_task(task_id)
                    if current is None:
                        break
                    ping = {
                        "type": "ping",
                        "task_id": task_id,
                        "status": current.status,
                        "stage": current.stage,
                        "progress": current.progress,
                        "message": current.message,
                    }
                    yield f"data: {json.dumps(ping, ensure_ascii=False)}\n\n"
                    if current.status in {"succeeded", "failed", "canceled"}:
                        break
        finally:
            unsubscribe()
            db2.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{task_id}/cancel")
def cancel_task(task_id: str, svc: TaskService = Depends(get_task_service)) -> dict[str, Any]:
    try:
        task = svc.cancel(task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id}) from exc
    return svc.task_to_dict(task)


@router.post("/{task_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_task(task_id: str, svc: TaskService = Depends(get_task_service)) -> TaskCreateResponse:
    try:
        task = svc.retry(task_id)
        svc.db.commit()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id}) from exc
    if not task.cache_hit:
        await svc.enqueue(task.task_id)
    return TaskCreateResponse(task_id=task.task_id, status=task.status, cache_hit=task.cache_hit)


@router.post("/{task_id}/reports", response_model=ReportResponse)
def create_report(
    task_id: str,
    body: ReportCreateRequest,
    reports: ReportService = Depends(get_report_service),
) -> ReportResponse:
    try:
        payload = reports.generate(
            task_id,
            body.finding_ids,
            reviews=[r.model_dump() for r in body.reviews],
            export_seg=body.export_seg,
            export_sr=body.export_sr,
            export_gsps=body.export_gsps,
        )
        reports.db.commit()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": str(exc)}) from exc
    except LookupError as exc:
        raise HTTPException(status_code=409, detail={"code": "RESULT_NOT_READY", "message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": str(exc)}) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"code": "SOURCE_MISSING", "message": str(exc)}) from exc
    except Exception as exc:  # noqa: BLE001 — surface exporter failures cleanly
        raise HTTPException(
            status_code=500,
            detail={"code": "REPORT_EXPORT_FAILED", "message": str(exc)},
        ) from exc
    return ReportResponse.model_validate(payload)


@router.get("/{task_id}/mask-frames/{slice_index}")
def get_mask_frame(
    task_id: str,
    slice_index: int,
    prefix: str = Query("label", pattern="^[a-zA-Z0-9_-]{1,32}$"),
    svc: TaskService = Depends(get_task_service),
) -> FileResponse:
    try:
        path = svc.resolve_mask_frame(task_id, slice_index, prefix=prefix)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id}) from exc
    except LookupError as exc:
        raise HTTPException(status_code=409, detail={"code": "RESULT_NOT_READY", "message": str(exc)}) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"code": "MASK_FRAME_MISSING", "message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "MASK_PATH_INVALID", "message": str(exc)}) from exc

    return FileResponse(path, media_type="image/png", filename=path.name)


@router.get("/{task_id}/artifacts/{name}")
def get_artifact(
    task_id: str,
    name: str,
    svc: TaskService = Depends(get_task_service),
) -> FileResponse:
    try:
        path, media_type = svc.resolve_artifact(task_id, name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": task_id}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_ARTIFACT_NAME", "message": str(exc)}) from exc
    except IsADirectoryError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "ARTIFACT_IS_DIR", "message": "目录型产物请通过掩膜帧接口获取"},
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"code": "ARTIFACT_NOT_FOUND", "message": str(exc)}) from exc

    return FileResponse(path, media_type=media_type, filename=name)
