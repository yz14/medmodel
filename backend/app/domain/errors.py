"""Domain-level exceptions shared by plugins and the orchestrator."""

from __future__ import annotations


class TaskCanceled(Exception):
    """Raised when a running task observes a cancel request."""


class VolumeReadError(RuntimeError):
    """Series volume could not be decoded; task must fail (non-phantom)."""

    def __init__(self, message: str, *, code: str = "VOLUME_READ_FAILED") -> None:
        super().__init__(message)
        self.code = code
