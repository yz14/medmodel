from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_stats_service
from app.api.schemas import OverviewStats
from app.services.stats_service import StatsService

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview", response_model=OverviewStats)
def overview(svc: StatsService = Depends(get_stats_service)) -> OverviewStats:
    return OverviewStats.model_validate(svc.overview())

