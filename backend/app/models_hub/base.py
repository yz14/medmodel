from __future__ import annotations

import hashlib
import time
from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from app.domain.contracts import InferenceContext, InferenceResult, ModelSpec


def stable_seed(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


class BaseFakeModel(ABC):
    """Shared helpers for deterministic fake models with staged progress."""

    spec: ModelSpec
    _latency_scale: float = 1.0

    def load(self) -> None:
        return None

    def _sleep(self, seconds: float) -> None:
        time.sleep(max(0.0, seconds * self._latency_scale))

    def _progress(self, ctx: InferenceContext, pct: float, stage: str, message: str) -> None:
        ctx.progress_cb(pct, stage, message)

    def run(self, ctx: InferenceContext) -> InferenceResult:
        started = time.perf_counter()
        self._latency_scale = ctx.latency_scale
        self.load()

        t0 = time.perf_counter()
        self._progress(ctx, 0.05, "preprocess", "准备输入数据…")
        data = self.preprocess(ctx)
        ctx.stage_timings["preprocess"] = round((time.perf_counter() - t0) * 1000, 1)

        t0 = time.perf_counter()
        self._progress(ctx, 0.25, "infer", "模型推理中…")
        raw = self.infer(data, ctx)
        ctx.stage_timings["infer"] = round((time.perf_counter() - t0) * 1000, 1)

        t0 = time.perf_counter()
        self._progress(ctx, 0.75, "postprocess", "后处理与编码产物…")
        result = self.postprocess(raw, ctx)
        ctx.stage_timings["postprocess"] = round((time.perf_counter() - t0) * 1000, 1)

        self._progress(ctx, 0.95, "writing", "写入产物…")
        result.runtime_ms = int((time.perf_counter() - started) * 1000)
        return result

    @abstractmethod
    def preprocess(self, ctx: InferenceContext) -> Any: ...

    @abstractmethod
    def infer(self, data: Any, ctx: InferenceContext) -> Any: ...

    @abstractmethod
    def postprocess(self, raw: Any, ctx: InferenceContext) -> InferenceResult: ...


def load_series_volume(series_path: str | None, rows: int, cols: int, num: int) -> np.ndarray:
    """Load DICOM series as float32 volume; fall back to synthetic volume."""
    if series_path:
        try:
            from app.imaging.dicom_io import read_series_volume

            volume = read_series_volume(series_path)
            if volume is not None:
                return volume
        except Exception:  # noqa: BLE001
            pass
    rng = np.random.default_rng(42)
    # Rough CT-like HU distribution
    volume = rng.normal(loc=-200, scale=180, size=(num, rows, cols)).astype(np.float32)
    return volume
