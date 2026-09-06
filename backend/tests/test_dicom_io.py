"""Unit tests for DICOM IO helpers (N-B10)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

from app.imaging.dicom_io import _looks_like_dicom, write_synthetic_dicom_series


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
