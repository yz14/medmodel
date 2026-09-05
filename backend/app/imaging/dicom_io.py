from __future__ import annotations

import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
import re

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid
from PIL import Image

from app.infra.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ParsedInstance:
    sop_uid: str
    series_uid: str
    study_uid: str
    patient_id: str | None
    patient_name: str | None
    patient_sex: str | None
    patient_age: str | None
    study_date: str | None
    study_description: str | None
    series_description: str | None
    modality: str
    body_part: str | None
    series_number: int | None
    instance_number: int
    rows: int
    cols: int
    spacing: tuple[float, float, float] | None
    institution: str | None
    source_path: Path


def _safe_str(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _read_spacing(ds: Dataset) -> tuple[float, float, float] | None:
    try:
        pixel_spacing = getattr(ds, "PixelSpacing", None)
        thickness = float(getattr(ds, "SliceThickness", 1.0) or 1.0)
        if pixel_spacing is not None and len(pixel_spacing) >= 2:
            return (thickness, float(pixel_spacing[0]), float(pixel_spacing[1]))
    except Exception:  # noqa: BLE001
        return None
    return None


def parse_dicom_file(path: Path) -> ParsedInstance | None:
    try:
        ds = pydicom.dcmread(str(path), force=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("dicom_read_failed", path=str(path), error=str(exc))
        return None

    if not hasattr(ds, "SOPInstanceUID"):
        return None

    from app.infra.storage import validate_dicom_uid

    try:
        sop_uid = validate_dicom_uid(str(ds.SOPInstanceUID), field="sop_uid")
        series_uid = validate_dicom_uid(
            str(getattr(ds, "SeriesInstanceUID", generate_uid())), field="series_uid"
        )
        study_uid = validate_dicom_uid(
            str(getattr(ds, "StudyInstanceUID", generate_uid())), field="study_uid"
        )
    except ValueError as exc:
        logger.warning("dicom_uid_rejected", path=str(path), error=str(exc))
        return None

    modality = _safe_str(getattr(ds, "Modality", None)) or "OTHER"
    rows = int(getattr(ds, "Rows", 512) or 512)
    cols = int(getattr(ds, "Columns", 512) or 512)
    instance_number = int(getattr(ds, "InstanceNumber", 1) or 1)
    series_number = getattr(ds, "SeriesNumber", None)
    series_number_i = int(series_number) if series_number is not None else None

    return ParsedInstance(
        sop_uid=sop_uid,
        series_uid=series_uid,
        study_uid=study_uid,
        patient_id=_safe_str(getattr(ds, "PatientID", None)),
        patient_name=_safe_str(getattr(ds, "PatientName", None)),
        patient_sex=_safe_str(getattr(ds, "PatientSex", None)),
        patient_age=_safe_str(getattr(ds, "PatientAge", None)),
        study_date=_safe_str(getattr(ds, "StudyDate", None)),
        study_description=_safe_str(getattr(ds, "StudyDescription", None)),
        series_description=_safe_str(getattr(ds, "SeriesDescription", None)),
        modality=modality,
        body_part=_safe_str(getattr(ds, "BodyPartExamined", None)),
        series_number=series_number_i,
        instance_number=instance_number,
        rows=rows,
        cols=cols,
        spacing=_read_spacing(ds),
        institution=_safe_str(getattr(ds, "InstitutionName", None)),
        source_path=path,
    )


def collect_dicom_files(source: Path) -> tuple[list[Path], list[Path]]:
    """
    Collect DICOM paths under source.
    Returns (files, temp_dirs) — caller must rmtree each temp_dir when done.
    """
    temp_dirs: list[Path] = []
    if source.is_file():
        if source.suffix.lower() == ".zip":
            tmp, files = _extract_zip_dicoms(source)
            temp_dirs.append(tmp)
            return files, temp_dirs
        return [source], temp_dirs

    dicoms: list[Path] = []
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in {".dcm", ".dicom"} or _looks_like_dicom(path):
            dicoms.append(path)
        elif path.suffix.lower() == ".zip":
            tmp, nested = _extract_zip_dicoms(path)
            temp_dirs.append(tmp)
            dicoms.extend(nested)
    return dicoms, temp_dirs


def _looks_like_dicom(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            preamble = fh.read(132)
        return len(preamble) >= 132 and preamble[128:132] == b"DICM"
    except Exception:  # noqa: BLE001
        return False


def _extract_zip_dicoms(zip_path: Path) -> tuple[Path, list[Path]]:
    """Extract ZIP safely (zip-slip resistant). Returns (tmp_root, dicom_files)."""
    tmp = Path(tempfile.mkdtemp(prefix="voxflow_zip_"))
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for info in zf.infolist():
                name = info.filename.replace("\\", "/")
                if not name or name.endswith("/"):
                    continue
                if name.startswith("/") or re.match(r"^[A-Za-z]:", name) or ".." in Path(name).parts:
                    raise ValueError(f"ZIP 路径不安全: {name}")
                target = (tmp / name).resolve()
                try:
                    target.relative_to(tmp.resolve())
                except ValueError as exc:
                    raise ValueError(f"ZIP 路径不安全: {name}") from exc
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
        dicoms = [
            p
            for p in tmp.rglob("*")
            if p.is_file() and (p.suffix.lower() in {".dcm", ".dicom"} or _looks_like_dicom(p))
        ]
        return tmp, dicoms
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def list_series_dicom_files(series_dir: Path) -> list[Path]:
    """Prefer ingested `NNNN_*.dcm` names; fall back to any .dcm."""
    series_dir = Path(series_dir)
    if not series_dir.is_dir():
        return []
    ingested = sorted(series_dir.glob("[0-9][0-9][0-9][0-9]_*.dcm"))
    if ingested:
        return ingested
    return sorted(p for p in series_dir.glob("*.dcm") if p.is_file())


def read_series_volume(series_path: str | Path) -> np.ndarray | None:
    series_dir = Path(series_path)
    files = list_series_dicom_files(series_dir)
    if not files:
        return None

    slices: list[np.ndarray] = []
    seen_sops: set[str] = set()
    for path in files:
        try:
            ds = pydicom.dcmread(str(path), force=True)
            sop = str(getattr(ds, "SOPInstanceUID", path.name))
            if sop in seen_sops:
                continue
            seen_sops.add(sop)
            arr = ds.pixel_array.astype(np.float32)
            slope = float(getattr(ds, "RescaleSlope", 1.0) or 1.0)
            intercept = float(getattr(ds, "RescaleIntercept", 0.0) or 0.0)
            arr = arr * slope + intercept
            slices.append(arr)
        except Exception as exc:  # noqa: BLE001
            logger.warning("pixel_read_failed", path=str(path), error=str(exc))
    if not slices:
        return None
    return np.stack(slices, axis=0)


def write_thumbnail_from_volume(volume: np.ndarray, output_path: Path) -> Path:
    mid = volume[volume.shape[0] // 2]
    vmin, vmax = np.percentile(mid, (1, 99))
    if vmax <= vmin:
        vmax = vmin + 1
    norm = np.clip((mid - vmin) / (vmax - vmin), 0, 1)
    img = (norm * 255).astype(np.uint8)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img, mode="L").save(output_path)
    return output_path


def write_synthetic_dicom_series(
    output_dir: Path,
    *,
    study_uid: str | None = None,
    series_uid: str | None = None,
    num_slices: int = 48,
    rows: int = 256,
    cols: int = 256,
    modality: str = "CT",
    body_part: str = "CHEST",
    patient_name: str = "Demo^Patient",
    patient_id: str = "DEMO001",
    series_description: str = "Synthetic Chest CT",
    seed: int = 7,
) -> list[Path]:
    """Generate a fake chest CT-like DICOM series for demo / offline use."""
    output_dir.mkdir(parents=True, exist_ok=True)
    study_uid = study_uid or generate_uid()
    series_uid = series_uid or generate_uid()
    frame_of_ref_uid = generate_uid()
    rng = np.random.default_rng(seed)

    zz, yy, xx = np.indices((num_slices, rows, cols), dtype=np.float32)
    cy, cx = rows / 2, cols / 2
    # Ellipsoid "lungs"
    left = ((yy - cy) / (rows * 0.28)) ** 2 + ((xx - (cx - cols * 0.18)) / (cols * 0.18)) ** 2 + (
        (zz - num_slices / 2) / (num_slices * 0.4)
    ) ** 2 <= 1.0
    right = ((yy - cy) / (rows * 0.28)) ** 2 + ((xx - (cx + cols * 0.18)) / (cols * 0.18)) ** 2 + (
        (zz - num_slices / 2) / (num_slices * 0.4)
    ) ** 2 <= 1.0
    lungs = left | right
    volume = np.full((num_slices, rows, cols), -1000.0, dtype=np.float32)  # air
    volume[~lungs & (yy > rows * 0.15)] = rng.normal(40, 30, size=volume.shape)[~lungs & (yy > rows * 0.15)]
    volume[lungs] = rng.normal(-700, 80, size=volume.shape)[lungs]
    # soft tissue body
    body = ((yy - cy) / (rows * 0.42)) ** 2 + ((xx - cx) / (cols * 0.35)) ** 2 <= 1.0
    volume[~body] = -1000
    volume[body & ~lungs] = rng.normal(30, 40, size=volume.shape)[body & ~lungs]

    paths: list[Path] = []
    for idx in range(num_slices):
        sop_uid = generate_uid()
        file_meta = Dataset()
        file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
        file_meta.MediaStorageSOPInstanceUID = sop_uid
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        file_meta.ImplementationClassUID = generate_uid()

        path = output_dir / f"IMG{idx:04d}.dcm"
        ds = FileDataset(str(path), {}, file_meta=file_meta, preamble=b"\0" * 128)
        ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
        ds.SOPInstanceUID = sop_uid
        ds.StudyInstanceUID = study_uid
        ds.SeriesInstanceUID = series_uid
        ds.Modality = modality
        ds.BodyPartExamined = body_part
        ds.PatientName = patient_name
        ds.PatientID = patient_id
        ds.PatientSex = "O"
        ds.PatientBirthDate = ""
        ds.PatientAge = "045Y"
        ds.AccessionNumber = ""
        ds.StudyID = "DEMO1"
        ds.StudyDate = "20260115"
        ds.StudyDescription = "VoxFlow Demo Study"
        ds.SeriesDescription = series_description
        ds.SeriesNumber = 1
        ds.InstanceNumber = idx + 1
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows = rows
        ds.Columns = cols
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1
        ds.RescaleIntercept = 0
        ds.RescaleSlope = 1
        ds.SliceThickness = 1.25
        ds.PixelSpacing = [1.0, 1.0]
        ds.ImagePositionPatient = [0.0, 0.0, float(idx * 1.25)]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.FrameOfReferenceUID = frame_of_ref_uid
        ds.PositionReferenceIndicator = ""
        ds.InstitutionName = "VoxFlow Demo Hospital"

        pixels = np.clip(volume[idx], -1024, 3071).astype(np.int16)
        ds.PixelData = pixels.tobytes()
        ds.save_as(str(path), enforce_file_format=True)
        paths.append(path)

    return paths


def cleanup_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)

