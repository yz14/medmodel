from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.imaging.dicom_io import (
    collect_dicom_files,
    parse_dicom_file,
    read_series_volume,
    write_synthetic_dicom_series,
    write_thumbnail_from_volume,
)
from app.infra.logging import get_logger
from app.infra.orm import InstanceRow, SeriesRow, StudyRow
from app.infra.storage import StorageService

logger = get_logger(__name__)


class StudyService:
    def __init__(self, db: Session, storage: StorageService | None = None) -> None:
        self.db = db
        self.storage = storage or StorageService()

    def list_studies(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        modality: str | None = None,
        body_part: str | None = None,
        q: str | None = None,
    ) -> tuple[list[StudyRow], int]:
        stmt = select(StudyRow)
        count_stmt = select(func.count()).select_from(StudyRow)
        if modality:
            stmt = stmt.where(StudyRow.modality == modality)
            count_stmt = count_stmt.where(StudyRow.modality == modality)
        if body_part:
            stmt = stmt.where(StudyRow.body_part == body_part)
            count_stmt = count_stmt.where(StudyRow.body_part == body_part)
        if q:
            like = f"%{q}%"
            filt = or_(
                StudyRow.patient_name.ilike(like),
                StudyRow.patient_id.ilike(like),
                StudyRow.study_uid.ilike(like),
                StudyRow.study_description.ilike(like),
            )
            stmt = stmt.where(filt)
            count_stmt = count_stmt.where(filt)
        total = int(self.db.scalar(count_stmt) or 0)
        rows = self.db.scalars(
            stmt.order_by(StudyRow.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        ).all()
        return list(rows), total

    def get_study(self, study_uid: str) -> StudyRow | None:
        return self.db.scalar(select(StudyRow).where(StudyRow.study_uid == study_uid))

    def get_series(self, series_uid: str) -> SeriesRow | None:
        return self.db.scalar(select(SeriesRow).where(SeriesRow.series_uid == series_uid))

    def list_instances(self, series_uid: str) -> list[InstanceRow]:
        return list(
            self.db.scalars(
                select(InstanceRow)
                .where(InstanceRow.series_uid == series_uid)
                .order_by(InstanceRow.instance_number.asc())
            ).all()
        )

    def upload(self, files: list[tuple[str, bytes]]) -> list[StudyRow]:
        """Accept uploaded file bytes [(filename, content)] and ingest DICOM/ZIP."""
        tmp_root = Path(tempfile.mkdtemp(prefix="voxflow_upload_"))
        try:
            for name, content in files:
                dest = tmp_root / Path(name).name
                dest.write_bytes(content)
            return self.ingest_path(tmp_root)
        finally:
            shutil.rmtree(tmp_root, ignore_errors=True)

    def ingest_path(self, source: Path) -> list[StudyRow]:
        dicom_files, temp_dirs = collect_dicom_files(source)
        try:
            if not dicom_files:
                raise ValueError("未找到可解析的 DICOM 文件")

            parsed = []
            for path in dicom_files:
                item = parse_dicom_file(path)
                if item is not None:
                    parsed.append(item)
            if not parsed:
                raise ValueError("DICOM 解析失败")

            by_study: dict[str, list] = {}
            for item in parsed:
                by_study.setdefault(item.study_uid, []).append(item)

            studies: list[StudyRow] = []
            for study_uid, items in by_study.items():
                studies.append(self._upsert_study(study_uid, items))
            self.db.flush()
            return studies
        finally:
            for tmp in temp_dirs:
                shutil.rmtree(tmp, ignore_errors=True)

    def _upsert_study(self, study_uid: str, items: list) -> StudyRow:
        first = items[0]
        study = self.get_study(study_uid)
        if study is None:
            study = StudyRow(
                study_uid=study_uid,
                patient_id=first.patient_id,
                patient_name=first.patient_name,
                patient_sex=first.patient_sex,
                patient_age=first.patient_age,
                study_date=first.study_date,
                study_description=first.study_description,
                modality=first.modality,
                body_part=first.body_part,
                institution=first.institution,
            )
            self.db.add(study)
            self.db.flush()

        by_series: dict[str, list] = {}
        for item in items:
            by_series.setdefault(item.series_uid, []).append(item)

        total_instances = 0
        for series_uid, series_items in by_series.items():
            series_items.sort(key=lambda x: x.instance_number)
            series_dir = self.storage.series_dir(study_uid, series_uid)
            existing = self.get_series(series_uid)
            if existing is None:
                sample = series_items[0]
                spacing = sample.spacing
                existing = SeriesRow(
                    series_uid=series_uid,
                    study_uid=study_uid,
                    modality=sample.modality,
                    body_part=sample.body_part,
                    description=sample.series_description,
                    series_number=sample.series_number,
                    rows=sample.rows,
                    cols=sample.cols,
                    num_instances=0,
                    spacing_x=spacing[2] if spacing else None,
                    spacing_y=spacing[1] if spacing else None,
                    spacing_z=spacing[0] if spacing else None,
                    storage_path=str(series_dir),
                )
                self.db.add(existing)
                self.db.flush()

            for item in series_items:
                dest = series_dir / f"{item.instance_number:04d}_{item.sop_uid[-8:]}.dcm"
                dest.parent.mkdir(parents=True, exist_ok=True)
                # Avoid copying a file onto itself (demo previously wrote into series_dir then ingested).
                src = item.source_path.resolve()
                if src != dest.resolve():
                    if not dest.exists():
                        shutil.copy2(item.source_path, dest)
                elif not dest.exists():
                    # source already is dest path but missing — should not happen
                    raise FileNotFoundError(str(dest))
                inst = self.db.scalar(select(InstanceRow).where(InstanceRow.sop_uid == item.sop_uid))
                if inst is None:
                    self.db.add(
                        InstanceRow(
                            sop_uid=item.sop_uid,
                            series_uid=series_uid,
                            instance_number=item.instance_number,
                            file_path=str(dest),
                            rows=item.rows,
                            cols=item.cols,
                        )
                    )
            self.db.flush()
            existing.num_instances = len(
                self.db.scalars(select(InstanceRow).where(InstanceRow.series_uid == series_uid)).all()
            )
            total_instances += existing.num_instances

            # Remove leftover synthetic IMG*.dcm if ingested copies exist (legacy cleanup).
            ingested = list(series_dir.glob("[0-9][0-9][0-9][0-9]_*.dcm"))
            if ingested:
                for leftover in series_dir.glob("IMG*.dcm"):
                    leftover.unlink(missing_ok=True)

            # thumbnail
            volume = read_series_volume(series_dir)
            if volume is not None:
                thumb = series_dir / "thumb.png"
                write_thumbnail_from_volume(volume, thumb)
                existing.thumbnail_path = str(thumb)

        study.num_series = len(
            self.db.scalars(select(SeriesRow).where(SeriesRow.study_uid == study_uid)).all()
        )
        study.num_instances = total_instances
        # refresh modality/body from first series if empty
        if not study.modality:
            study.modality = first.modality
        if not study.body_part:
            study.body_part = first.body_part
        self.db.flush()
        return study

    def ensure_demo_data(self) -> StudyRow:
        existing = self.db.scalar(select(StudyRow).limit(1))
        if existing is not None:
            return existing

        from pydicom.uid import generate_uid

        study_uid = str(generate_uid())
        series_uid = str(generate_uid())
        # Write synthetic series to a temp dir, then ingest into storage (avoids duplicate files).
        tmp = Path(tempfile.mkdtemp(prefix="voxflow_demo_"))
        try:
            write_synthetic_dicom_series(
                tmp,
                study_uid=study_uid,
                series_uid=series_uid,
                num_slices=40,
                rows=256,
                cols=256,
                patient_name="Zhang^Wei",
                patient_id="P10086",
                series_description="Demo Chest CT",
                seed=11,
            )
            studies = self.ingest_path(tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        logger.info("demo_data_seeded", study_uid=studies[0].study_uid)
        return studies[0]

    def study_to_dict(self, study: StudyRow, include_series: bool = True) -> dict[str, Any]:
        data: dict[str, Any] = {
            "study_uid": study.study_uid,
            "patient_id": study.patient_id,
            "patient_name": study.patient_name,
            "patient_sex": study.patient_sex,
            "patient_age": study.patient_age,
            "study_date": study.study_date,
            "study_description": study.study_description,
            "modality": study.modality,
            "body_part": study.body_part,
            "institution": study.institution,
            "num_series": study.num_series,
            "num_instances": study.num_instances,
            "created_at": study.created_at.isoformat() if study.created_at else None,
        }
        if include_series:
            data["series"] = [self.series_to_dict(s) for s in study.series]
        return data

    def series_to_dict(self, series: SeriesRow) -> dict[str, Any]:
        return {
            "series_uid": series.series_uid,
            "study_uid": series.study_uid,
            "modality": series.modality,
            "body_part": series.body_part,
            "description": series.description,
            "series_number": series.series_number,
            "rows": series.rows,
            "cols": series.cols,
            "num_instances": series.num_instances,
            "spacing": [series.spacing_z, series.spacing_y, series.spacing_x],
            "thumbnail_url": f"/api/v1/series/{series.series_uid}/thumbnail",
            "created_at": series.created_at.isoformat() if series.created_at else None,
        }

