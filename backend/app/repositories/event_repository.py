from __future__ import annotations

from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.event import EventCategory, EventLog


class EventLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, event: EventLog) -> EventLog:
        self.session.add(event)
        self.session.flush()
        return event

    def list_all(
        self,
        *,
        query: str | None = None,
        category: EventCategory | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 200,
    ) -> list[EventLog]:
        statement = select(EventLog).order_by(EventLog.created_at.desc(), EventLog.id.desc())

        if category is not None:
            statement = statement.where(EventLog.category == category)

        if date_from is not None:
            statement = statement.where(EventLog.event_date >= date_from)

        if date_to is not None:
            statement = statement.where(EventLog.event_date <= date_to)

        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    EventLog.title.ilike(pattern),
                    EventLog.description.ilike(pattern),
                    EventLog.user_display_name.ilike(pattern),
                    EventLog.equipment_name.ilike(pattern),
                    EventLog.folder_name.ilike(pattern),
                    EventLog.batch_key.ilike(pattern),
                )
            )

        statement = statement.limit(max(1, min(limit, 500)))
        return list(self.session.scalars(statement))
