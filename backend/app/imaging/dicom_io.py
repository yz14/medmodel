from __future__ import annotations

import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

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
    slice_position: float | None
    institution: str | None
    source_path: Path


def _safe_str(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_int(value: object | None, default: int = 1) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_spacing(ds: Dataset) -> tuple[float, float, float] | None:
    try:
        pixel_spacing = getattr(ds, "PixelSpacing", None)
        thickness = float(getattr(ds, "SliceThickness", 1.0) or 1.0)
        if pixel_spacing is not None and len(pixel_spacing) >= 2:
            return (thickness, float(pixel_spacing[0]), float(pixel_spacing[1]))
    except Exception:  # noqa: BLE001
        return None
    return None


def slice_position_from_ds(ds: Dataset) -> float | None:
    """Project ImagePositionPatient onto the slice normal (IOP row × col).

    Falls back to IPP[2] when orientation is missing. Returns None when IPP absent.
    """
    ipp = getattr(ds, "ImagePositionPatient", None)
    if ipp is None:
        return None
    try:
        pos = np.asarray([float(ipp[0]), float(ipp[1]), float(ipp[2])], dtype=np.float64)
    except (TypeError, ValueError, IndexError):
        return None

    iop = getattr(ds, "ImageOrientationPatient", None)
    if iop is not None:
        try:
            row = np.asarray([float(iop[0]), float(iop[1]), float(iop[2])], dtype=np.float64)
            col = np.asarray([float(iop[3]), float(iop[4]), float(iop[5])], dtype=np.float64)
            normal = np.cross(row, col)
            norm = float(np.linalg.norm(normal))
            if norm > 1e-6:
                return float(np.dot(pos, normal / norm))
        except (TypeError, ValueError, IndexError):
            pass
    return float(pos[2])


def spatial_sort_key(
    *,
    slice_position: float | None,
    instance_number: int,
    sop_uid: str,
) -> tuple[int, float, int, str]:
    """Stable order: IPP projection → InstanceNumber → SOP UID."""
    if slice_position is not None:
        return (0, float(slice_position), int(instance_number), sop_uid)
    return (1, 0.0, int(instance_number), sop_uid)


def sort_parsed_instances(items: list[ParsedInstance]) -> list[ParsedInstance]:
    return sorted(
        items,
        key=lambda x: spatial_sort_key(
            slice_position=x.slice_position,
            instance_number=x.instance_number,
            sop_uid=x.sop_uid,
        ),
    )


def sort_dicom_paths_spatially(paths: list[Path]) -> list[Path]:
    """Order DICOM files by IPP projection (then InstanceNumber, SOP UID)."""
    keyed: list[tuple[tuple[int, float, int, str], Path]] = []
    for path in paths:
        try:
            ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
            pos = slice_position_from_ds(ds)
            inst = _safe_int(getattr(ds, "InstanceNumber", None), 0)
            sop = str(getattr(ds, "SOPInstanceUID", path.name))
        except Exception:  # noqa: BLE001
            pos, inst, sop = None, 0, path.name
        keyed.append((spatial_sort_key(slice_position=pos, instance_number=inst, sop_uid=sop), path))
    keyed.sort(key=lambda x: x[0])
    return [p for _, p in keyed]


def parse_dicom_file(path: Path) -> ParsedInstance | None:
    try:
        ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
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
    rows = _safe_int(getattr(ds, "Rows", None), 512)
    cols = _safe_int(getattr(ds, "Columns", None), 512)
    instance_number = _safe_int(getattr(ds, "InstanceNumber", None), 1)
    series_number_raw = getattr(ds, "SeriesNumber", None)
    series_number_i = _safe_int(series_number_raw, 0) if series_number_raw is not None else None

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
        slice_position=slice_position_from_ds(ds),
        institution=_safe_str(getattr(ds, "InstitutionName", None)),
        source_path=path,
    )


def collect_dicom_files(
    source: Path,
    *,
    max_uncompressed_bytes: int | None = None,
) -> tuple[list[Path], list[Path]]:
    """
    Collect DICOM paths under source.
    Returns (files, temp_dirs) — caller must rmtree each temp_dir when done.
    """
    temp_dirs: list[Path] = []
    if source.is_file():
        if source.suffix.lower() == ".zip":
            tmp, files = _extract_zip_dicoms(source, max_uncompressed_bytes=max_uncompressed_bytes)
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
            tmp, nested = _extract_zip_dicoms(path, max_uncompressed_bytes=max_uncompressed_bytes)
            temp_dirs.append(tmp)
            dicoms.extend(nested)
    return dicoms, temp_dirs


