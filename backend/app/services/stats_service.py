from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.enums import TaskStatus
from app.infra.orm import StudyRow, TaskRow
from app.infra.queue import get_task_queue
from app.models_hub.registry import registry
from app.services.model_service import ModelService
from app.services.task_service import TaskService


class StatsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def overview(self) -> dict[str, Any]:
        study_count = int(self.db.scalar(select(func.count()).select_from(StudyRow)) or 0)
        models = ModelService(self.db).list_models()
        enabled_models = [m for m in models if m["enabled"]]
        today = datetime.now(timezone.utc).date()
        all_tasks = self.db.scalars(select(TaskRow)).all()
        today_tasks = sum(1 for t in all_tasks if t.created_at and t.created_at.date() == today)

        seg_metrics = [m["metrics"].get("dice", 0) for m in models if m["task_type"] == "segmentation"]
        avg_dice = sum(seg_metrics) / len(seg_metrics) if seg_metrics else 0.0

        distribution = {
            "segmentation": sum(1 for m in models if m["task_type"] == "segmentation"),
            "detection": sum(1 for m in models if m["task_type"] == "detection"),
            "classification": sum(1 for m in models if m["task_type"] == "classification"),
        }

        recent_tasks, _ = TaskService(self.db).list_tasks(page=1, page_size=8)
        queue_stats = get_task_queue().stats()

        return {
            "kpis": {
                "study_count": study_count,
                "model_count": len(enabled_models),
                "today_tasks": today_tasks,
                "avg_dice": round(avg_dice, 3),
            },
            "model_metrics": [
                {
                    "id": m["id"],
                    "name": m["name"],
                    "task_type": m["task_type"],
                    "dice": m["metrics"].get("dice"),
                    "iou": m["metrics"].get("iou"),
                    "hd95": m["metrics"].get("hd95"),
                    "asd": m["metrics"].get("asd"),
                }
                for m in models
                if m["task_type"] == "segmentation"
            ],
            "model_distribution": distribution,
            "recent_tasks": [TaskService(self.db).task_to_dict(t) for t in recent_tasks],
            "queue": {
                "queued": queue_stats.queued,
                "running": queue_stats.running,
                "max_concurrency": queue_stats.max_concurrency,
            },
            "registered_models": len(registry),
        }

