from __future__ import annotations

import logging

from app.domain.contracts import ModelPlugin, ModelSpec

logger = logging.getLogger(__name__)


class ModelRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, ModelPlugin] = {}

    def register(self, plugin: ModelPlugin) -> None:
        model_id = plugin.spec.id
        if model_id in self._plugins:
            raise ValueError(f"Model already registered: {model_id}")
        self._plugins[model_id] = plugin
        logger.info("model_registered model_id=%s version=%s", model_id, plugin.spec.version)

    def get(self, model_id: str) -> ModelPlugin:
        try:
            return self._plugins[model_id]
        except KeyError as exc:
            raise KeyError(f"Unknown model: {model_id}") from exc

    def list_specs(self) -> list[ModelSpec]:
        return [p.spec for p in self._plugins.values()]

    def list_plugins(self) -> list[ModelPlugin]:
        return list(self._plugins.values())

    def __contains__(self, model_id: str) -> bool:
        return model_id in self._plugins

    def __len__(self) -> int:
        return len(self._plugins)


registry = ModelRegistry()
