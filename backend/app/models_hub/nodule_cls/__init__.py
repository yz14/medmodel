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
from app.imaging.mask_utils import write_overlay_png
from app.models_hub.base import BaseFakeModel, load_series_volume, stable_seed


class NoduleClassificationModel(BaseFakeModel):
    spec = ModelSpec(
        id="nodule_cls",
        name="结节良恶性分类",
        version="1.0.0",
        task_type=TaskType.CLASSIFICATION,
        modalities=[Modality.CT],
        body_parts=["CHEST", "LUNG"],
        description="以 series_uid 为种子的确定性伪分类，输出良/恶性概率与 CAM 示意叠加。",
        input_constraints={"modality": ["CT"]},
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
        tags=["classification", "nodule", "demo"],
    )

    def preprocess(self, ctx: InferenceContext) -> dict[str, Any]:
        self._sleep(0.12, ctx)
        series = ctx.series
        volume = load_series_volume(
            str(series.series_path) if series.series_path else None,
            series.rows,
            series.cols,
            max(series.num_instances, 8),
        )
        mid = volume[volume.shape[0] // 2]
        return {"mid_slice": mid, "volume": volume}

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
        # fake CAM: brighten a central blob
        y, x = mid.shape
        yy, xx = np.ogrid[:y, :x]
        cam = np.exp(-(((yy - y / 2) / (y * 0.12)) ** 2 + ((xx - x * 0.58) / (x * 0.1)) ** 2))
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