def _looks_like_dicom(path: Path) -> bool:
    """True if Part-10 preamble present, or force-read yields a Dataset with SOP Class."""
    try:
        with path.open("rb") as fh:
            preamble = fh.read(132)
        if len(preamble) >= 132 and preamble[128:132] == b"DICM":
            return True
    except Exception:  # noqa: BLE001
        return False
    # No preamble: still accept many legal DICOM files (N-B10)
    try:
        ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        return bool(getattr(ds, "SOPClassUID", None) or getattr(ds, "SOPInstanceUID", None))
    except Exception:  # noqa: BLE001
        return False


def _extract_zip_dicoms(
    zip_path: Path,
    *,
    max_uncompressed_bytes: int | None = None,
) -> tuple[Path, list[Path]]:
    """Extract ZIP safely (zip-slip + zip-bomb resistant). Returns (tmp_root, dicom_files)."""
    from app.infra.config import get_settings

    budget = max_uncompressed_bytes if max_uncompressed_bytes is not None else get_settings().max_upload_bytes
    tmp = Path(tempfile.mkdtemp(prefix="voxflow_zip_"))
    written_total = 0
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for info in zf.infolist():
                name = info.filename.replace("\\", "/")
                if not name or name.endswith("/"):
                    continue
                if name.startswith("/") or re.match(r"^[A-Za-z]:", name) or ".." in Path(name).parts:
                    raise ValueError(f"ZIP 路径不安全: {name}")
                # Declared uncompressed size (may lie — also meter while copying)
                declared = int(info.file_size or 0)
                if declared < 0:
                    raise ValueError(f"ZIP 条目大小非法: {name}")
                if written_total + declared > budget:
                    raise ValueError(
                        f"ZIP 解压后体积超过限制（最多 {budget} 字节）"
                    )
                target = (tmp / name).resolve()
                try:
                    target.relative_to(tmp.resolve())
                except ValueError as exc:
                    raise ValueError(f"ZIP 路径不安全: {name}") from exc
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, target.open("wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        written_total += len(chunk)
                        if written_total > budget:
                            raise ValueError(
                                f"ZIP 解压后体积超过限制（最多 {budget} 字节）"
                            )
                        dst.write(chunk)
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
    """Stack spatially-sorted slices via shared pixel decoder (TODO-1 #2/#4)."""
    from app.imaging.pixel_decode import PixelDecodeError, decode_dicom_file

    series_dir = Path(series_path)
    files = sort_dicom_paths_spatially(list_series_dicom_files(series_dir))
    if not files:
        return None

    slices: list[np.ndarray] = []
    shapes: set[tuple[int, int]] = set()
    seen_sops: set[str] = set()
    for path in files:
        try:
            # Dedup by SOP when reading headers cheaply
            ds_meta = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
            sop = str(getattr(ds_meta, "SOPInstanceUID", path.name))
            if sop in seen_sops:
                continue
            seen_sops.add(sop)
            decoded = decode_dicom_file(path)
        except PixelDecodeError as exc:
            logger.warning("pixel_decode_failed", path=str(path), error=str(exc))
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("pixel_read_failed", path=str(path), error=str(exc))
            return None
        shapes.add((decoded.rows, decoded.cols))
        if len(shapes) > 1:
            logger.warning("pixel_shape_mismatch", path=str(path), shapes=[list(s) for s in shapes])
            return None
        slices.append(decoded.pixels)
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
    study_description: str = "VoxFlow Demo Study",
    seed: int = 7,
    anatomy: str = "chest",
) -> tuple[list[Path], dict]:
    """Generate a synthetic DICOM series.

    anatomy:
      - chest: CT chest with lungs, spine, trachea, vessels, planted nodules
      - head: CT head (soft tissue + bone ring)
      - brain_mr: MR-like brain phantom
      - chest_dr: single-slice projection-like chest

    Returns (paths, meta) where meta may include planted nodules for fake models.
    """
    import json

    output_dir.mkdir(parents=True, exist_ok=True)
    study_uid = study_uid or generate_uid()
    series_uid = series_uid or generate_uid()
    frame_of_ref_uid = generate_uid()
    rng = np.random.default_rng(seed)

    if anatomy == "chest_dr":
        num_slices = 1

    volume, meta = _build_phantom_volume(
        anatomy=anatomy,
        num_slices=num_slices,
        rows=rows,
        cols=cols,
        rng=rng,
    )

    sop_class = {
        "CT": "1.2.840.10008.5.1.4.1.1.2",
        "MR": "1.2.840.10008.5.1.4.1.1.4",
        "DX": "1.2.840.10008.5.1.4.1.1.1.1",
        "CR": "1.2.840.10008.5.1.4.1.1.1",
        "DR": "1.2.840.10008.5.1.4.1.1.1.1",
    }.get(modality.upper(), "1.2.840.10008.5.1.4.1.1.2")

    paths: list[Path] = []
    for idx in range(volume.shape[0]):
        sop_uid = generate_uid()
        file_meta = Dataset()
        file_meta.MediaStorageSOPClassUID = sop_class
        file_meta.MediaStorageSOPInstanceUID = sop_uid
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        file_meta.ImplementationClassUID = generate_uid()

        path = output_dir / f"{idx:04d}_{sop_uid[-8:]}.dcm"
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
        ds.StudyDescription = study_description
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
        ds.SliceThickness = 1.25 if modality.upper() != "DR" else 0.0
        ds.PixelSpacing = [1.0, 1.0]
        ds.ImagePositionPatient = [0.0, 0.0, float(idx * 1.25)]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.FrameOfReferenceUID = frame_of_ref_uid
        ds.PositionReferenceIndicator = ""
        ds.InstitutionName = "VoxFlow Demo Hospital"

        lo, hi = (-1024, 3071) if modality.upper() == "CT" else (0, 4095)
        pixels = np.clip(volume[idx], lo, hi).astype(np.int16)
        ds.PixelData = pixels.tobytes()
        ds.save_as(str(path), enforce_file_format=True)
        paths.append(path)

    meta_path = output_dir / "phantom_meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return paths, meta


