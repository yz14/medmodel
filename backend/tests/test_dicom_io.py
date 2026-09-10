"""Unit tests for DICOM IO helpers (N-B10)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

from app.imaging.dicom_io import (
    _looks_like_dicom,
    parse_dicom_file,
    read_series_volume,
    sort_dicom_paths_spatially,
    write_synthetic_dicom_series,
)


def _write_no_preamble_dicom(path: Path) -> None:
    """Write a minimal DICOM without Part-10 preamble (no DICM magic)."""
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()

    ds = FileDataset(str(path), {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.Modality = "OT"
    ds.Rows = 8
    ds.Columns = 8
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.PixelData = np.zeros((8, 8), dtype=np.uint16).tobytes()
    # Prefer no Part-10 wrapper so the file lacks DICM magic.
    ds.save_as(str(path), enforce_file_format=False)
    raw = path.read_bytes()
    if len(raw) >= 132 and raw[128:132] == b"DICM":
        path.write_bytes(raw[132:])


def test_looks_like_dicom_with_preamble(tmp_path: Path) -> None:
    out = tmp_path / "chest"
    write_synthetic_dicom_series(out, num_slices=2, seed=1, anatomy="chest")
    files = list(out.glob("*.dcm"))
    assert files
    assert _looks_like_dicom(files[0]) is True


def test_looks_like_dicom_without_preamble(tmp_path: Path) -> None:
    path = tmp_path / "nopreamble.dcm"
    _write_no_preamble_dicom(path)
    raw = path.read_bytes()
    assert not (len(raw) >= 132 and raw[128:132] == b"DICM")
    assert _looks_like_dicom(path) is True


def test_looks_like_dicom_rejects_garbage(tmp_path: Path) -> None:
    path = tmp_path / "noise.bin"
    path.write_bytes(b"not-a-dicom-file" * 20)
    assert _looks_like_dicom(path) is False


def _write_slice(path: Path, *, z: float, instance_number: int, fill: int) -> None:
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()
    ds = FileDataset(str(path), {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.Modality = "CT"
    ds.InstanceNumber = instance_number
    ds.Rows = 4
    ds.Columns = 4
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 1
    ds.RescaleSlope = 1
    ds.RescaleIntercept = 0
    ds.ImagePositionPatient = [0.0, 0.0, z]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.PixelData = (np.full((4, 4), fill, dtype=np.int16)).tobytes()
    ds.save_as(str(path), enforce_file_format=True)


def test_spatial_sort_ignores_misleading_instance_number(tmp_path: Path) -> None:
    """TODO-1 #2: IPP projection wins over InstanceNumber / filename order."""
    a = tmp_path / "zzzz_high.dcm"
    b = tmp_path / "aaaa_low.dcm"
    # Filename/instance suggest reverse order; IPP says b then a
    _write_slice(a, z=10.0, instance_number=1, fill=100)
    _write_slice(b, z=0.0, instance_number=99, fill=200)
    ordered = sort_dicom_paths_spatially([a, b])
    assert ordered == [b, a]
    parsed_a = parse_dicom_file(a)
    parsed_b = parse_dicom_file(b)
    assert parsed_a is not None and parsed_b is not None
    assert parsed_b.slice_position is not None and parsed_a.slice_position is not None
    assert parsed_b.slice_position < parsed_a.slice_position


def test_read_series_volume_follows_ipp(tmp_path: Path) -> None:
    series = tmp_path / "series"
    series.mkdir()
    _write_slice(series / "9999_late.dcm", z=5.0, instance_number=1, fill=11)
    _write_slice(series / "0001_early.dcm", z=0.0, instance_number=50, fill=22)
    vol = read_series_volume(series)
    assert vol is not None
    assert vol.shape[0] == 2
    assert int(vol[0, 0, 0]) == 22
    assert int(vol[1, 0, 0]) == 11
