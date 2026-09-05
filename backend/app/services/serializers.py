from __future__ import annotations

import dataclasses
from typing import Any

from app.domain.contracts import (
    ArtifactRef,
    ClassificationPrediction,
    DetectionBox,
    InferenceResult,
    MaskArtifact,
)


def inference_result_to_dict(result: InferenceResult) -> dict[str, Any]:
    return {
        "type": result.type.value if hasattr(result.type, "value") else result.type,
        "series_uid": result.series_uid,
        "model_id": result.model_id,
        "model_version": result.model_version,
        "runtime_ms": result.runtime_ms,
        "summary": result.summary,
        "artifacts": [_artifact_to_dict(a) for a in result.artifacts],
        "masks": [_mask_to_dict(m) for m in result.masks],
        "boxes": [_box_to_dict(b) for b in result.boxes],
        "predictions": [_pred_to_dict(p) for p in result.predictions],
        "cam_overlay_uri": result.cam_overlay_uri,
    }


def _artifact_to_dict(a: ArtifactRef) -> dict[str, Any]:
    return dataclasses.asdict(a)


def _mask_to_dict(m: MaskArtifact) -> dict[str, Any]:
    d = dataclasses.asdict(m)
    d["encoding"] = m.encoding.value if hasattr(m.encoding, "value") else m.encoding
    return d


def _box_to_dict(b: DetectionBox) -> dict[str, Any]:
    d = dataclasses.asdict(b)
    if b.bbox is not None:
        d["bbox"] = list(b.bbox)
    if b.bbox3d is not None:
        d["bbox3d"] = list(b.bbox3d)
    return d


def _pred_to_dict(p: ClassificationPrediction) -> dict[str, Any]:
    return dataclasses.asdict(p)

