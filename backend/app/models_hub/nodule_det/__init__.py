from __future__ import annotations

from typing import Any

import numpy as np

from app.domain.contracts import (
    ArtifactRef,
    DetectionBox,
    InferenceContext,
    InferenceResult,
    ModelOutputSpec,
    ModelSpec,
)
from app.domain.enums import Modality, ResultType, TaskType
from app.models_hub.anatomy import estimate_lung_mask, sample_lung_centers
from app.models_hub.base import BaseFakeModel, require_volume, stable_seed


class NoduleDetectionModel(BaseFakeModel):
    spec = ModelSpec(
        id="nodule_det",
        name="肺结节检测",
        version="1.1.0",
        task_type=TaskType.DETECTION,
        modalities=[Modality.CT],
        body_parts=["CHEST", "LUNG"],
        description="在肺实质内检测可疑结节，输出外接框与置信度，便于快速定位与审阅。",
        input_constraints={"modality": ["CT"], "min_slices": 8, "body_part": ["CHEST", "LUNG"]},
        params_schema={
            "type": "object",
            "properties": {
                "score_threshold": {
                    "type": "number",
                    "default": 0.35,
                    "minimum": 0.1,
                    "maximum": 0.9,
                    "title": "置信度阈值",
                },
                "max_detections": {
                    "type": "integer",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 10,
                    "title": "最大检出数",
                },
            },
            "additionalProperties": False,
        },
        outputs=[
            ModelOutputSpec(
                name="boxes",
                result_type=ResultType.DETECTION,
                description="二维外接框列表",
            )
        ],
        metrics={"map": 0.78, "sensitivity": 0.92, "precision": 0.88, "froc": 0.85},
        expected_latency_ms=1500,
        tags=["detection", "nodule", "demo", "synthetic"],
    )

    def preprocess(self, ctx: InferenceContext) -> dict[str, Any]:
        self._sleep(0.15, ctx)
        return {"volume": require_volume(ctx)}

    def infer(self, data: dict[str, Any], ctx: InferenceContext) -> dict[str, Any]:
        volume: np.ndarray = data["volume"]
        z, y, x = volume.shape
        rng = np.random.default_rng(stable_seed(ctx.series.series_uid, self.spec.id))
        max_det = int(ctx.params.get("max_detections", 5))
        thr = float(ctx.params.get("score_threshold", 0.35))
        planted = list(ctx.extras.get("nodules") or [])
        n = min(max_det, max(1, len(planted) or int(rng.integers(1, max_det + 1))))
        spacing = ctx.series.spacing or (1.25, 1.0, 1.0)

        lung = estimate_lung_mask(volume)
        centers = sample_lung_centers(lung, rng, n, prefer=planted)

        boxes: list[DetectionBox] = []
        self._sleep(0.5, ctx)
        for i, (cz, cy, cx) in enumerate(centers):
            conf = float(rng.uniform(0.55, 0.98)) if planted else float(rng.uniform(0.4, 0.98))
            if conf < thr:
                continue
            if planted and i < len(planted):
                diameter = float(planted[i].get("diameter_mm") or rng.uniform(5.0, 20.0))
            else:
                diameter = float(rng.uniform(5.0, 20.0))
            ry = max(diameter / (2 * spacing[1]), 3.0)
            rx = max(diameter / (2 * spacing[2]), 3.0)
            x0 = max(cx - rx, 0)
            y0 = max(cy - ry, 0)
            w = min(rx * 2, x - x0)
            h = min(ry * 2, y - y0)
            boxes.append(
                DetectionBox(
                    id=f"det-{i+1}",
                    label="Nodule",
                    confidence=round(conf, 3),
                    slice_index=int(cz),
                    bbox=(float(x0), float(y0), float(w), float(h)),
                    diameter_mm=round(diameter, 1),
                )
            )
            self._progress(ctx, 0.4 + i * 0.08, "infer", f"候选框 #{i+1} score={conf:.2f}")
        self._sleep(0.25, ctx)
        return {"boxes": boxes}

    def postprocess(self, raw: dict[str, Any], ctx: InferenceContext) -> InferenceResult:
        boxes: list[DetectionBox] = raw["boxes"]
        import json

        out_path = ctx.work_dir.output_dir / "detections.json"
        payload = [
            {
                "id": b.id,
                "label": b.label,
                "confidence": b.confidence,
                "slice_index": b.slice_index,
                "bbox": list(b.bbox) if b.bbox else None,
                "diameter_mm": b.diameter_mm,
            }
            for b in boxes
        ]
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        uri = str(out_path.resolve())
        self._sleep(0.1, ctx)
        return InferenceResult(
            type=ResultType.DETECTION,
            series_uid=ctx.series.series_uid,
            model_id=self.spec.id,
            model_version=self.spec.version,
            runtime_ms=0,
            summary=f"检出 {len(boxes)} 个结节候选。",
            artifacts=[
                ArtifactRef(
                    name="detections.json",
                    uri=uri,
                    media_type="application/json",
                    size_bytes=out_path.stat().st_size,
                )
            ],
            boxes=boxes,
        )


plugin = NoduleDetectionModel()
