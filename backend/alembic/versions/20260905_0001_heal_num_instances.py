"""Heal stale num_instances + document uq_task_inflight.

Revision ID: 20260905_0001
Revises:
Create Date: 2026-09-05

N-B1: backfill series/study instance counts from instance rows.
The partial unique index uq_task_inflight is created by ORM metadata;
this revision ensures it exists for databases that predate the index.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260905_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Backfill series.num_instances from real instance counts
    conn.execute(
        sa.text(
            """
            UPDATE series
            SET num_instances = (
                SELECT COUNT(*) FROM instances
                WHERE instances.series_uid = series.series_uid
            )
            WHERE num_instances IS NULL
               OR num_instances != (
                    SELECT COUNT(*) FROM instances
                    WHERE instances.series_uid = series.series_uid
               )
            """
        )
    )

    # Recompute study aggregates
    conn.execute(
        sa.text(
            """
            UPDATE studies
            SET
              num_series = (
                SELECT COUNT(*) FROM series WHERE series.study_uid = studies.study_uid
              ),
              num_instances = (
                SELECT COALESCE(SUM(series.num_instances), 0)
                FROM series WHERE series.study_uid = studies.study_uid
              )
            """
        )
    )

    # Ensure partial unique index for in-flight task idempotency (SQLite)
    dialect = conn.dialect.name
    if dialect == "sqlite":
        conn.execute(
            sa.text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_task_inflight
                ON tasks (series_uid, model_id, params_hash)
                WHERE status IN ('queued', 'running')
                """
            )
        )
    elif dialect == "postgresql":
        conn.execute(
            sa.text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_task_inflight
                ON tasks (series_uid, model_id, params_hash)
                WHERE status IN ('queued', 'running')
                """
            )
        )


def downgrade() -> None:
    # Data backfill is not reversible; index drop is optional and unsafe in prod.
    pass
