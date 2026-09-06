from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.enums import TaskStatus
from app.infra.orm import StudyRow, TaskRow
from app.infra.queue import get_task_queue
from app.models_hub.registry import registry
from app.services.model_service import ModelService
from app.services.task_service import TaskService

_DAILY_WINDOW_DAYS = 14


def _utc_today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _task_date_key(created_at: datetime | None) -> str | None:
    if created_at is None:
        return None
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at.astimezone(timezone.utc).date().isoformat()


class StatsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def overview(self) -> dict[str, Any]:
        study_count = int(self.db.scalar(select(func.count()).select_from(StudyRow)) or 0)
        models = ModelService(self.db).list_models()
        enabled_models = [m for m in models if m["enabled"]]
        model_by_id = {m["id"]: m for m in models}

        today_start = _utc_today_start()

        # Lightweight projection for aggregations (avoid hydrating full ORM graphs).
        task_rows = self.db.execute(
            select(
                TaskRow.model_id,
                TaskRow.status,
                TaskRow.runtime_ms,
                TaskRow.created_at,
            )
        ).all()

        today_tasks = 0
        failed_today = 0
        succeeded_n = 0
        failed_n = 0

        daily_acc: dict[str, dict[str, int]] = {
            (today_start - timedelta(days=i)).date().isoformat(): {
                "total": 0,
                "succeeded": 0,
                "failed": 0,
            }
            for i in range(_DAILY_WINDOW_DAYS - 1, -1, -1)
        }

        usage_acc: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"total": 0, "succeeded": 0, "failed": 0, "runtime_sum": 0, "runtime_n": 0}
        )

        for model_id, status, runtime_ms, created_at in task_rows:
            date_key = _task_date_key(created_at)
            if date_key and date_key in daily_acc:
                daily_acc[date_key]["total"] += 1
                if status == TaskStatus.SUCCEEDED.value:
                    daily_acc[date_key]["succeeded"] += 1
                elif status == TaskStatus.FAILED.value:
                    daily_acc[date_key]["failed"] += 1

            if created_at is not None:
                ca = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
                if ca >= today_start:
                    today_tasks += 1
                    if status == TaskStatus.FAILED.value:
                        failed_today += 1

            if status == TaskStatus.SUCCEEDED.value:
                succeeded_n += 1
            elif status == TaskStatus.FAILED.value:
                failed_n += 1

            bucket = usage_acc[model_id]
            bucket["total"] += 1
            if status == TaskStatus.SUCCEEDED.value:
                bucket["succeeded"] += 1
            elif status == TaskStatus.FAILED.value:
                bucket["failed"] += 1
            if runtime_ms is not None:
                bucket["runtime_sum"] += int(runtime_ms)
                bucket["runtime_n"] += 1

        finished = succeeded_n + failed_n
        success_rate = round(succeeded_n / finished, 3) if finished else None

        seg_metrics = [m["metrics"].get("dice", 0) for m in models if m["task_type"] == "segmentation"]
        avg_dice = sum(seg_metrics) / len(seg_metrics) if seg_metrics else 0.0

        distribution = {
            "segmentation": sum(1 for m in models if m["task_type"] == "segmentation"),
            "detection": sum(1 for m in models if m["task_type"] == "detection"),
            "classification": sum(1 for m in models if m["task_type"] == "classification"),
        }

        model_metrics = [
            {
                "id": m["id"],
                "name": m["name"],
                "task_type": m["task_type"],
                "metrics": {k: float(v) for k, v in (m.get("metrics") or {}).items()},
            }
            for m in models
        ]

        daily_tasks = [
            {
                "date": d,
                "total": v["total"],
                "succeeded": v["succeeded"],
                "failed": v["failed"],
            }
            for d, v in daily_acc.items()
        ]

        model_usage: list[dict[str, Any]] = []
        for mid, v in sorted(usage_acc.items(), key=lambda kv: (-kv[1]["total"], kv[0])):
            meta = model_by_id.get(mid) or {}
            avg_rt = (v["runtime_sum"] / v["runtime_n"]) if v["runtime_n"] else None
            model_usage.append(
                {
                    "model_id": mid,
                    "name": meta.get("name") or mid,
                    "task_type": meta.get("task_type") or "unknown",
                    "total": v["total"],
                    "succeeded": v["succeeded"],
                    "failed": v["failed"],
                    "avg_runtime_ms": round(avg_rt, 1) if avg_rt is not None else None,
                }
            )

        recent_tasks, _ = TaskService(self.db).list_tasks(page=1, page_size=8)
        queue_stats = get_task_queue().stats()

        return {
            "kpis": {
                "study_count": study_count,
                "model_count": len(enabled_models),
                "today_tasks": today_tasks,
                "avg_dice": round(avg_dice, 3),
                "success_rate": success_rate,
                "failed_today": failed_today,
            },
            "model_metrics": model_metrics,
            "model_distribution": distribution,
            "daily_tasks": daily_tasks,
            "model_usage": model_usage,
            "recent_tasks": [TaskService(self.db).task_to_dict(t) for t in recent_tasks],
            "queue": {
                "queued": queue_stats.queued,
                "running": queue_stats.running,
                "max_concurrency": queue_stats.max_concurrency,
            },
            "registered_models": len(registry),
        }
