"""Run Alembic migrations programmatically."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from app.infra.logging import get_logger

logger = get_logger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def run_migrations() -> None:
    """Apply pending Alembic revisions (safe to call after create_all)."""
    ini = _BACKEND_ROOT / "alembic.ini"
    if not ini.is_file():
        logger.warning("alembic_ini_missing", path=str(ini))
        return
    cfg = Config(str(ini))
    cfg.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))
    try:
        command.upgrade(cfg, "head")
        logger.info("alembic_upgrade_ok")
    except Exception:  # noqa: BLE001
        logger.exception("alembic_upgrade_failed")
        raise