def _build_phantom_volume(
    *,
    anatomy: str,
    num_slices: int,
    rows: int,
    cols: int,
    rng: np.random.Generator,
) -> tuple[np.ndarray, dict]:
    zz, yy, xx = np.indices((num_slices, rows, cols), dtype=np.float32)
    cy, cx = rows / 2.0, cols / 2.0
    meta: dict = {"anatomy": anatomy, "nodules": []}

    if anatomy == "chest":
        body = ((yy - cy) / (rows * 0.45)) ** 2 + ((xx - cx) / (cols * 0.40)) ** 2 <= 1.0
        volume = np.full((num_slices, rows, cols), -1000.0, dtype=np.float32)
        soft_hu = np.clip(rng.normal(30, 25, size=volume.shape), -80, 120)
        volume[body] = soft_hu[body]
        # Lungs strictly inside body (avoid opening cavities to outside air)
        left = ((yy - cy) / (rows * 0.26)) ** 2 + ((xx - (cx - cols * 0.16)) / (cols * 0.15)) ** 2 + (
            (zz - num_slices / 2) / (num_slices * 0.38)
        ) ** 2 <= 1.0
        right = ((yy - cy) / (rows * 0.26)) ** 2 + ((xx - (cx + cols * 0.16)) / (cols * 0.15)) ** 2 + (
            (zz - num_slices / 2) / (num_slices * 0.38)
        ) ** 2 <= 1.0
        # Keep lungs strictly inside soft tissue (1-voxel collar) so cavities seal for fill_holes
        from scipy import ndimage as _ndimage

        body_inner = _ndimage.binary_erosion(body, iterations=1)
        lungs = (left | right) & body_inner
        volume[lungs] = np.clip(rng.normal(-700, 60, size=volume.shape), -950, -450)[lungs]

        # Spine (posterior high-HU disk)
        spine = ((yy - (cy + rows * 0.22)) / (rows * 0.08)) ** 2 + ((xx - cx) / (cols * 0.07)) ** 2 <= 1.0
        volume[body & spine] = rng.normal(400, 50, size=volume.shape)[body & spine]

        # Trachea: mediastinal air tube with soft-tissue collar — must NOT touch lungs,
        # or cavities connect to outside via the superior face and fill_holes fails.
        lung_keepout = _ndimage.binary_dilation(lungs, iterations=2)
        trachea = (
            ((yy - cy) / (rows * 0.025)) ** 2 + ((xx - cx) / (cols * 0.025)) ** 2 <= 1.0
        ) & (zz >= 2) & (zz < num_slices * 0.40) & body & ~lung_keepout
        volume[trachea] = -1000.0

        # Bed plate
        bed = (yy > rows * 0.88) & (np.abs(xx - cx) < cols * 0.4)
        volume[bed] = rng.normal(100, 20, size=volume.shape)[bed]

        # Vessel-like tubes in lung (+50 HU)
        for _ in range(6):
            vz = float(rng.uniform(num_slices * 0.25, num_slices * 0.75))
            vy = float(rng.uniform(cy - rows * 0.15, cy + rows * 0.15))
            vx = float(rng.uniform(cx - cols * 0.22, cx + cols * 0.22))
            tube = ((zz - vz) / 8.0) ** 2 + ((yy - vy) / 2.2) ** 2 + ((xx - vx) / 2.2) ** 2 <= 1.0
            volume[tube & lungs] = rng.normal(50, 15, size=volume.shape)[tube & lungs]

        # Planted nodules inside lungs (visible to det/seg)
        planted: list[dict] = []
        candidates = np.argwhere(lungs)
        if len(candidates) > 0:
            n_nod = int(rng.integers(2, 4))
            picks = candidates[rng.choice(len(candidates), size=min(n_nod, len(candidates)), replace=False)]
            for p in picks:
                cz, cy_i, cx_i = (int(p[0]), int(p[1]), int(p[2]))
                diameter = float(rng.uniform(8.0, 16.0))
                rad = max(diameter / 2.0, 3.0)
                blob = ((zz - cz) / (rad * 0.6)) ** 2 + ((yy - cy_i) / rad) ** 2 + ((xx - cx_i) / rad) ** 2 <= 1.0
                volume[blob & lungs] = rng.normal(30, 20, size=volume.shape)[blob & lungs]
                planted.append({"z": cz, "y": cy_i, "x": cx_i, "diameter_mm": round(diameter, 1)})
        meta["nodules"] = planted
        return volume, meta

    if anatomy == "head":
        volume = np.full((num_slices, rows, cols), -1000.0, dtype=np.float32)
        skull = ((yy - cy) / (rows * 0.38)) ** 2 + ((xx - cx) / (cols * 0.32)) ** 2 + (
            (zz - num_slices / 2) / (num_slices * 0.42)
        ) ** 2
        brain = skull <= 0.85
        bone = (skull <= 1.0) & (skull > 0.85)
        volume[brain] = rng.normal(35, 12, size=volume.shape)[brain]
        volume[bone] = rng.normal(800, 60, size=volume.shape)[bone]
        return volume, meta

    if anatomy == "brain_mr":
        # MR-like intensities (arbitrary units, non-negative)
        volume = np.zeros((num_slices, rows, cols), dtype=np.float32)
        brain = ((yy - cy) / (rows * 0.36)) ** 2 + ((xx - cx) / (cols * 0.3)) ** 2 + (
            (zz - num_slices / 2) / (num_slices * 0.4)
        ) ** 2 <= 1.0
        volume[brain] = rng.normal(600, 80, size=volume.shape)[brain]
        ventricles = ((yy - cy) / (rows * 0.08)) ** 2 + ((xx - cx) / (cols * 0.06)) ** 2 + (
            (zz - num_slices / 2) / (num_slices * 0.15)
        ) ** 2 <= 1.0
        volume[ventricles] = rng.normal(200, 30, size=volume.shape)[ventricles]
        return volume, meta

    if anatomy == "chest_dr":
        # Single projection-ish chest silhouette
        volume = np.full((1, rows, cols), 200.0, dtype=np.float32)
        body = ((yy[0] - cy) / (rows * 0.45)) ** 2 + ((xx[0] - cx) / (cols * 0.38)) ** 2 <= 1.0
        volume[0][body] = rng.normal(900, 40, size=(rows, cols))[body]
        lungs2d = (
            ((yy[0] - cy) / (rows * 0.28)) ** 2 + ((xx[0] - (cx - cols * 0.16)) / (cols * 0.16)) ** 2 <= 1.0
        ) | (((yy[0] - cy) / (rows * 0.28)) ** 2 + ((xx[0] - (cx + cols * 0.16)) / (cols * 0.16)) ** 2 <= 1.0)
        volume[0][lungs2d] = rng.normal(400, 30, size=(rows, cols))[lungs2d]
        return volume, meta

    # Fallback: noise volume
    volume = rng.normal(-200, 180, size=(num_slices, rows, cols)).astype(np.float32)
    return volume, meta


def cleanup_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)

