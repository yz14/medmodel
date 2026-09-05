from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_png_mask_stack(masks: np.ndarray, output_dir: Path, prefix: str = "mask") -> list[Path]:
    """Write (Z,H,W) uint8 label masks as PNG stack. Returns file paths."""
    ensure_dir(output_dir)
    paths: list[Path] = []
    for idx, plane in enumerate(masks):
        path = output_dir / f"{prefix}_{idx:04d}.png"
        Image.fromarray(plane.astype(np.uint8), mode="L").save(path)
        paths.append(path)
    return paths


def write_overlay_png(image: np.ndarray, output_path: Path) -> Path:
    ensure_dir(output_path.parent)
    arr = image
    if arr.dtype != np.uint8:
        amin, amax = float(arr.min()), float(arr.max())
        if amax > amin:
            arr = ((arr - amin) / (amax - amin) * 255.0).astype(np.uint8)
        else:
            arr = np.zeros_like(arr, dtype=np.uint8)
    Image.fromarray(arr, mode="L").save(output_path)
    return output_path


def rle_encode(mask: np.ndarray) -> list[int]:
    """Simple run-length encoding for binary/label flat masks."""
    flat = mask.astype(np.uint8).ravel(order="C")
    if flat.size == 0:
        return []
    values: list[int] = []
    counts: list[int] = []
    prev = int(flat[0])
    count = 1
    for value in flat[1:]:
        value_i = int(value)
        if value_i == prev:
            count += 1
        else:
            values.append(prev)
            counts.append(count)
            prev = value_i
            count = 1
    values.append(prev)
    counts.append(count)
    out: list[int] = []
    for v, c in zip(values, counts, strict=True):
        out.extend([v, c])
    return out


def morphology_open_close(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    from scipy import ndimage

    struct = ndimage.generate_binary_structure(3, 1)
    opened = ndimage.binary_opening(mask, structure=struct, iterations=iterations)
    closed = ndimage.binary_closing(opened, structure=struct, iterations=iterations)
    return closed.astype(bool)


def largest_connected_component(mask: np.ndarray) -> np.ndarray:
    from scipy import ndimage

    labeled, num = ndimage.label(mask)
    if num == 0:
        return mask
    counts = np.bincount(labeled.ravel())
    counts[0] = 0
    keep = counts.argmax()
    return labeled == keep


def keep_largest_n_components(mask: np.ndarray, n: int = 2) -> np.ndarray:
    """Keep the n largest connected components (e.g. both lungs)."""
    from scipy import ndimage

    labeled, num = ndimage.label(mask)
    if num == 0:
        return mask.astype(bool)
    if num <= n:
        return mask.astype(bool)
    counts = np.bincount(labeled.ravel())
    counts[0] = 0
    top = counts.argsort()[-n:]
    return np.isin(labeled, top)


def gaussian_blob(
    shape: tuple[int, int, int],
    center: tuple[float, float, float],
    sigma: tuple[float, float, float],
    rng: np.random.Generator,
) -> np.ndarray:
    zz, yy, xx = np.indices(shape, dtype=np.float32)
    cz, cy, cx = center
    sz, sy, sx = sigma
    # slight jitter for realism
    cz += rng.uniform(-0.3, 0.3)
    cy += rng.uniform(-0.5, 0.5)
    cx += rng.uniform(-0.5, 0.5)
    dist = ((zz - cz) / sz) ** 2 + ((yy - cy) / sy) ** 2 + ((xx - cx) / sx) ** 2
    return (dist <= 1.0).astype(bool)


def volume_mm3(mask: np.ndarray, spacing: tuple[float, float, float] | None) -> float:
    spacing = spacing or (1.0, 1.0, 1.0)
    voxel = float(np.prod(spacing))
    return float(mask.sum() * voxel)

