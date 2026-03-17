from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.api.deps import DbSession
from app.core.config import settings
from app.schemas.health import HealthStatus, ReadinessStatus
from app.tasks.queue import check_redis_connection

router = APIRouter()


@router.get("/health", response_model=HealthStatus)
async def healthcheck() -> HealthStatus:
    return HealthStatus(status="ok", service="backend", environment=settings.app_env)


@router.get("/health/ready", response_model=ReadinessStatus)
async def readiness_check(db: DbSession) -> ReadinessStatus:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed.",
        ) from exc

    if not settings.notification_queue_enabled:
        return ReadinessStatus(status="ready", database="ok", redis="disabled")

    try:
        redis_ok = check_redis_connection()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis connection failed.",
        ) from exc

    if not redis_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis connection failed.",
        )

    return ReadinessStatus(status="ready", database="ok", redis="ok")
