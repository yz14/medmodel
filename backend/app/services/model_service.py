from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.contracts import ModelSpec
from app.infra.orm import ModelStateRow
from app.models_hub.registry import registry


class ModelService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _state_map(self) -> dict[str, ModelStateRow]:
        rows = self.db.scalars(select(ModelStateRow)).all()
        return {r.model_id: r for r in rows}

    def list_models(self, enabled_only: bool = False) -> list[dict[str, Any]]:
        states = self._state_map()
        items: list[dict[str, Any]] = []
        for plugin in registry.list_plugins():
            spec = plugin.spec
            state = states.get(spec.id)
            enabled = state.enabled if state is not None else spec.enabled
            if enabled_only and not enabled:
                continue
            items.append(self._spec_to_dict(spec, enabled=enabled, default_params=state.default_params if state else None))
        items.sort(key=lambda x: x["id"])
        return items

    def get_model(self, model_id: str) -> dict[str, Any]:
        plugin = registry.get(model_id)
        state = self.db.scalar(select(ModelStateRow).where(ModelStateRow.model_id == model_id))
        enabled = state.enabled if state is not None else plugin.spec.enabled
        return self._spec_to_dict(
            plugin.spec,
            enabled=enabled,
            default_params=state.default_params if state else None,
        )

    def patch_model(self, model_id: str, enabled: bool | None = None, default_params: dict[str, Any] | None = None) -> dict[str, Any]:
        if model_id not in registry:
            raise KeyError(model_id)
        state = self.db.scalar(select(ModelStateRow).where(ModelStateRow.model_id == model_id))
        if state is None:
            state = ModelStateRow(model_id=model_id, enabled=True, default_params=None)
            self.db.add(state)
        if enabled is not None:
            state.enabled = enabled
        if default_params is not None:
            state.default_params = default_params
        self.db.flush()
        return self.get_model(model_id)

    def is_enabled(self, model_id: str) -> bool:
        plugin = registry.get(model_id)
        state = self.db.scalar(select(ModelStateRow).where(ModelStateRow.model_id == model_id))
        return state.enabled if state is not None else plugin.spec.enabled

    @staticmethod
    def _spec_to_dict(spec: ModelSpec, *, enabled: bool, default_params: dict[str, Any] | None) -> dict[str, Any]:
        return {
            "id": spec.id,
            "name": spec.name,
            "version": spec.version,
            "task_type": spec.task_type.value,
            "modalities": [m.value for m in spec.modalities],
            "body_parts": spec.body_parts,
            "description": spec.description,
            "input_constraints": spec.input_constraints,
            "params_schema": spec.params_schema,
            "outputs": [
                {
                    "name": o.name,
                    "result_type": o.result_type.value,
                    "description": o.description,
                }
                for o in spec.outputs
            ],
            "metrics": spec.metrics,
            "expected_latency_ms": spec.expected_latency_ms,
            "enabled": enabled,
            "tags": spec.tags,
            "default_params": default_params or {},
        }

