"""Generate a small CT ZIP for Playwright upload smoke (not committed)."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from datetime import datetime, timezone

from pydicom.uid import generate_uid

from app.imaging.dicom_io import write_synthetic_dicom_series

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "frontend" / "e2e" / "fixtures"
ZIP_STEM = OUT_DIR / "chest-mini"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("chest-mini*"):
        if old.is_file():
            old.unlink()
        elif old.is_dir():
            shutil.rmtree(old, ignore_errors=True)

    stamp = datetime.now(timezone.utc).strftime("%H%M%S")
    patient_id = f"E2E-{stamp}"

    tmp = Path(tempfile.mkdtemp(prefix="voxflow_e2e_"))
    try:
        write_synthetic_dicom_series(
            tmp,
            study_uid=str(generate_uid()),
            series_uid=str(generate_uid()),
            num_slices=8,
            rows=64,
            cols=64,
            modality="CT",
            body_part="CHEST",
            patient_name="E2E^Upload",
            patient_id=patient_id,
            series_description="E2E Mini Chest CT",
            study_description="VoxFlow E2E Upload Fixture",
            seed=99,
            anatomy="chest",
        )
        archive = shutil.make_archive(str(ZIP_STEM), "zip", root_dir=tmp)
        marker = OUT_DIR / "chest-mini.patient_id"
        marker.write_text(patient_id, encoding="utf-8")
        print(f"wrote {archive} patient_id={patient_id}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
