from __future__ import annotations

from redis import Redis
from rq import Queue

from app.core.config import settings


def get_redis_connection() -> Redis:
    return Redis.from_url(settings.redis_url)


def get_notification_queue() -> Queue:
    return Queue(
        name=settings.notification_queue_name,
        connection=get_redis_connection(),
        default_timeout=settings.notification_queue_job_timeout_seconds,
    )


def check_redis_connection() -> bool:
    return bool(get_redis_connection().ping())
