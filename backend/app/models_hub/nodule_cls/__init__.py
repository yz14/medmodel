from __future__ import annotations

from typing import Any

import numpy as np

from app.domain.contracts import (
    ArtifactRef,
    ClassificationPrediction,
    InferenceContext,
    InferenceResult,
    ModelOutputSpec,
    ModelSpec,
)
from app.domain.enums import Modality, ResultType, TaskType
from app.models_hub.base import BaseFakeModel, require_volume, stable_seed
from app.models_hub.io_png import write_overlay_png


class NoduleClassificationModel(BaseFakeModel):
    spec = ModelSpec(
        id="nodule_cls",
        name="结节良恶性分类",
        version="1.1.0",
        task_type=TaskType.CLASSIFICATION,
        modalities=[Modality.CT],
        body_parts=["CHEST", "LUNG"],
        description="对胸部 CT 结节区域进行良恶性分类，输出类别概率与 CAM 热图叠加，辅助随访决策。",
        input_constraints={"modality": ["CT"], "min_slices": 8, "body_part": ["CHEST", "LUNG"]},
        params_schema={
            "type": "object",
            "properties": {
                "temperature": {
                    "type": "number",
                    "default": 1.0,
                    "minimum": 0.5,
                    "maximum": 2.0,
                    "title": "Softmax 温度",
                }
            },
            "additionalProperties": False,
        },
        outputs=[
            ModelOutputSpec(
                name="predictions",
                result_type=ResultType.CLASSIFICATION,
                description="类别概率",
            )
        ],
        metrics={"auc": 0.91, "accuracy": 0.87, "sensitivity": 0.89, "specificity": 0.84},
        expected_latency_ms=900,
        tags=["classification", "nodule", "demo", "synthetic"],
    )

    def preprocess(self, ctx: InferenceContext) -> dict[str, Any]:
        self._sleep(0.12, ctx)
        volume = require_volume(ctx)
        planted = list(ctx.extras.get("nodules") or [])
        if planted:
            mid_z = int(planted[0]["z"])
            mid_z = max(0, min(volume.shape[0] - 1, mid_z))
        else:
            mid_z = volume.shape[0] // 2
        mid = volume[mid_z]
        return {"mid_slice": mid, "volume": volume, "planted": planted, "mid_z": mid_z}

    def infer(self, data: dict[str, Any], ctx: InferenceContext) -> dict[str, Any]:
        rng = np.random.default_rng(stable_seed(ctx.series.series_uid, self.spec.id))
        logits = rng.normal(size=2)
        temp = max(float(ctx.params.get("temperature", 1.0)), 1e-3)
        logits = logits / temp
        exp = np.exp(logits - logits.max())
        probs = exp / exp.sum()
        self._sleep(0.4, ctx)
        self._progress(ctx, 0.6, "infer", "分类头前向完成")
        mid = data["mid_slice"]
        y, x = mid.shape
        yy, xx = np.ogrid[:y, :x]
        planted = data.get("planted") or []
        if planted:
            cy = float(planted[0]["y"])
            cx = float(planted[0]["x"])
        else:
            cy, cx = y / 2, x * 0.58
        cam = np.exp(-(((yy - cy) / (y * 0.12)) ** 2 + ((xx - cx) / (x * 0.1)) ** 2))
        return {
            "probs": probs.astype(float),
            "labels": ["Benign", "Malignant"],
            "cam": cam,
            "mid_slice": mid,
        }

    def postprocess(self, raw: dict[str, Any], ctx: InferenceContext) -> InferenceResult:
        labels: list[str] = raw["labels"]
        probs: np.ndarray = raw["probs"]
        predictions = [
            ClassificationPrediction(label=label, probability=round(float(p), 4))
            for label, p in zip(labels, probs, strict=True)
        ]
        cam = (raw["cam"] * 255).astype(np.uint8)
        cam_path = ctx.work_dir.output_dir / "cam.png"
        write_overlay_png(cam, cam_path)
        cam_uri = str(cam_path.resolve())
        top = max(predictions, key=lambda p: p.probability)
        self._sleep(0.1, ctx)
        return InferenceResult(
            type=ResultType.CLASSIFICATION,
            series_uid=ctx.series.series_uid,
            model_id=self.spec.id,
            model_version=self.spec.version,
            runtime_ms=0,
            summary=f"倾向 {top.label}（p={top.probability:.2%}）",
            artifacts=[
                ArtifactRef(
                    name="cam.png",
                    uri=cam_uri,
                    media_type="image/png",
                    size_bytes=cam_path.stat().st_size,
                )
            ],
            predictions=predictions,
            cam_overlay_uri=cam_uri,
        )


plugin = NoduleClassificationModel()
