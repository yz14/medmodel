from __future__ import annotations
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app import __version__
from app.api.deps import db_session
from app.api.schemas import HealthResponse, LiveHealthResponse, QueueStatus, ReadyHealthResponse
from app.infra.queue import get_task_queue
from app.models_hub.registry import registry
router = APIRouter(tags=["health"])

@router.get("/health/live", response_model=LiveHealthResponse)

def health_live() -> LiveHealthResponse:
    """Liveness probe (process up)."""
    return LiveHealthResponse(status="ok", version=__version__)

@router.get("/health/ready", response_model=ReadyHealthResponse)

def health_ready(response: Response, db: Session = Depends(db_session)) -> ReadyHealthResponse:
    """Readiness probe (DB + models)."""
    db_ok = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        db_ok = f"error: {exc}"
    stats = get_task_queue().stats()
    ready = db_ok == "ok" and len(registry) > 0
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadyHealthResponse(
        status="ready" if ready else "not_ready",
        database=db_ok,
        models=len(registry),
        queue=QueueStatus(
            queued=stats.queued,
            running=stats.running,
            max_concurrency=stats.max_concurrency,
        ),
    )

@router.get("/health", response_model=HealthResponse)

def health(db: Session = Depends(db_session)) -> HealthResponse:
    db_ok = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        db_ok = f"error: {exc}"
    stats = get_task_queue().stats()
    return HealthResponse(
        status="ok" if db_ok == "ok" else "degraded",
        version=__version__,
        database=db_ok,
        queue=QueueStatus(
            queued=stats.queued,
            running=stats.running,
            max_concurrency=stats.max_concurrency,
        ),
        models=len(registry),
    )
