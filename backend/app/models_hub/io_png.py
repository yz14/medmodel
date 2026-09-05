"""Local PNG I/O for model plugins (stdlib + numpy + Pillow only)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_png_mask_stack(masks: np.ndarray, output_dir: Path, prefix: str = "mask") -> list[Path]:
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
