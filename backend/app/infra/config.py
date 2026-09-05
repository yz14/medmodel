from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = ROOT_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VOXFLOW_", env_file=".env", extra="ignore")

    app_name: str = "VoxFlow"
    app_version: str = "0.1.0"
    debug: bool = True
    api_prefix: str = "/api/v1"

    data_dir: Path = PROJECT_ROOT / "data"
    storage_dir: Path = PROJECT_ROOT / "storage"
    database_url: str | None = None

    task_max_concurrency: int = 2
    task_fake_latency_scale: float = 1.0
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ]
    )

    @field_validator("data_dir", "storage_dir", mode="before")
    @classmethod
    def _as_path(cls, value: object) -> Path:
        return Path(str(value))

    @model_validator(mode="after")
    def _default_db_url(self) -> Settings:
        if not self.database_url:
            self.database_url = f"sqlite:///{(self.data_dir / 'voxflow.db').as_posix()}"
        return self

    @property
    def studies_dir(self) -> Path:
        return self.storage_dir / "studies"

    @property
    def tasks_dir(self) -> Path:
        return self.storage_dir / "tasks"

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.studies_dir.mkdir(parents=True, exist_ok=True)
        self.tasks_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings

