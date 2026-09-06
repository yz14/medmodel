"""Prometheus-compatible metrics endpoint (R12)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.infra.orm import TaskRow
from app.infra.queue import get_task_queue
from app.models_hub.registry import registry

router = APIRouter(tags=["metrics"])


def _esc(label: str) -> str:
    return label.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


@router.get("/metrics")
def prometheus_metrics(db: Session = Depends(db_session)) -> Response:
    """Plain-text Prometheus exposition for hospital ops / Triton-style scraping."""
    lines: list[str] = []
    stats = get_task_queue().stats()

    lines.append("# HELP voxflow_queue_queued Tasks waiting in the in-process queue")
    lines.append("# TYPE voxflow_queue_queued gauge")
    lines.append(f"voxflow_queue_queued {stats.queued}")

    lines.append("# HELP voxflow_queue_running Tasks currently executing")
    lines.append("# TYPE voxflow_queue_running gauge")
    lines.append(f"voxflow_queue_running {stats.running}")

    lines.append("# HELP voxflow_queue_max_concurrency Worker concurrency limit")
    lines.append("# TYPE voxflow_queue_max_concurrency gauge")
    lines.append(f"voxflow_queue_max_concurrency {stats.max_concurrency}")

    lines.append("# HELP voxflow_models_registered Registered model plugins")
    lines.append("# TYPE voxflow_models_registered gauge")
    lines.append(f"voxflow_models_registered {len(registry)}")

    lines.append("# HELP voxflow_tasks_total Tasks by status")
    lines.append("# TYPE voxflow_tasks_total gauge")
    status_rows = db.execute(
        select(TaskRow.status, func.count()).group_by(TaskRow.status)
    ).all()
    seen_status = {str(s) for s, _ in status_rows}
    for status, count in status_rows:
        lines.append(f'voxflow_tasks_total{{status="{_esc(str(status))}"}} {int(count)}')
    for status in ("queued", "running", "succeeded", "failed", "canceled"):
        if status not in seen_status:
            lines.append(f'voxflow_tasks_total{{status="{status}"}} 0')

    lines.append("# HELP voxflow_task_failures_total Failed tasks by model")
    lines.append("# TYPE voxflow_task_failures_total gauge")
    fail_rows = db.execute(
        select(TaskRow.model_id, func.count())
        .where(TaskRow.status == "failed")
        .group_by(TaskRow.model_id)
    ).all()
    if fail_rows:
        for model_id, count in fail_rows:
            lines.append(
                f'voxflow_task_failures_total{{model_id="{_esc(str(model_id))}"}} {int(count)}'
            )
    else:
        lines.append('voxflow_task_failures_total{model_id=""} 0')

    lines.append("# HELP voxflow_task_runtime_ms_sum Succeeded task runtime sum by model")
    lines.append("# TYPE voxflow_task_runtime_ms_sum gauge")
    lines.append("# HELP voxflow_task_runtime_ms_count Succeeded task count by model")
    lines.append("# TYPE voxflow_task_runtime_ms_count gauge")
    runtime_rows = db.execute(
        select(
            TaskRow.model_id,
            func.coalesce(func.sum(TaskRow.runtime_ms), 0),
            func.count(),
        )
        .where(TaskRow.status == "succeeded", TaskRow.cache_hit.is_(False))
        .group_by(TaskRow.model_id)
    ).all()
    if runtime_rows:
        for model_id, total_ms, count in runtime_rows:
            mid = _esc(str(model_id))
            lines.append(f'voxflow_task_runtime_ms_sum{{model_id="{mid}"}} {int(total_ms)}')
            lines.append(f'voxflow_task_runtime_ms_count{{model_id="{mid}"}} {int(count)}')
    else:
        lines.append('voxflow_task_runtime_ms_sum{model_id=""} 0')
        lines.append('voxflow_task_runtime_ms_count{model_id=""} 0')

    body = "\n".join(lines) + "\n"
    return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")
