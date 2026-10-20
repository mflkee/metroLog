import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import SessionLocal
from app.repositories.equipment_repository import EquipmentRepository
from app.services.user_service import UserService

logger = logging.getLogger(__name__)

# Every uvicorn worker runs the lifespan, so start-up maintenance is single-flight.
_STARTUP_ADVISORY_LOCK_KEY = 771_002


def normalize_equipment_statuses_once(session: Session) -> bool:
    """Heal transient equipment statuses left behind by an earlier failure.

    This used to run inside the equipment read paths, which turned every registry page and every
    equipment card into a full-table write and, on 2026-10-19, into a lock chain that froze the
    service for eleven hours. Reads are read-only now, so leftovers are repaired once at start-up.

    Returns ``True`` when this session performed the normalisation. Every uvicorn worker runs the
    lifespan, so on PostgreSQL the work is claimed with an advisory lock and the losers skip it.
    """

    is_postgres = session.get_bind().dialect.name == "postgresql"
    if is_postgres and not bool(
        session.scalar(
            text("SELECT pg_try_advisory_lock(:key)"),
            {"key": _STARTUP_ADVISORY_LOCK_KEY},
        )
    ):
        return False
    try:
        EquipmentRepository(session).normalize_transient_statuses()
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to normalize equipment statuses at startup")
        return False
    finally:
        if is_postgres:
            session.execute(
                text("SELECT pg_advisory_unlock(:key)"),
                {"key": _STARTUP_ADVISORY_LOCK_KEY},
            )
            session.commit()
    return True


def _normalize_equipment_statuses_at_startup() -> None:
    with SessionLocal() as session:
        normalize_equipment_statuses_once(session)


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as session:
        UserService(session).ensure_bootstrap_admin()
    _normalize_equipment_statuses_at_startup()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
