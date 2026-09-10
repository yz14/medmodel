from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response

from app.api.deps import get_storage, get_study_service
from app.api.schemas import InstanceItem, InstanceListResponse, SeriesSummary
from app.imaging.pixel_decode import PixelDecodeError, decode_dicom_file
from app.infra.storage import StorageService
from app.services.study_service import StudyService

router = APIRouter(prefix="/series", tags=["series"])

_PIXEL_EXPOSE = (
    "X-VoxFlow-Width",
    "X-VoxFlow-Height",
    "X-VoxFlow-Dtype",
    "X-VoxFlow-Window-Center",
    "X-VoxFlow-Window-Width",
    "X-VoxFlow-Photometric",
    "X-VoxFlow-Slope",
    "X-VoxFlow-Intercept",
)


@router.get("/{series_uid}", response_model=SeriesSummary)
def get_series(series_uid: str, svc: StudyService = Depends(get_study_service)) -> SeriesSummary:
    series = svc.get_series(series_uid)
    if series is None:
        raise HTTPException(status_code=404, detail={"code": "SERIES_NOT_FOUND", "message": series_uid})
    return SeriesSummary.model_validate(svc.series_to_dict(series))


@router.get("/{series_uid}/instances", response_model=InstanceListResponse)
def list_instances(series_uid: str, svc: StudyService = Depends(get_study_service)) -> InstanceListResponse:
    series = svc.get_series(series_uid)
    if series is None:
        raise HTTPException(status_code=404, detail={"code": "SERIES_NOT_FOUND", "message": series_uid})
    instances = svc.list_instances(series_uid)
    items = [
        InstanceItem(
            sop_uid=i.sop_uid,
            instance_number=i.instance_number,
            slice_index=i.slice_index,
            slice_position=i.slice_position,
            rows=i.rows,
            cols=i.cols,
            frame_url=f"/api/v1/series/{series_uid}/frames/{idx}",
            wadouri=f"wadouri:/api/v1/series/{series_uid}/frames/{idx}",
            pixel_url=f"/api/v1/series/{series_uid}/frames/{idx}/pixel",
        )
        for idx, i in enumerate(instances)
    ]
    return InstanceListResponse(
        items=items,
        total=len(items),
        series=SeriesSummary.model_validate(svc.series_to_dict(series)),
    )


@router.get("/{series_uid}/frames/{idx}")
def get_frame(
    series_uid: str,
    idx: int,
    svc: StudyService = Depends(get_study_service),
) -> FileResponse:
    """Raw DICOM bytes (CS3D / wadouri). Prefer /pixel for the main viewer."""
    instances = svc.list_instances(series_uid)
    if idx < 0 or idx >= len(instances):
        raise HTTPException(status_code=404, detail={"code": "FRAME_NOT_FOUND", "message": f"index {idx}"})
    path = Path(instances[idx].file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail={"code": "FRAME_FILE_MISSING", "message": str(path)})
    return FileResponse(
        path,
        media_type="application/dicom",
        filename=path.name,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/{series_uid}/frames/{idx}/pixel")
def get_frame_pixel(
    series_uid: str,
    idx: int,
    svc: StudyService = Depends(get_study_service),
) -> Response:
    """Decoded float32 LE pixels + metadata headers (TODO-1 #4)."""
    instances = svc.list_instances(series_uid)
    if idx < 0 or idx >= len(instances):
        raise HTTPException(status_code=404, detail={"code": "FRAME_NOT_FOUND", "message": f"index {idx}"})
    path = Path(instances[idx].file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail={"code": "FRAME_FILE_MISSING", "message": str(path)})
    try:
        decoded = decode_dicom_file(path)
    except PixelDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": getattr(exc, "code", "PIXEL_DECODE_FAILED"), "message": str(exc)},
        ) from exc

    headers = {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
        "X-VoxFlow-Width": str(decoded.cols),
        "X-VoxFlow-Height": str(decoded.rows),
        "X-VoxFlow-Dtype": "float32",
        "X-VoxFlow-Photometric": decoded.photometric,
        "X-VoxFlow-Slope": str(decoded.slope),
        "X-VoxFlow-Intercept": str(decoded.intercept),
        "Access-Control-Expose-Headers": ", ".join(_PIXEL_EXPOSE),
    }
    if decoded.window_center is not None:
        headers["X-VoxFlow-Window-Center"] = str(decoded.window_center)
    if decoded.window_width is not None:
        headers["X-VoxFlow-Window-Width"] = str(decoded.window_width)

    body = decoded.pixels.astype("<f4", copy=False).tobytes(order="C")
    return Response(content=body, media_type="application/octet-stream", headers=headers)


@router.get("/{series_uid}/thumbnail")
def get_thumbnail(
    series_uid: str,
    svc: StudyService = Depends(get_study_service),
    _storage: StorageService = Depends(get_storage),
) -> FileResponse:
    series = svc.get_series(series_uid)
    if series is None:
        raise HTTPException(status_code=404, detail={"code": "SERIES_NOT_FOUND", "message": series_uid})
    if not series.thumbnail_path:
        raise HTTPException(status_code=404, detail={"code": "THUMB_MISSING", "message": series_uid})
    path = Path(series.thumbnail_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail={"code": "THUMB_MISSING", "message": series_uid})
    return FileResponse(path, media_type="image/png")
