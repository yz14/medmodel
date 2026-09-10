from __future__ import annotations

import json
from typing import Any

import numpy as np
from scipy import ndimage

from app.domain.contracts import (
    ArtifactRef,
    InferenceContext,
    InferenceResult,
    MaskArtifact,
    ModelOutputSpec,
    ModelSpec,
)
from app.domain.enums import MaskEncoding, Modality, ResultType, TaskType
from app.models_hub.anatomy import estimate_lung_mask, gaussian_blob, sample_lung_centers, volume_mm3
from app.models_hub.base import BaseFakeModel, require_volume, stable_seed
from app.models_hub.io_png import write_png_mask_stack


class NoduleSegmentationModel(BaseFakeModel):
    spec = ModelSpec(
        id="nodule_seg",
        name="肺结节分割",
        version="1.1.0",
        task_type=TaskType.SEGMENTATION,
        modalities=[Modality.CT],
        body_parts=["CHEST", "LUNG"],
        description="在肺实质内自动分割肺结节，输出逐层掩膜与体积测量，支持多发结节场景。",
        input_constraints={"modality": ["CT"], "min_slices": 8, "body_part": ["CHEST", "LUNG"]},
        params_schema={
            "type": "object",
            "properties": {
                "max_nodules": {
                    "type": "integer",
                    "default": 3,
                    "minimum": 1,
                    "maximum": 5,
                    "title": "最大结节数",
                },
                "min_diameter_mm": {"type": "number", "default": 4.0, "title": "最小直径 (mm)"},
                "max_diameter_mm": {"type": "number", "default": 18.0, "title": "最大直径 (mm)"},
            },
            "additionalProperties": False,
        },
        outputs=[
            ModelOutputSpec(
                name="nodule_masks",
                result_type=ResultType.SEGMENTATION,
                description="结节实例标签",
            )
        ],
        metrics={"dice": 0.941, "iou": 0.892, "hd95": 3.4, "asd": 0.9},
        expected_latency_ms=2200,
        tags=["segmentation", "nodule", "demo", "synthetic"],
    )

    def preprocess(self, ctx: InferenceContext) -> dict[str, Any]:
        self._sleep(0.2, ctx)
        return {"volume": require_volume(ctx)}

    def infer(self, data: dict[str, Any], ctx: InferenceContext) -> dict[str, Any]:
        volume: np.ndarray = data["volume"]
        z, y, x = volume.shape
        rng = np.random.default_rng(
            stable_seed(
                ctx.series.series_uid,
                self.spec.id,
                json.dumps(ctx.params, sort_keys=True, separators=(",", ":"), default=str),
            )
        )
        max_n = int(ctx.params.get("max_nodules", 3))
        planted = list(ctx.extras.get("nodules") or [])
        n = min(max_n, max(1, len(planted) or int(rng.integers(1, max_n + 1))))
        min_d = float(ctx.params.get("min_diameter_mm", 4.0))
        max_d = float(ctx.params.get("max_diameter_mm", 18.0))
        spacing = ctx.series.spacing or (1.25, 1.0, 1.0)

        lung = estimate_lung_mask(volume)
        centers = sample_lung_centers(lung, rng, n, prefer=planted)

        label_mask = np.zeros((z, y, x), dtype=np.uint8)
        self._sleep(0.4, ctx)
        for label_id, center in enumerate(centers, start=1):
            if planted and label_id <= len(planted):
                diameter = float(planted[label_id - 1].get("diameter_mm") or rng.uniform(min_d, max_d))
            else:
                diameter = float(rng.uniform(min_d, max_d))
            radius_vox = (
                max(diameter / (2 * spacing[0]), 1.0),
                max(diameter / (2 * spacing[1]), 1.0),
                max(diameter / (2 * spacing[2]), 1.0),
            )
            blob = gaussian_blob(
                (z, y, x),
                (float(center[0]), float(center[1]), float(center[2])),
                radius_vox,
                rng,
                jitter=not bool(planted),
            )
            blob = ndimage.binary_dilation(blob, iterations=1)
            label_mask[blob & (label_mask == 0) & lung] = label_id
            self._progress(ctx, 0.35 + 0.1 * label_id, "infer", f"生成结节 #{label_id}")
        self._sleep(0.3, ctx)
        return {"label_mask": label_mask, "count": n}

    def postprocess(self, raw: dict[str, Any], ctx: InferenceContext) -> InferenceResult:
        label_mask: np.ndarray = raw["label_mask"]
        out_dir = ctx.work_dir.output_dir / "nodule_seg"
        write_png_mask_stack(label_mask, out_dir, prefix="label")
        uri = str(out_dir.resolve())
        colors = ["#F59E0B", "#EF4444", "#10B981", "#A78BFA", "#38BDF8"]
        masks: list[MaskArtifact] = []
        spacing = ctx.series.spacing
        for label_id in range(1, int(label_mask.max()) + 1):
            binary = label_mask == label_id
            if not binary.any():
                continue
            masks.append(
                MaskArtifact(
                    label_id=label_id,
                    label_name=f"Nodule-{label_id}",
                    color=colors[(label_id - 1) % len(colors)],
                    encoding=MaskEncoding.PNG_STACK,
                    uri=uri,
                    volume_mm3=volume_mm3(binary, spacing),
                    dice=0.93,
                    slice_indices=[int(i) for i in np.where(binary.any(axis=(1, 2)))[0].tolist()],
                )
            )
        artifacts = [
            ArtifactRef(
                name="label_stack",
                uri=uri,
                media_type="application/x-png-stack",
            )
        ]
        self._sleep(0.15, ctx)
        return InferenceResult(
            type=ResultType.SEGMENTATION,
            series_uid=ctx.series.series_uid,
            model_id=self.spec.id,
            model_version=self.spec.version,
            runtime_ms=0,
            summary=f"检出并分割 {len(masks)} 个结节。",
            artifacts=artifacts,
            masks=masks,
        )


plugin = NoduleSegmentationModel()
