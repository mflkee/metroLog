from __future__ import annotations

import logging

from rq import Worker

from app.tasks.queue import get_notification_queue

logger = logging.getLogger(__name__)


def main() -> None:
    queue = get_notification_queue()
    logger.info("Starting RQ worker for queue %s", queue.name)
    worker = Worker([queue], connection=queue.connection)
    worker.work()


if __name__ == "__main__":
    main()
