from __future__ import annotations

import asyncio
import traceback
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.infra.logging import get_logger

logger = get_logger(__name__)

EventListener = Callable[[dict[str, Any]], Awaitable[None] | None]


@dataclass
class QueueStats:
    queued: int = 0
    running: int = 0
    max_concurrency: int = 1


@dataclass
class TaskQueue:
    """In-process async queue with concurrency limit (Celery-compatible interface shape)."""

    max_concurrency: int = 2
    _queue: asyncio.Queue[tuple[str, Callable[[], Awaitable[None]]]] = field(
        default_factory=asyncio.Queue
    )
    _running: set[str] = field(default_factory=set)
    _pending: set[str] = field(default_factory=set)
    _canceled: set[str] = field(default_factory=set)
    _workers: list[asyncio.Task[None]] = field(default_factory=list)
    _listeners: list[EventListener] = field(default_factory=list)
    _started: bool = False
    _loop: asyncio.AbstractEventLoop | None = None

    async def start(self) -> None:
        if self._started:
            return
        # Recreate queue on the current event loop (TestClient starts/stops loops).
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue()
        self._running.clear()
        self._pending.clear()
        self._canceled.clear()
        self._workers.clear()
        self._started = True
        for i in range(self.max_concurrency):
            self._workers.append(asyncio.create_task(self._worker_loop(i), name=f"task-worker-{i}"))
        logger.info("task_queue_started", max_concurrency=self.max_concurrency)

    async def stop(self) -> None:
        for worker in self._workers:
            worker.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        self._started = False
        self._loop = None

    def subscribe(self, listener: EventListener) -> Callable[[], None]:
        self._listeners.append(listener)

        def unsubscribe() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return unsubscribe

    async def emit(self, event: dict[str, Any]) -> None:
        from app.infra.timeutil import utc_iso

        event.setdefault("ts", utc_iso(datetime.now(timezone.utc)))
        for listener in list(self._listeners):
            try:
                result = listener(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:  # noqa: BLE001
                logger.exception("event_listener_failed")

    def emit_threadsafe(self, event: dict[str, Any]) -> None:
        """Emit from worker threads onto the loop captured at start()."""
        loop = self._loop
        if loop is None or not loop.is_running():
            logger.warning("emit_threadsafe_no_loop", event_type=event.get("type"))
            return
        asyncio.run_coroutine_threadsafe(self.emit(event), loop)

    async def enqueue(self, task_id: str, coro_factory: Callable[[], Awaitable[None]]) -> None:
        if task_id in self._pending or task_id in self._running:
            logger.info("enqueue_dedup_skip", task_id=task_id)
            return
        self._pending.add(task_id)
        await self._queue.put((task_id, coro_factory))
        await self.emit({"type": "queued", "task_id": task_id})

    def request_cancel(self, task_id: str) -> None:
        self._canceled.add(task_id)

    def is_canceled(self, task_id: str) -> bool:
        return task_id in self._canceled

    def clear_canceled(self, task_id: str) -> None:
        self._canceled.discard(task_id)

    def stats(self) -> QueueStats:
        return QueueStats(
            queued=self._queue.qsize(),
            running=len(self._running),
            max_concurrency=self.max_concurrency,
        )

    async def _worker_loop(self, worker_id: int) -> None:
        while True:
            task_id, factory = await self._queue.get()
            self._pending.discard(task_id)
            if self.is_canceled(task_id):
                self.clear_canceled(task_id)
                await self.emit({"type": "canceled", "task_id": task_id, "status": "canceled"})
                self._queue.task_done()
                continue
            self._running.add(task_id)
            await self.emit({"type": "running", "task_id": task_id, "worker_id": worker_id, "status": "running"})
            try:
                await factory()
            except asyncio.CancelledError:
                await self.emit({"type": "canceled", "task_id": task_id, "status": "canceled"})
                raise
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "task_worker_error",
                    task_id=task_id,
                    error=str(exc),
                    traceback=traceback.format_exc(),
                )
                await self.emit(
                    {
                        "type": "failed",
                        "task_id": task_id,
                        "status": "failed",
                        "error": str(exc),
                    }
                )
            finally:
                self._running.discard(task_id)
                self._pending.discard(task_id)
                self.clear_canceled(task_id)
                self._queue.task_done()


_queue: TaskQueue | None = None


def get_task_queue() -> TaskQueue:
    global _queue
    if _queue is None:
        from app.infra.config import get_settings

        _queue = TaskQueue(max_concurrency=get_settings().task_max_concurrency)
    return _queue


def reset_task_queue_for_tests() -> None:
    """Test helper: drop singleton so next get_task_queue() rebuilds."""
    global _queue
    _queue = None
