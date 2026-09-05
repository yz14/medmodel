from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

from app.infra.config import Settings, get_settings

# DICOM UI VR: digits and dots only (no path separators / traversal)
_UID_RE = re.compile(r"^[0-9]+(?:\.[0-9]+)*$")
_TASK_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def validate_dicom_uid(uid: str, *, field: str = "uid") -> str:
    if not uid or not _UID_RE.fullmatch(uid) or len(uid) > 128:
        raise ValueError(f"非法 DICOM UID ({field})")
    return uid


def validate_task_id(task_id: str) -> str:
    if not task_id or not _TASK_ID_RE.fullmatch(task_id):
        raise ValueError("非法 task_id")
    return task_id


def uid_dir_name(uid: str) -> str:
    """Short stable FS name — full UIDs nest past Windows MAX_PATH."""
    digest = hashlib.sha256(uid.encode("utf-8")).hexdigest()[:16]
    return digest


class StorageService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.settings.ensure_dirs()

    def study_dir(self, study_uid: str) -> Path:
        validate_dicom_uid(study_uid, field="study_uid")
        path = self.settings.studies_dir / uid_dir_name(study_uid)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def series_dir(self, study_uid: str, series_uid: str) -> Path:
        validate_dicom_uid(study_uid, field="study_uid")
        validate_dicom_uid(series_uid, field="series_uid")
        path = self.study_dir(study_uid) / "series" / uid_dir_name(series_uid)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def task_dir(self, task_id: str) -> Path:
        validate_task_id(task_id)
        path = self.settings.tasks_dir / task_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def resolve_uri(self, uri: str) -> Path:
        """Map storage://relative paths; reject absolute escape outside storage."""
        storage_root = self.settings.storage_dir.resolve()
        if uri.startswith("storage://"):
            rel = uri.removeprefix("storage://")
            path = (self.settings.storage_dir / rel).resolve()
        else:
            path = Path(uri).resolve()
        try:
            path.relative_to(storage_root)
        except ValueError as exc:
            raise ValueError("路径越出 storage 根目录") from exc
        return path

    def to_uri(self, path: Path) -> str:
        path = path.resolve()
        storage = self.settings.storage_dir.resolve()
        rel = path.relative_to(storage)
        return f"storage://{rel.as_posix()}"

    def safe_join_under(self, root: Path, *parts: str) -> Path:
        """Join and ensure result stays under root (path traversal safe)."""
        root_r = root.resolve()
        candidate = root_r.joinpath(*parts).resolve()
        try:
            candidate.relative_to(root_r)
        except ValueError as exc:
            raise ValueError("路径遍历被拒绝") from exc
        return candidate

    def clear_task_dir(self, task_id: str) -> None:
        validate_task_id(task_id)
        path = self.settings.tasks_dir / task_id
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)

