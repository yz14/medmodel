from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infra.db import Base


class StudyRow(Base):
    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    patient_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    patient_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    patient_sex: Mapped[str | None] = mapped_column(String(8), nullable=True)
    patient_age: Mapped[str | None] = mapped_column(String(16), nullable=True)
    study_date: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    study_description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    modality: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    body_part: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    institution: Mapped[str | None] = mapped_column(String(128), nullable=True)
    num_series: Mapped[int] = mapped_column(Integer, default=0)
    num_instances: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    series: Mapped[list[SeriesRow]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )


class SeriesRow(Base):
    __tablename__ = "series"
    __table_args__ = (UniqueConstraint("series_uid", name="uq_series_uid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    series_uid: Mapped[str] = mapped_column(String(128), index=True)
    study_uid: Mapped[str] = mapped_column(ForeignKey("studies.study_uid", ondelete="CASCADE"), index=True)
    modality: Mapped[str] = mapped_column(String(16), index=True)
    body_part: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    series_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rows: Mapped[int] = mapped_column(Integer, default=512)
    cols: Mapped[int] = mapped_column(Integer, default=512)
    num_instances: Mapped[int] = mapped_column(Integer, default=0)
    spacing_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    spacing_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    spacing_z: Mapped[float | None] = mapped_column(Float, nullable=True)
    storage_path: Mapped[str] = mapped_column(String(512))
    thumbnail_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    study: Mapped[StudyRow] = relationship(back_populates="series")
    instances: Mapped[list[InstanceRow]] = relationship(
        back_populates="series", cascade="all, delete-orphan", lazy="selectin", order_by="InstanceRow.instance_number"
    )


class InstanceRow(Base):
    __tablename__ = "instances"
    __table_args__ = (UniqueConstraint("sop_uid", name="uq_sop_uid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sop_uid: Mapped[str] = mapped_column(String(128), index=True)
    series_uid: Mapped[str] = mapped_column(ForeignKey("series.series_uid", ondelete="CASCADE"), index=True)
    instance_number: Mapped[int] = mapped_column(Integer, default=1)
    file_path: Mapped[str] = mapped_column(String(512))
    rows: Mapped[int] = mapped_column(Integer, default=512)
    cols: Mapped[int] = mapped_column(Integer, default=512)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    series: Mapped[SeriesRow] = relationship(back_populates="instances")


class ModelStateRow(Base):
    """Persisted overrides for plugin-registered models (enable/default params)."""

    __tablename__ = "model_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    default_params: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TaskRow(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        # Prevent duplicate in-flight work for the same (series, model, params).
        Index(
            "uq_task_inflight",
            "series_uid",
            "model_id",
            "params_hash",
            unique=True,
            sqlite_where=text("status IN ('queued', 'running')"),
            postgresql_where=text("status IN ('queued', 'running')"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    series_uid: Mapped[str] = mapped_column(String(128), index=True)
    study_uid: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    model_id: Mapped[str] = mapped_column(String(64), index=True)
    model_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    params_hash: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="queued")
    stage: Mapped[str] = mapped_column(String(32), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    result_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_traceback: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_dir: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    cached_from: Mapped[str | None] = mapped_column(String(64), nullable=True)
    runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stage_timings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    logs: Mapped[list[TaskLogRow]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin", order_by="TaskLogRow.id"
    )
    artifacts: Mapped[list[ArtifactRow]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )


class TaskLogRow(Base):
    __tablename__ = "task_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.task_id", ondelete="CASCADE"), index=True)
    level: Mapped[str] = mapped_column(String(16), default="info")
    stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[TaskRow] = relationship(back_populates="logs")


class ArtifactRow(Base):
    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.task_id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    uri: Mapped[str] = mapped_column(String(512))
    media_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[TaskRow] = relationship(back_populates="artifacts")

