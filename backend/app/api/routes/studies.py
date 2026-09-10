from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.api.deps import get_study_service
from app.api.schemas import Page, StudySummary, StudyUploadResponse
from app.infra.config import get_settings
from app.services.study_service import StudyService, _safe_upload_relpath

router = APIRouter(tags=["studies"])

_CHUNK = 1024 * 1024  # 1 MiB


class _UploadLimitError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _stream_one_file(file_obj: object, dest: Path, *, budget: int) -> int:
    """Copy from a file-like object to dest without exceeding remaining budget."""
    written = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as out:
        while True:
            chunk = file_obj.read(_CHUNK)  # type: ignore[attr-defined]
            if not chunk:
                break
            written += len(chunk)
            if written > budget:
                raise _UploadLimitError(
                    "UPLOAD_TOO_LARGE",
                    "上传总大小超过限制",
                )
            out.write(chunk)
    return written


@router.post("/studies/upload", response_model=StudyUploadResponse)
async def upload_studies(
    files: list[UploadFile] = File(...),
    svc: StudyService = Depends(get_study_service),
) -> StudyUploadResponse:
    settings = get_settings()
    if not files:
        raise HTTPException(
            status_code=400,
            detail={"code": "UPLOAD_INVALID", "message": "未提供文件"},
        )
    if len(files) > settings.max_upload_files:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "UPLOAD_TOO_MANY_FILES",
                "message": f"文件数超过限制（最多 {settings.max_upload_files} 个）",
                "details": {"max_upload_files": settings.max_upload_files, "got": len(files)},
            },
        )

    tmp_root = Path(tempfile.mkdtemp(prefix="voxflow_upload_"))
    total = 0
    try:
        for f in files:
            try:
                dest = _safe_upload_relpath(tmp_root, f.filename or "upload.dcm")
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "UPLOAD_INVALID", "message": str(exc)},
                ) from exc
            remaining = settings.max_upload_bytes - total
            if remaining <= 0:
                raise _UploadLimitError(
                    "UPLOAD_TOO_LARGE",
                    f"上传总大小超过限制（最多 {settings.max_upload_bytes} 字节）",
                )
            try:
                written = await asyncio.to_thread(
                    _stream_one_file, f.file, dest, budget=remaining
                )
            except _UploadLimitError:
                raise
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=400,
                    detail={"code": "UPLOAD_INVALID", "message": f"写入失败: {exc}"},
                ) from exc
            total += written
            if total > settings.max_upload_bytes:
                raise _UploadLimitError(
                    "UPLOAD_TOO_LARGE",
                    f"上传总大小超过限制（最多 {settings.max_upload_bytes} 字节）",
                )

        try:
            studies = await asyncio.to_thread(svc.upload_directory, tmp_root)
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail={"code": "UPLOAD_INVALID", "message": str(exc)}
            ) from exc
    except _UploadLimitError as exc:
        raise HTTPException(
            status_code=413,
            detail={
                "code": exc.code,
                "message": exc.message,
                "details": {"max_upload_bytes": settings.max_upload_bytes},
            },
        ) from exc
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

    return StudyUploadResponse(
        items=[
            StudySummary.model_validate(d)
            for d in svc.studies_to_dicts(studies, include_series=True)
        ],
        total=len(studies),
    )


@router.get("/studies", response_model=Page[StudySummary])
def list_studies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    modality: str | None = None,
    body_part: str | None = None,
    q: str | None = None,
    svc: StudyService = Depends(get_study_service),
) -> Page[StudySummary]:
    rows, total = svc.list_studies(page=page, page_size=page_size, modality=modality, body_part=body_part, q=q)
    return Page(
        items=[
            StudySummary.model_validate(d)
            for d in svc.studies_to_dicts(rows, include_series=True)
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/studies/{study_uid}", response_model=StudySummary)
def get_study(study_uid: str, svc: StudyService = Depends(get_study_service)) -> StudySummary:
    study = svc.get_study(study_uid)
    if study is None:
        raise HTTPException(status_code=404, detail={"code": "STUDY_NOT_FOUND", "message": study_uid})
    last_map = svc.last_tasks_for_studies([study_uid])
    return StudySummary.model_validate(
        svc.study_to_dict(study, include_series=True, last_task=last_map.get(study_uid))
    )


@router.post("/studies/seed-demo", response_model=StudySummary)
def seed_demo(svc: StudyService = Depends(get_study_service)) -> StudySummary:
    study = svc.ensure_demo_data()
    last_map = svc.last_tasks_for_studies([study.study_uid])
    return StudySummary.model_validate(
        svc.study_to_dict(study, include_series=True, last_task=last_map.get(study.study_uid))
    )