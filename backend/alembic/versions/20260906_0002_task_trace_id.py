"""Add tasks.trace_id for request→worker correlation (R12).

Revision ID: 20260906_0002
Revises: 20260905_0001
Create Date: 2026-09-06

Idempotent: ORM create_all may already have created the column on fresh DBs.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260906_0002"
down_revision: Union[str, None] = "20260905_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns(table)}
    return column in cols


def _has_index(table: str, name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return any(ix.get("name") == name for ix in insp.get_indexes(table))


def upgrade() -> None:
    if not _has_column("tasks", "trace_id"):
        with op.batch_alter_table("tasks") as batch:
            batch.add_column(sa.Column("trace_id", sa.String(length=64), nullable=True))
    if not _has_index("tasks", "ix_tasks_trace_id"):
        op.create_index("ix_tasks_trace_id", "tasks", ["trace_id"], unique=False)


def downgrade() -> None:
    if _has_index("tasks", "ix_tasks_trace_id"):
        op.drop_index("ix_tasks_trace_id", table_name="tasks")
    if _has_column("tasks", "trace_id"):
        with op.batch_alter_table("tasks") as batch:
            batch.drop_column("trace_id")
