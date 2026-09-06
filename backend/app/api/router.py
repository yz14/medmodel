from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import health, metrics, models, series, stats, studies, tasks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(metrics.router)
api_router.include_router(stats.router)
api_router.include_router(studies.router)
api_router.include_router(series.router)
api_router.include_router(models.router)
api_router.include_router(tasks.router)

