"""Enqueue task deadline reminders.

Run periodically (e.g. from a systemd timer or cron):
    python -m app.tasks.task_reminders

Idempotent per (task, day): a task is reminded at most once a day.
"""

from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.services.task_service import send_task_deadline_reminders

logger = logging.getLogger(__name__)


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        sent = send_task_deadline_reminders(session)
    logger.info("task reminders processed: %s", sent)
    return sent


if __name__ == "__main__":
    main()
