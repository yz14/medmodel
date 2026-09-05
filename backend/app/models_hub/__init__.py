from __future__ import annotations

import logging
from importlib import import_module

from app.models_hub.registry import registry

logger = logging.getLogger(__name__)

_PLUGIN_MODULES = [
    "app.models_hub.lung_seg",
    "app.models_hub.nodule_seg",
    "app.models_hub.nodule_det",
    "app.models_hub.nodule_cls",
]


def load_all_plugins() -> None:
    """Scan and register built-in model plugins (idempotent)."""
    for module_name in _PLUGIN_MODULES:
        module = import_module(module_name)
        plugin = getattr(module, "plugin", None)
        if plugin is None:
            logger.warning("plugin_missing module=%s", module_name)
            continue
        model_id = plugin.spec.id
        if model_id in registry:
            continue
        registry.register(plugin)
        plugin.load()
    logger.info("plugins_loaded count=%s", len(registry))


__all__ = ["load_all_plugins", "registry"]
