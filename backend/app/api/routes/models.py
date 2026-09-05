from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_model_service
from app.api.schemas import ModelListResponse, ModelPatchRequest, ModelReadyResponse, ModelSpec
from app.models_hub.registry import registry
from app.services.model_service import ModelService

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
def list_models(
    enabled_only: bool = Query(False),
    svc: ModelService = Depends(get_model_service),
) -> ModelListResponse:
    items = svc.list_models(enabled_only=enabled_only)
    return ModelListResponse(items=[ModelSpec.model_validate(i) for i in items], total=len(items))


@router.get("/{model_id}/ready", response_model=ModelReadyResponse)
def model_ready(model_id: str, svc: ModelService = Depends(get_model_service)) -> ModelReadyResponse:
    try:
        model = svc.get_model(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "MODEL_NOT_FOUND", "message": str(exc)}) from exc
    plugin_ok = model_id in registry
    enabled = bool(model.get("enabled", True))
    ready = plugin_ok and enabled
    if not plugin_ok:
        message = "插件未注册"
    elif not enabled:
        message = "模型已禁用"
    else:
        message = "模型可用"
    return ModelReadyResponse(
        model_id=model_id,
        ready=ready,
        enabled=enabled,
        version=str(model.get("version") or ""),
        message=message,
    )


@router.get("/{model_id}", response_model=ModelSpec)
def get_model(model_id: str, svc: ModelService = Depends(get_model_service)) -> ModelSpec:
    try:
        return ModelSpec.model_validate(svc.get_model(model_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "MODEL_NOT_FOUND", "message": str(exc)}) from exc


@router.patch("/{model_id}", response_model=ModelSpec)
def patch_model(
    model_id: str,
    body: ModelPatchRequest,
    svc: ModelService = Depends(get_model_service),
) -> ModelSpec:
    try:
        return ModelSpec.model_validate(
            svc.patch_model(model_id, enabled=body.enabled, default_params=body.default_params)
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "MODEL_NOT_FOUND", "message": str(exc)}) from exc

