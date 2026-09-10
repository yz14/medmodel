"""Unit tests for pixel_decode (TODO-1 #4 / #22)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.imaging.pixel_decode import (
    decode_dicom_file,
    spacing_z_from_positions,
)
from app.models_hub.constraints import UnsupportedInputError, check_input_constraints
from app.models_hub.registry import registry
from app.models_hub import load_all_plugins


def _write_mono(
    path: Path,
    *,
    fill: int = 100,
    photometric: str = "MONOCHROME2",
    bits_stored: int = 16,
    high_bit: int = 15,
    slope: object = 1,
    intercept: object = 0,
    z: float = 0.0,
) -> None:
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
    ds.InstanceNumber = 1
    ds.Rows = 4
    ds.Columns = 4
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = photometric
    ds.BitsAllocated = 16
    ds.BitsStored = bits_stored
    ds.HighBit = high_bit
    ds.PixelRepresentation = 0
    ds.RescaleSlope = slope
    ds.RescaleIntercept = intercept
    ds.WindowCenter = "40\\400"
    ds.WindowWidth = "400\\1500"
    ds.ImagePositionPatient = [0.0, 0.0, z]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    raw = np.full((4, 4), fill, dtype=np.uint16)
    if bits_stored < 16 and high_bit == 15:
        # left-aligned stored bits
        shift = 16 - bits_stored
        raw = (raw.astype(np.uint16) << shift).astype(np.uint16)
    ds.PixelData = raw.tobytes()
    ds.save_as(str(path), enforce_file_format=True)


def test_decode_monochrome1_inverts_polarity(tmp_path: Path) -> None:
    path = tmp_path / "m1.dcm"
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
    ds.Rows = 2
    ds.Columns = 2
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME1"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.RescaleSlope = 1
    ds.RescaleIntercept = 0
    # Dark corner (0) vs bright (100) — after MONOCHROME1 invert, 0 becomes brightest
    raw = np.array([[0, 50], [50, 100]], dtype=np.uint16)
    ds.PixelData = raw.tobytes()
    ds.save_as(str(path), enforce_file_format=True)

    decoded = decode_dicom_file(path)
    assert decoded.photometric == "MONOCHROME2"
    assert float(decoded.pixels[0, 0]) > float(decoded.pixels[1, 1])


def test_decode_multivalue_ds_and_window(tmp_path: Path) -> None:
    from pydicom.multival import MultiValue
    from pydicom.valuerep import DSfloat

    from app.imaging.pixel_decode import _ds_first_float, _ds_first_float_opt

    assert _ds_first_float(Dataset(), "RescaleSlope", 1.0) == 1.0
    ds_str = Dataset()
    ds_str.RescaleSlope = "2\\1"
    ds_str.RescaleIntercept = "-1000\\0"
    ds_str.WindowCenter = "40\\400"
    ds_str.WindowWidth = "400\\1500"
    assert _ds_first_float(ds_str, "RescaleSlope", 1.0) == 2.0
    assert _ds_first_float(ds_str, "RescaleIntercept", 0.0) == -1000.0
    assert _ds_first_float_opt(ds_str, "WindowCenter") == 40.0
    assert _ds_first_float_opt(ds_str, "WindowWidth") == 400.0

    path = tmp_path / "ds.dcm"
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
    ds.Rows = 4
    ds.Columns = 4
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.RescaleSlope = MultiValue(DSfloat, [2.0, 1.0])
    ds.RescaleIntercept = MultiValue(DSfloat, [-1000.0, 0.0])
    ds.WindowCenter = MultiValue(DSfloat, [40.0, 400.0])
    ds.WindowWidth = MultiValue(DSfloat, [400.0, 1500.0])
    ds.PixelData = np.full((4, 4), 50, dtype=np.uint16).tobytes()
    ds.save_as(str(path), enforce_file_format=True)

    decoded = decode_dicom_file(path)
    assert decoded.slope == 2.0
    assert decoded.intercept == -1000.0
    assert decoded.window_center == 40.0
    assert decoded.window_width == 400.0
    assert float(decoded.pixels[0, 0]) == 50 * 2 - 1000


def test_decode_left_aligned_bits_stored(tmp_path: Path) -> None:
    path = tmp_path / "bits.dcm"
    # value 7 stored left-aligned in 12-bit of 16
    _write_mono(path, fill=7, bits_stored=12, high_bit=15, slope=1, intercept=0)
    decoded = decode_dicom_file(path)
    assert abs(float(decoded.pixels[0, 0]) - 7.0) < 1e-3


def test_spacing_z_from_positions_median() -> None:
    assert spacing_z_from_positions([0.0, 1.25, 2.5, 3.75]) == 1.25
    assert spacing_z_from_positions([None, 1.0]) is None
    assert spacing_z_from_positions([]) is None


def test_constraints_reject_missing_modality() -> None:
    load_all_plugins()
    spec = registry.get("lung_seg").spec
    try:
        check_input_constraints(spec, modality=None, body_part="CHEST", num_instances=32)
        raised = False
    except UnsupportedInputError:
        raised = True
    assert raised


def test_constraints_reject_missing_body_part() -> None:
    load_all_plugins()
    spec = registry.get("lung_seg").spec
    try:
        check_input_constraints(spec, modality="CT", body_part=None, num_instances=32)
        raised = False
    except UnsupportedInputError:
        raised = True
    assert raised
