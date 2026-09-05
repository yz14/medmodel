"""Domain package exports."""

from app.domain.contracts import (
    ArtifactRef,
    ClassificationPrediction,
    DetectionBox,
    InferenceContext,
    InferenceResult,
    MaskArtifact,
    ModelPlugin,
    ModelSpec,
    SeriesMeta,
    WorkDir,
)
from app.domain.enums import (
    MaskEncoding,
    Modality,
    ResultType,
    TaskStage,
    TaskStatus,
    TaskType,
)

__all__ = [
    "ArtifactRef",
    "ClassificationPrediction",
    "DetectionBox",
    "InferenceContext",
    "InferenceResult",
    "MaskArtifact",
    "MaskEncoding",
    "ModelPlugin",
    "ModelSpec",
    "Modality",
    "ResultType",
    "SeriesMeta",
    "TaskStage",
    "TaskStatus",
    "TaskType",
    "WorkDir",
]

