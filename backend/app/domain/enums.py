from __future__ import annotations

from enum import Enum


class TaskType(str, Enum):
    SEGMENTATION = "segmentation"
    DETECTION = "detection"
    CLASSIFICATION = "classification"


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


class TaskStage(str, Enum):
    QUEUED = "queued"
    PREPROCESS = "preprocess"
    INFER = "infer"
    POSTPROCESS = "postprocess"
    WRITING = "writing"
    DONE = "done"


class Modality(str, Enum):
    CT = "CT"
    MR = "MR"
    DR = "DR"
    CR = "CR"
    DX = "DX"
    PT = "PT"
    US = "US"
    OTHER = "OTHER"


class MaskEncoding(str, Enum):
    PNG_STACK = "png_stack"
    RLE = "rle"
    NIFTI = "nifti"


class ResultType(str, Enum):
    SEGMENTATION = "segmentation"
    DETECTION = "detection"
    CLASSIFICATION = "classification"

