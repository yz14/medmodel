from __future__ import annotations

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from app.infra.db import get_db
from app.infra.storage import StorageService
from app.services.model_service import ModelService
from app.services.stats_service import StatsService
from app.services.study_service import StudyService
from app.services.report_service import ReportService
from app.services.task_service import TaskService


def db_session() -> Generator[Session, None, None]:
    yield from get_db()


def get_study_service(db: Session = Depends(db_session)) -> StudyService:
    return StudyService(db)


def get_model_service(db: Session = Depends(db_session)) -> ModelService:
    return ModelService(db)


def get_task_service(db: Session = Depends(db_session)) -> TaskService:
    return TaskService(db)


def get_stats_service(db: Session = Depends(db_session)) -> StatsService:
    return StatsService(db)


def get_storage() -> StorageService:
    return StorageService()


def get_report_service(db: Session = Depends(db_session)) -> ReportService:
    return ReportService(db)

