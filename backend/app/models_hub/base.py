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


def require_volume(ctx: InferenceContext) -> np.ndarray:
    """Plugins must use Orchestrator-preloaded volume (N-B8)."""
    if ctx.volume is None:
        raise RuntimeError("InferenceContext.volume is missing — Orchestrator must preload")
    return ctx.volume


class BaseFakeModel(ABC):
    """Shared helpers for deterministic fake models with staged progress."""

    spec: ModelSpec
    _latency_scale: float = 1.0

    def load(self) -> None:
        return None

    def _sleep(self, seconds: float, ctx: InferenceContext | None = None) -> None:
        """Chunked sleep so cancel can interrupt long waits (N-B3)."""
        total = max(0.0, seconds * self._latency_scale)
        if total <= 0:
            return
        step = 0.05
        elapsed = 0.0
        while elapsed < total:
            if ctx is not None and ctx.cancel_check and ctx.cancel_check():
                raise RuntimeError("TASK_CANCELED")
            chunk = min(step, total - elapsed)
            time.sleep(chunk)
            elapsed += chunk

    def _progress(self, ctx: InferenceContext, pct: float, stage: str, message: str) -> None:
        if ctx.cancel_check and ctx.cancel_check():
            raise RuntimeError("TASK_CANCELED")
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

        t0 = time.perf_counter()
        self._progress(ctx, 0.95, "writing", "写入产物…")
        self._sleep(0.02, ctx)
        ctx.stage_timings["writing"] = round((time.perf_counter() - t0) * 1000, 1)

        result.runtime_ms = int((time.perf_counter() - started) * 1000)
        return result

    @abstractmethod
    def preprocess(self, ctx: InferenceContext) -> Any: ...

    @abstractmethod
    def infer(self, data: Any, ctx: InferenceContext) -> Any: ...

    @abstractmethod
    def postprocess(self, raw: Any, ctx: InferenceContext) -> InferenceResult: ...
