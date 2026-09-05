from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.infra.config import get_settings


class Base(DeclarativeBase):
    pass


engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None


def configure_engine(database_url: str | None = None) -> Engine:
    """Create/replace global engine + session factory (call from app startup / tests)."""
    global engine, SessionLocal
    settings = get_settings()
    url = database_url or settings.database_url
    if not url:
        raise RuntimeError("database_url is not configured")
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    new_engine = create_engine(url, connect_args=connect_args, future=True, echo=False)

    if url.startswith("sqlite"):

        @event.listens_for(new_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    if engine is not None:
        engine.dispose()

    engine = new_engine
    SessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    return engine


def _require_session_factory() -> sessionmaker[Session]:
    if SessionLocal is None:
        configure_engine()
    assert SessionLocal is not None
    return SessionLocal


def init_db() -> None:
    from app.infra import orm  # noqa: F401

    eng = engine or configure_engine()
    Base.metadata.create_all(bind=eng)


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    factory = _require_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    factory = _require_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

