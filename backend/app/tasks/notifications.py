from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from app.core.config import settings
from app.services.notification_service import NotificationService
from app.tasks.queue import get_notification_queue

logger = logging.getLogger(__name__)


def send_mention_email_job(
    *,
    recipient_email: str,
    recipient_name: str,
    actor_name: str,
    context_title: str,
    message_preview: str | None,
    target_url: str,
) -> None:
    NotificationService().send_mention_email(
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        actor_name=actor_name,
        context_title=context_title,
        message_preview=message_preview,
        target_url=target_url,
    )


def send_process_update_email_job(
    *,
    recipient_email: str,
    recipient_name: str,
    actor_name: str,
    process_label: str,
    event_title: str,
    event_description: str | None,
    target_url: str,
) -> None:
    NotificationService().send_process_update_email(
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        actor_name=actor_name,
        process_label=process_label,
        event_title=event_title,
        event_description=event_description,
        target_url=target_url,
    )


def enqueue_mention_email(
    *,
    recipient_email: str,
    recipient_name: str,
    actor_name: str,
    context_title: str,
    message_preview: str | None,
    target_url: str,
) -> None:
    payload = {
        "recipient_email": recipient_email,
        "recipient_name": recipient_name,
        "actor_name": actor_name,
        "context_title": context_title,
        "message_preview": message_preview,
        "target_url": target_url,
    }
    _enqueue_notification_job(
        job_func=send_mention_email_job,
        job_name="mention email",
        payload=payload,
        fallback=lambda: NotificationService().send_mention_email(**payload),
    )


def enqueue_process_update_email(
    *,
    recipient_email: str,
    recipient_name: str,
    actor_name: str,
    process_label: str,
    event_title: str,
    event_description: str | None,
    target_url: str,
) -> None:
    payload = {
        "recipient_email": recipient_email,
        "recipient_name": recipient_name,
        "actor_name": actor_name,
        "process_label": process_label,
        "event_title": event_title,
        "event_description": event_description,
        "target_url": target_url,
    }
    _enqueue_notification_job(
        job_func=send_process_update_email_job,
        job_name="process update email",
        payload=payload,
        fallback=lambda: NotificationService().send_process_update_email(**payload),
    )


def _enqueue_notification_job(
    *,
    job_func: Callable[..., None],
    job_name: str,
    payload: dict[str, Any],
    fallback: Callable[[], None],
) -> None:
    if not settings.notification_queue_enabled:
        fallback()
        return

    try:
        get_notification_queue().enqueue_call(
            func=job_func,
            kwargs=payload,
            result_ttl=settings.notification_queue_result_ttl_seconds,
            failure_ttl=settings.notification_queue_failure_ttl_seconds,
        )
    except Exception:
        logger.exception(
            "Failed to enqueue %s on queue %s. Falling back to direct delivery.",
            job_name,
            settings.notification_queue_name,
        )
        fallback()
