"""Pure-numpy anatomy helpers for fake models (N-B8/N-B9).

No app.imaging / app.infra imports — plugins may depend on this + domain only.
"""

from __future__ import annotations

from typing import Any

import numpy as np


def fill_holes_binary(mask: np.ndarray) -> np.ndarray:
    from scipy import ndimage

    return ndimage.binary_fill_holes(mask).astype(bool)


def morphology_open_close(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    from scipy import ndimage

    struct = ndimage.generate_binary_structure(mask.ndim, 1)
    opened = ndimage.binary_opening(mask, structure=struct, iterations=iterations)
    closed = ndimage.binary_closing(opened, structure=struct, iterations=iterations)
    return closed.astype(bool)


def largest_connected_component(mask: np.ndarray) -> np.ndarray:
    from scipy import ndimage

    labeled, num = ndimage.label(mask)
    if num == 0:
        return mask.astype(bool)
    counts = np.bincount(labeled.ravel())
    counts[0] = 0
    keep = int(counts.argmax())
    return labeled == keep


def keep_largest_n_components(mask: np.ndarray, n: int = 2) -> np.ndarray:
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


def clear_border_components(mask: np.ndarray) -> np.ndarray:
    """Remove components that touch the volume boundary (air leak)."""
    from scipy import ndimage

    labeled, num = ndimage.label(mask)
    if num == 0:
        return mask.astype(bool)
    border = np.zeros(labeled.shape, dtype=bool)
    border[0, :, :] = True
    border[-1, :, :] = True
    border[:, 0, :] = True
    border[:, -1, :] = True
    border[:, :, 0] = True
    border[:, :, -1] = True
    touch = set(int(v) for v in labeled[border] if v != 0)
    keep = mask.astype(bool).copy()
    for lab in touch:
        keep[labeled == lab] = False
    return keep


def estimate_body_mask(volume: np.ndarray, hu_thresh: float = -200.0) -> np.ndarray:
    """Body ≈ fill_holes(largest_cc(volume > hu_thresh)).

    Prefer light closing: heavy closing on noisy soft tissue erodes the shell
    and can reconnect lung air to outside.
    """
    from scipy import ndimage

    rough = volume > hu_thresh
    rough = ndimage.binary_closing(rough, iterations=1)
    body = largest_connected_component(rough)
    body = fill_holes_binary(body)
    if float(body.mean()) < 0.08:
        body = ndimage.binary_dilation(body, iterations=4)
        body = fill_holes_binary(largest_connected_component(body))
    return body


def estimate_lung_mask(
    volume: np.ndarray,
    *,
    hu_low: float = -1000.0,
    hu_high: float = -400.0,
    smooth: bool = True,
) -> np.ndarray:
    """Lung = HU band ∩ filled body, then top-2 CC (N-B9)."""
    airish = (volume >= hu_low) & (volume <= hu_high)
    body = estimate_body_mask(volume)
    lung = airish & body
    if float(lung.mean()) < 1e-4:
        # Degenerate body: keep internal air components not touching the border
        lung = clear_border_components(airish)
    if smooth and lung.any():
        lung = morphology_open_close(lung, iterations=1)
    if lung.any():
        lung = keep_largest_n_components(lung, n=2)
    return lung.astype(bool)


def gaussian_blob(
    shape: tuple[int, int, int],
    center: tuple[float, float, float],
    sigma: tuple[float, float, float],
    rng: np.random.Generator,
    *,
    jitter: bool = True,
) -> np.ndarray:
    zz, yy, xx = np.indices(shape, dtype=np.float32)
    cz, cy, cx = center
    sz, sy, sx = sigma
    if jitter:
        cz += rng.uniform(-0.3, 0.3)
        cy += rng.uniform(-0.5, 0.5)
        cx += rng.uniform(-0.5, 0.5)
    dist = ((zz - cz) / max(sz, 1e-3)) ** 2 + ((yy - cy) / max(sy, 1e-3)) ** 2 + (
        (xx - cx) / max(sx, 1e-3)
    ) ** 2
    return (dist <= 1.0).astype(bool)


def volume_mm3(mask: np.ndarray, spacing: tuple[float, float, float] | None) -> float:
    spacing = spacing or (1.0, 1.0, 1.0)
    voxel = float(np.prod(spacing))
    return float(mask.sum() * voxel)


def sample_lung_centers(
    lung: np.ndarray,
    rng: np.random.Generator,
    n: int,
    *,
    prefer: list[dict[str, Any]] | None = None,
) -> list[tuple[int, int, int]]:
    """Sample centers inside lung; prefer planted nodule locations when available."""
    centers: list[tuple[int, int, int]] = []
    if prefer:
        for nod in prefer:
            try:
                cz = int(round(float(nod["z"])))
                cy = int(round(float(nod["y"])))
                cx = int(round(float(nod["x"])))
            except (KeyError, TypeError, ValueError):
                continue
            if (
                0 <= cz < lung.shape[0]
                and 0 <= cy < lung.shape[1]
                and 0 <= cx < lung.shape[2]
                and lung[cz, cy, cx]
            ):
                centers.append((cz, cy, cx))
            if len(centers) >= n:
                return centers[:n]

    coords = np.argwhere(lung)
    if coords.size == 0:
        z, y, x = lung.shape
        while len(centers) < n:
            centers.append((z // 2, y // 2, x // 2))
        return centers[:n]

    need = n - len(centers)
    for _ in range(need):
        idx = int(rng.integers(0, len(coords)))
        c = coords[idx]
        centers.append((int(c[0]), int(c[1]), int(c[2])))
    return centers
