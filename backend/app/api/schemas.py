from __future__ import annotations

from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, WithJsonSchema

T = TypeVar("T")

# Bare `dict[str, Any]` emits `type: object` without additionalProperties,

# which openapi-typescript maps to `Record<string, never>`. Force open maps.

JsonDict = Annotated[

    dict[str, Any],
    WithJsonSchema({"type": "object", "additionalProperties": True}),
]
TaskStatusLiteral = Literal["queued", "running", "succeeded", "failed", "canceled"]

TaskTypeLiteral = Literal["segmentation", "detection", "classification"]
ResultTypeLiteral = Literal["segmentation", "detection", "classification"]

class ErrorBody(BaseModel):

    code: str
    message: str
    details: Any | None = None
    trace_id: str | None = None
class Page(BaseModel, Generic[T]):

    items: list[T]
    total: int
    page: int
    page_size: int
class QueueStatus(BaseModel):

    queued: int
    running: int
    max_concurrency: int
class HealthResponse(BaseModel):

    status: str
    version: str
    database: str
    queue: QueueStatus
    models: int
class SeriesSummary(BaseModel):

    series_uid: str
    study_uid: str
    modality: str | None = None
    body_part: str | None = None
    description: str | None = None
    series_number: int | None = None
    rows: int | None = None
    cols: int | None = None
    num_instances: int = 0
    spacing: list[float | None] | None = None
    is_phantom: bool = False
    thumbnail_url: str | None = None
    created_at: str | None = None
class StudyLastTask(BaseModel):
    """Latest inference task for a study (compact; for data-table AI status)."""

    task_id: str
    model_id: str
    model_name: str | None = None
    status: TaskStatusLiteral | str
    progress: float = 0.0
    message: str | None = None
    error_message: str | None = None
    created_at: str | None = None
    finished_at: str | None = None
class StudySummary(BaseModel):

    study_uid: str
    patient_id: str | None = None
    patient_name: str | None = None
    patient_sex: str | None = None
    patient_age: str | None = None
    study_date: str | None = None
    study_description: str | None = None
    modality: str | None = None
    body_part: str | None = None
    institution: str | None = None
    num_series: int = 0
    num_instances: int = 0
    created_at: str | None = None
    series: list[SeriesSummary] | None = None
    last_task: StudyLastTask | None = None
class InstanceItem(BaseModel):

    sop_uid: str
    instance_number: int
    slice_index: int = 0
    slice_position: float | None = None
    rows: int | None = None
    cols: int | None = None
    frame_url: str
    wadouri: str
    pixel_url: str | None = None
class InstanceListResponse(BaseModel):

    items: list[InstanceItem]
    total: int
    series: SeriesSummary
class ModelOutputSpec(BaseModel):

    name: str
    result_type: ResultTypeLiteral | str
    description: str = ""
class ModelSpec(BaseModel):

    id: str
    name: str
    version: str
    task_type: TaskTypeLiteral | str
    modalities: list[str]
    body_parts: list[str]
    description: str
    input_constraints: JsonDict = Field(default_factory=dict)
    params_schema: JsonDict = Field(default_factory=dict)
    outputs: list[ModelOutputSpec] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
    expected_latency_ms: int = 0
    enabled: bool = True
    tags: list[str] = Field(default_factory=list)
    default_params: JsonDict = Field(default_factory=dict)
class ModelListResponse(BaseModel):

    items: list[ModelSpec]
    total: int
class ModelPatchRequest(BaseModel):

    enabled: bool | None = None
    default_params: JsonDict | None = None
class ArtifactRef(BaseModel):

    name: str
    uri: str
    media_type: str = "application/octet-stream"
    size_bytes: int | None = None
    url: str | None = None
class TaskLog(BaseModel):

    level: str
    stage: str | None = None
    message: str
    created_at: str | None = None
class TaskSummary(BaseModel):

    task_id: str
    series_uid: str
    study_uid: str | None = None
    model_id: str
    model_version: str | None = None
    # Hospital-facing denormalized fields (from Study + registry).
    patient_name: str | None = None
    patient_id: str | None = None
    modality: str | None = None
    study_description: str | None = None
    model_name: str | None = None
    params: JsonDict = Field(default_factory=dict)
    status: TaskStatusLiteral | str
    stage: str | None = None
    progress: float = 0.0
    message: str | None = None
    cache_hit: bool = False
    cached_from: str | None = None
    runtime_ms: int | None = None
    stage_timings: JsonDict | None = None
    error_code: str | None = None
    error_message: str | None = None
    trace_id: str | None = None
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    artifacts: list[ArtifactRef] = Field(default_factory=list)
    logs: list[TaskLog] | None = None
