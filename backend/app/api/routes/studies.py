from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.api.deps import get_study_service
from app.api.schemas import Page, StudySummary, StudyUploadResponse
from app.services.study_service import StudyService

router = APIRouter(tags=["studies"])


@router.post("/studies/upload", response_model=StudyUploadResponse)
async def upload_studies(
    files: list[UploadFile] = File(...),
    svc: StudyService = Depends(get_study_service),
) -> StudyUploadResponse:
    payload: list[tuple[str, bytes]] = []
    for f in files:
        content = await f.read()
        payload.append((f.filename or "upload.dcm", content))
    try:
        studies = await asyncio.to_thread(svc.upload, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "UPLOAD_INVALID", "message": str(exc)}) from exc
    return StudyUploadResponse(
        items=[StudySummary.model_validate(svc.study_to_dict(s, include_series=True)) for s in studies],
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
        items=[StudySummary.model_validate(svc.study_to_dict(s, include_series=True)) for s in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/studies/{study_uid}", response_model=StudySummary)
def get_study(study_uid: str, svc: StudyService = Depends(get_study_service)) -> StudySummary:
    study = svc.get_study(study_uid)
    if study is None:
        raise HTTPException(status_code=404, detail={"code": "STUDY_NOT_FOUND", "message": study_uid})
    return StudySummary.model_validate(svc.study_to_dict(study, include_series=True))


@router.post("/studies/seed-demo", response_model=StudySummary)
def seed_demo(svc: StudyService = Depends(get_study_service)) -> StudySummary:
    study = svc.ensure_demo_data()
    return StudySummary.model_validate(svc.study_to_dict(study, include_series=True))

