from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.router import api_router
from app.infra.config import get_settings
from app.infra.db import configure_engine, init_db, session_scope
from app.infra.logging import bind_trace_id, get_logger, setup_logging, trace_id_var
from app.infra.queue import get_task_queue
from app.models_hub import load_all_plugins
from app.services.study_service import StudyService

logger = get_logger(__name__)


def _error_body(code: str, message: str, *, details: object | None = None) -> dict:
    return {
        "code": code,
        "message": message,
        "details": details,
        "trace_id": trace_id_var.get(),
    }


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    setup_logging(settings.debug)
    settings.ensure_dirs()
    configure_engine()
    init_db()
    load_all_plugins()
    queue = get_task_queue()

    from app.services.task_service import TaskService

    with session_scope() as db:
        requeue_ids = TaskService(db).reconcile_after_restart()

    await queue.start()
    with session_scope() as db:
        svc = TaskService(db)
        for task_id in requeue_ids:
            await svc.enqueue(task_id)

    with session_scope() as db:
        StudyService(db).ensure_demo_data()

    logger.info("app_started", version=__version__, requeued=len(requeue_ids))
    yield
    await queue.stop()
    logger.info("app_stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Trace-Id",
            "X-VoxFlow-Width",
            "X-VoxFlow-Height",
            "X-VoxFlow-Dtype",
            "X-VoxFlow-Window-Center",
            "X-VoxFlow-Window-Width",
            "X-VoxFlow-Photometric",
            "X-VoxFlow-Slope",
            "X-VoxFlow-Intercept",
        ],
    )

    @app.middleware("http")
    async def trace_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        trace_id = bind_trace_id(request.headers.get("X-Trace-Id"))
        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        return response

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            body = _error_body(str(detail["code"]), str(detail["message"]), details=detail.get("details"))
        elif isinstance(detail, dict):
            body = _error_body("HTTP_ERROR", str(detail.get("message") or detail), details=detail)
        else:
            body = _error_body("HTTP_ERROR", str(detail))
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_body("VALIDATION_ERROR", "请求参数校验失败", details=exc.errors()),
        )

    @app.exception_handler(Exception)
    async def unhandled_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", error=str(exc))
        return JSONResponse(
            status_code=500,
            content=_error_body("INTERNAL_ERROR", "服务器内部错误"),
        )

    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()