class TaskCreateRequest(BaseModel):

    series_uid: str
    model_id: str
    params: JsonDict = Field(default_factory=dict)
class TaskCreateResponse(BaseModel):

    task_id: str
    status: str
    cache_hit: bool = False
class MaskArtifact(BaseModel):

    label_id: int
    label_name: str
    color: str
    encoding: str
    uri: str
    volume_mm3: float | None = None
    dice: float | None = None
    slice_indices: list[int] = Field(default_factory=list)
class DetectionBox(BaseModel):

    id: str
    label: str
    confidence: float
    slice_index: int | None = None
    bbox: list[float] | None = None
    bbox3d: list[float] | None = None
    diameter_mm: float | None = None
class ClassificationPrediction(BaseModel):

    label: str
    probability: float
class InferenceResult(BaseModel):

    type: ResultTypeLiteral | str
    series_uid: str
    model_id: str
    model_version: str
    runtime_ms: int
    summary: str
    artifacts: list[ArtifactRef] = Field(default_factory=list)
    masks: list[MaskArtifact] = Field(default_factory=list)
    boxes: list[DetectionBox] = Field(default_factory=list)
    predictions: list[ClassificationPrediction] = Field(default_factory=list)
    cam_overlay_uri: str | None = None
class OverviewKpis(BaseModel):

    study_count: int
    model_count: int
    today_tasks: int
    avg_dice: float = Field(description="Catalog mean Dice across segmentation models")
    success_rate: float | None = Field(
        default=None,
        description="succeeded / (succeeded + failed); null when no finished tasks",
    )
    failed_today: int = 0
class ModelMetricItem(BaseModel):

    id: str
    name: str
    task_type: TaskTypeLiteral | str
    metrics: dict[str, float] = Field(default_factory=dict)
    enabled: bool = True
class DailyTaskPoint(BaseModel):

    date: str
    total: int
    succeeded: int = 0
    failed: int = 0
class ModelUsageItem(BaseModel):

    model_id: str
    name: str
    task_type: TaskTypeLiteral | str
    total: int
    succeeded: int
    failed: int
    avg_runtime_ms: float | None = None
class OverviewStats(BaseModel):

    kpis: OverviewKpis
    model_metrics: list[ModelMetricItem] = Field(default_factory=list)
    model_distribution: dict[str, int] = Field(default_factory=dict)
    daily_tasks: list[DailyTaskPoint] = Field(default_factory=list)
    model_usage: list[ModelUsageItem] = Field(default_factory=list)
    recent_tasks: list[TaskSummary] = Field(default_factory=list)
    queue: QueueStatus = Field(default_factory=lambda: QueueStatus(queued=0, running=0, max_concurrency=0))
    registered_models: int = 0
class StudyUploadResponse(BaseModel):
    items: list[StudySummary]
    total: int


class LiveHealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str


class ReadyHealthResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    database: str
    models: int
    queue: QueueStatus


class ModelReadyResponse(BaseModel):
    model_id: str
    ready: bool
    enabled: bool
    version: str
    message: str


class FindingReviewItem(BaseModel):
    finding_id: str
    status: Literal["pending", "accepted", "rejected", "corrected"] = "pending"
    note: str | None = None


class ReportCreateRequest(BaseModel):
    """Generate structured report (+ optional DICOM exports) from selected findings."""

    finding_ids: list[str] = Field(default_factory=list)
    reviews: list[FindingReviewItem] = Field(default_factory=list)
    export_seg: bool = True
    export_sr: bool = True
    export_gsps: bool = True


class ReportArtifact(BaseModel):
    name: str
    uri: str
    media_type: str
    size_bytes: int | None = None
    url: str | None = None


class ReportResponse(BaseModel):
    report_id: str
    task_id: str
    model_id: str
    model_version: str
    finding_ids: list[str] = Field(default_factory=list)
    text: str
    artifacts: list[ReportArtifact] = Field(default_factory=list)

