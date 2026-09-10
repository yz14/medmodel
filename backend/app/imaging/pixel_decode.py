"""Decode a single DICOM instance to display-ready float32 pixels.

Handles BitsStored/HighBit alignment, multi-valued DS rescale, MONOCHROME1,
and rejects unsupported layouts (color / multi-frame without handler) clearly.
Shared by volume preload and the decoded-frame HTTP API so AI and viewer agree.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import Dataset
from pydicom.uid import (
    ExplicitVRBigEndian,
    ExplicitVRLittleEndian,
    ImplicitVRLittleEndian,
)

from app.infra.logging import get_logger

logger = get_logger(__name__)

# Uncompressed transfer syntaxes pydicom can always read without plugins.
_UNCOMPRESSED_TS = {
    str(ImplicitVRLittleEndian),
    str(ExplicitVRLittleEndian),
    str(ExplicitVRBigEndian),
}


class PixelDecodeError(ValueError):
    """Pixel path cannot be decoded for viewing / volume build."""

    def __init__(self, message: str, *, code: str = "PIXEL_DECODE_FAILED") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class DecodedSlice:
    pixels: np.ndarray  # float32 [rows, cols], rescale applied, MONOCHROME2 polarity
    rows: int
    cols: int
    slope: float
    intercept: float
    window_center: float | None
    window_width: float | None
    photometric: str
    modality: str | None


def _ds_first_float(ds: Dataset, keyword: str, default: float) -> float:
    raw = getattr(ds, keyword, None)
    if raw is None:
        return default
    try:
        if isinstance(raw, (int, float)):
            return float(raw)
        if isinstance(raw, (str, bytes)):
            text = str(raw).split("\\")[0].strip()
            return float(text) if text else default
        # pydicom MultiValue / list / tuple
        try:
            first = raw[0]  # type: ignore[index]
            return float(first)
        except Exception:  # noqa: BLE001
            pass
        text = str(raw).split("\\")[0].strip()
        return float(text) if text else default
    except (TypeError, ValueError, IndexError):
        return default


def _ds_first_float_opt(ds: Dataset, keyword: str) -> float | None:
    raw = getattr(ds, keyword, None)
    if raw is None:
        return None
    try:
        if isinstance(raw, (int, float)):
            val = float(raw)
        elif isinstance(raw, (str, bytes)):
            text = str(raw).split("\\")[0].strip()
            val = float(text)
        else:
            try:
                val = float(raw[0])  # type: ignore[index]
            except Exception:  # noqa: BLE001
                text = str(raw).split("\\")[0].strip()
                val = float(text)
        return val if np.isfinite(val) else None
    except (TypeError, ValueError, IndexError):
        return None


def _apply_bit_alignment(raw: np.ndarray, ds: Dataset) -> np.ndarray:
    """Right-shift left-aligned pixels; mask / sign-extend right-aligned stored bits."""
    bits_allocated = int(getattr(ds, "BitsAllocated", 16) or 16)
    bits_stored = int(getattr(ds, "BitsStored", bits_allocated) or bits_allocated)
    high_bit = int(getattr(ds, "HighBit", bits_stored - 1) or (bits_stored - 1))
    pixel_rep = int(getattr(ds, "PixelRepresentation", 0) or 0)

    if bits_stored >= bits_allocated or bits_stored <= 0:
        return raw.astype(np.float32)

    work = raw.astype(np.int32, copy=False)
    # Left-aligned: HighBit == BitsAllocated - 1
    if high_bit == bits_allocated - 1:
        shift = bits_allocated - bits_stored
        work = work >> shift
    else:
        mask = (1 << bits_stored) - 1
        work = work & mask
        if pixel_rep == 1:
            sign = 1 << (bits_stored - 1)
            work = np.where(work & sign, work - (1 << bits_stored), work)
    return work.astype(np.float32)


def decode_dicom_file(path: Path | str) -> DecodedSlice:
    path = Path(path)
    try:
        ds = pydicom.dcmread(str(path), force=True)
    except Exception as exc:  # noqa: BLE001
        raise PixelDecodeError(f"无法读取 DICOM: {path.name}: {exc}") from exc

    ts = None
    if hasattr(ds, "file_meta"):
        ts = getattr(ds.file_meta, "TransferSyntaxUID", None)
    ts_str = str(ts) if ts is not None else ""

    samples = int(getattr(ds, "SamplesPerPixel", 1) or 1)
    if samples != 1:
        raise PixelDecodeError(f"暂不支持彩色/多采样影像 (SamplesPerPixel={samples})")

    n_frames = int(getattr(ds, "NumberOfFrames", 1) or 1)
    if n_frames > 1:
        raise PixelDecodeError(f"暂不支持多帧 DICOM (NumberOfFrames={n_frames})")

    # Prefer explicit rejection for known-compressed without handler noise
    if ts_str and ts_str not in _UNCOMPRESSED_TS:
        # Still try pixel_array — pylibjpeg / gdcm may be installed
        pass

    try:
        arr = ds.pixel_array
    except Exception as exc:  # noqa: BLE001
        if ts_str and ts_str not in _UNCOMPRESSED_TS:
            raise PixelDecodeError(
                f"不支持的压缩传输语法 {ts_str}（需安装解码插件或转码为 Explicit VR LE）",
                code="UNSUPPORTED_TRANSFER_SYNTAX",
            ) from exc
        raise PixelDecodeError(f"像素解码失败: {exc}") from exc

    arr = np.asarray(arr)
    if arr.ndim == 3 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim != 2:
        raise PixelDecodeError(f"意外的像素维度: {arr.shape}")

    rows, cols = int(arr.shape[0]), int(arr.shape[1])
    pixels = _apply_bit_alignment(arr, ds)

    slope = _ds_first_float(ds, "RescaleSlope", 1.0)
    intercept = _ds_first_float(ds, "RescaleIntercept", 0.0)
    pixels = pixels * slope + intercept

    photometric = str(getattr(ds, "PhotometricInterpretation", "MONOCHROME2") or "MONOCHROME2").strip().upper()
    if photometric == "MONOCHROME1":
        finite = pixels[np.isfinite(pixels)]
        if finite.size:
            pixels = float(finite.max() + finite.min()) - pixels
        photometric = "MONOCHROME2"  # normalized polarity for display

    ww = _ds_first_float_opt(ds, "WindowWidth")
    if ww is not None and ww <= 0:
        ww = None
    wc = _ds_first_float_opt(ds, "WindowCenter")

    modality = getattr(ds, "Modality", None)
    modality_s = str(modality).strip() if modality is not None else None

    return DecodedSlice(
        pixels=np.ascontiguousarray(pixels, dtype=np.float32),
        rows=rows,
        cols=cols,
        slope=slope,
        intercept=intercept,
        window_center=wc,
        window_width=ww,
        photometric=photometric,
        modality=modality_s or None,
    )


def spacing_z_from_positions(positions: list[float | None]) -> float | None:
    """Median absolute IPP-gap along an already spatially-sorted series."""
    vals = [float(p) for p in positions if p is not None and np.isfinite(p)]
    if len(vals) < 2:
        return None
    diffs = np.abs(np.diff(np.asarray(vals, dtype=np.float64)))
    positive = diffs[diffs > 1e-6]
    if positive.size == 0:
        return None
    return float(np.median(positive))
