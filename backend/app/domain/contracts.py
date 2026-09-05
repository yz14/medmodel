from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Protocol

from app.domain.enums import MaskEncoding, Modality, ResultType, TaskType

ProgressCallback = Callable[[float, str, str], None]


@dataclass(slots=True)
class ModelOutputSpec:
    name: str
    result_type: ResultType
    description: str = ""


@dataclass(slots=True)
class ModelSpec:
    id: str
    name: str
    version: str
    task_type: TaskType
    modalities: list[Modality]
    body_parts: list[str]
    description: str
    input_constraints: dict[str, Any]
    params_schema: dict[str, Any]
    outputs: list[ModelOutputSpec]
    metrics: dict[str, float]
    expected_latency_ms: int
    enabled: bool = True
    tags: list[str] = field(default_factory=list)


@dataclass(slots=True)
class WorkDir:
    root: Path
    input_dir: Path
    output_dir: Path

    @classmethod
    def create(cls, root: Path) -> WorkDir:
        input_dir = root / "input"
        output_dir = root / "output"
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        return cls(root=root, input_dir=input_dir, output_dir=output_dir)


@dataclass(slots=True)
class SeriesMeta:
    series_uid: str
    study_uid: str
    modality: str
    body_part: str | None
    description: str | None
    rows: int
    cols: int
    num_instances: int
    spacing: tuple[float, float, float] | None = None
    series_path: Path | None = None


@dataclass(slots=True)
class InferenceContext:
    task_id: str
    work_dir: WorkDir
    series: SeriesMeta
    params: dict[str, Any]
    progress_cb: ProgressCallback
    latency_scale: float = 1.0
    stage_timings: dict[str, float] = field(default_factory=dict)
    cancel_check: Callable[[], bool] | None = None
    """Preloaded volume (Orchestrator fills; plugins must not read DICOM themselves)."""
    volume: Any | None = None
    """Sidecar extras e.g. planted nodules from phantom_meta.json."""
    extras: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MaskArtifact:
    label_id: int
    label_name: str
    color: str
    encoding: MaskEncoding
    uri: str
    volume_mm3: float | None = None
    dice: float | None = None
    slice_indices: list[int] = field(default_factory=list)


@dataclass(slots=True)
class DetectionBox:
    id: str
    label: str
    confidence: float
    slice_index: int | None = None
    bbox: tuple[float, float, float, float] | None = None  # x, y, w, h in pixel
    bbox3d: tuple[float, float, float, float, float, float] | None = None
    diameter_mm: float | None = None


@dataclass(slots=True)
class ClassificationPrediction:
    label: str
    probability: float


@dataclass(slots=True)
class ArtifactRef:
    name: str
    uri: str
    media_type: str
    size_bytes: int | None = None


@dataclass(slots=True)
class InferenceResult:
    type: ResultType
    series_uid: str
    model_id: str
    model_version: str
    runtime_ms: int
    summary: str
    artifacts: list[ArtifactRef] = field(default_factory=list)
    # segmentation
    masks: list[MaskArtifact] = field(default_factory=list)
    # detection
    boxes: list[DetectionBox] = field(default_factory=list)
    # classification
    predictions: list[ClassificationPrediction] = field(default_factory=list)
    cam_overlay_uri: str | None = None


class ModelPlugin(Protocol):
    """MONAI-style plugin contract: preprocess → infer → postprocess."""

    spec: ModelSpec

    def load(self) -> None: ...

    def preprocess(self, ctx: InferenceContext) -> Any: ...

    def infer(self, data: Any, ctx: InferenceContext) -> Any: ...

    def postprocess(self, raw: Any, ctx: InferenceContext) -> InferenceResult: ...

