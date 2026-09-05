from __future__ import annotations

from typing import Any

import numpy as np

from app.domain.contracts import (
    ArtifactRef,
    InferenceContext,
    InferenceResult,
    MaskArtifact,
    ModelOutputSpec,
    ModelSpec,
)
from app.domain.enums import MaskEncoding, Modality, ResultType, TaskType
from app.models_hub.anatomy import estimate_lung_mask, volume_mm3
from app.models_hub.base import BaseFakeModel, require_volume
from app.models_hub.io_png import write_png_mask_stack


class LungSegmentationModel(BaseFakeModel):
    spec = ModelSpec(
        id="lung_seg",
        name="肺实质分割",
        version="1.1.0",
        task_type=TaskType.SEGMENTATION,
        modalities=[Modality.CT],
        body_parts=["CHEST", "LUNG"],
        description="基于体表连通域 + HU 阈值的假肺分割（无硬编码椭圆）。",
        input_constraints={"modality": ["CT"], "min_slices": 8, "body_part": ["CHEST", "LUNG"]},
        params_schema={
            "type": "object",
            "properties": {
                "hu_low": {"type": "number", "default": -1000, "title": "HU 下限"},
                "hu_high": {"type": "number", "default": -400, "title": "HU 上限"},
                "smooth": {"type": "boolean", "default": True, "title": "形态学平滑"},
            },
            "additionalProperties": False,
        },
        outputs=[
            ModelOutputSpec(
                name="lung_mask",
                result_type=ResultType.SEGMENTATION,
                description="左右肺合并标签",
            )
        ],
        metrics={"dice": 0.956, "iou": 0.918, "hd95": 2.1, "asd": 0.6},
        expected_latency_ms=1800,
        tags=["segmentation", "chest", "demo"],
    )

    def preprocess(self, ctx: InferenceContext) -> dict[str, Any]:
        self._sleep(0.25, ctx)
        volume = require_volume(ctx)
        self._progress(ctx, 0.2, "preprocess", f"已加载体数据 {volume.shape}")
        return {"volume": volume}

    def infer(self, data: dict[str, Any], ctx: InferenceContext) -> dict[str, Any]:
        volume: np.ndarray = data["volume"]
        hu_low = float(ctx.params.get("hu_low", -1000))
        hu_high = float(ctx.params.get("hu_high", -400))
        smooth = bool(ctx.params.get("smooth", True))
        self._sleep(0.45, ctx)
        mask = estimate_lung_mask(volume, hu_low=hu_low, hu_high=hu_high, smooth=smooth)
        self._progress(ctx, 0.7, "infer", "肺实质提取完成")
        return {"mask": mask.astype(np.uint8), "volume": volume}

    def postprocess(self, raw: dict[str, Any], ctx: InferenceContext) -> InferenceResult:
        mask: np.ndarray = raw["mask"]
        out_dir = ctx.work_dir.output_dir / "lung"
        paths = write_png_mask_stack(mask * 255, out_dir, prefix="lung")
        label_stack = (mask > 0).astype(np.uint8)
        write_png_mask_stack(label_stack, out_dir, prefix="label")
        spacing = ctx.series.spacing
        vol = volume_mm3(mask.astype(bool), spacing)
        uri = str(out_dir.resolve())
        artifacts = [
            ArtifactRef(
                name=p.name,
                uri=str(p.resolve()),
                media_type="image/png",
                size_bytes=p.stat().st_size,
            )
            for p in paths[:3]
        ]
        self._sleep(0.2, ctx)
        return InferenceResult(
            type=ResultType.SEGMENTATION,
            series_uid=ctx.series.series_uid,
            model_id=self.spec.id,
            model_version=self.spec.version,
            runtime_ms=0,
            summary=f"肺分割完成，体素体积约 {vol/1000:.1f} mL，切片 {int(mask.any(axis=(1,2)).sum())} 层含肺。",
            artifacts=artifacts,
            masks=[
                MaskArtifact(
                    label_id=1,
                    label_name="Lung",
                    color="#38BDF8",
                    encoding=MaskEncoding.PNG_STACK,
                    uri=uri,
                    volume_mm3=vol,
                    dice=0.95,
                    slice_indices=[int(i) for i in np.where(mask.any(axis=(1, 2)))[0].tolist()],
                )
            ],
        )


plugin = LungSegmentationModel()
