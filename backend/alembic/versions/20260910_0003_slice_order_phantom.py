"""Add slice_index/slice_position/is_phantom; backfill spatial order (TODO-1 #2/#3).

Revision ID: 20260910_0003
Revises: 20260906_0002
Create Date: 2026-09-10

Idempotent column adds. Backfill reads DICOM IPP when files are present.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260910_0003"
down_revision: Union[str, None] = "20260906_0002"
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
    if not _has_column("series", "is_phantom"):
        with op.batch_alter_table("series") as batch:
            batch.add_column(sa.Column("is_phantom", sa.Boolean(), nullable=False, server_default=sa.false()))

    if not _has_column("instances", "slice_index"):
        with op.batch_alter_table("instances") as batch:
            batch.add_column(sa.Column("slice_index", sa.Integer(), nullable=False, server_default="0"))
    if not _has_column("instances", "slice_position"):
        with op.batch_alter_table("instances") as batch:
            batch.add_column(sa.Column("slice_position", sa.Float(), nullable=True))
    if not _has_index("instances", "ix_instances_slice_index"):
        op.create_index("ix_instances_slice_index", "instances", ["slice_index"], unique=False)

    _backfill_spatial_order()


def _backfill_spatial_order() -> None:
    """Compute IPP projection + stable slice_index; mark phantom series."""
    from app.imaging.dicom_io import slice_position_from_ds, spatial_sort_key

    try:
        import pydicom
    except ImportError:
        return

    conn = op.get_bind()
    series_rows = conn.execute(sa.text("SELECT series_uid, storage_path FROM series")).mappings().all()
    for series in series_rows:
        series_uid = series["series_uid"]
        storage_path = series["storage_path"]
        if storage_path and (Path(storage_path) / "phantom_meta.json").is_file():
            conn.execute(
                sa.text("UPDATE series SET is_phantom = :v WHERE series_uid = :uid"),
                {"v": True, "uid": series_uid},
            )

        inst_rows = (
            conn.execute(
                sa.text(
                    "SELECT id, sop_uid, instance_number, file_path FROM instances WHERE series_uid = :uid"
                ),
                {"uid": series_uid},
            )
            .mappings()
            .all()
        )
        if not inst_rows:
            continue

        keyed: list[tuple[tuple[int, float, int, str], int, float | None]] = []
        for row in inst_rows:
            pos: float | None = None
            path = Path(row["file_path"]) if row["file_path"] else None
            if path is not None and path.is_file():
                try:
                    ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
                    pos = slice_position_from_ds(ds)
                except Exception:  # noqa: BLE001
                    pos = None
            key = spatial_sort_key(
                slice_position=pos,
                instance_number=int(row["instance_number"] or 0),
                sop_uid=str(row["sop_uid"]),
            )
            keyed.append((key, int(row["id"]), pos))

        keyed.sort(key=lambda x: x[0])
        for slice_index, (_key, row_id, pos) in enumerate(keyed):
            conn.execute(
                sa.text(
                    "UPDATE instances SET slice_index = :si, slice_position = :sp WHERE id = :id"
                ),
                {"si": slice_index, "sp": pos, "id": row_id},
            )


def downgrade() -> None:
    if _has_index("instances", "ix_instances_slice_index"):
        op.drop_index("ix_instances_slice_index", table_name="instances")
    if _has_column("instances", "slice_position"):
        with op.batch_alter_table("instances") as batch:
            batch.drop_column("slice_position")
    if _has_column("instances", "slice_index"):
        with op.batch_alter_table("instances") as batch:
            batch.drop_column("slice_index")
    if _has_column("series", "is_phantom"):
        with op.batch_alter_table("series") as batch:
            batch.drop_column("is_phantom")
