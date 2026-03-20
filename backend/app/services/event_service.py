from __future__ import annotations

from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.models.event import EventCategory
from app.repositories.equipment_repository import EquipmentRepository
from app.repositories.event_repository import EventLogRepository
from app.schemas.event import EventLogRead


class EventService:
    def __init__(self, session: Session) -> None:
        self.events = EventLogRepository(session)
        self.equipment = EquipmentRepository(session)

    def list_events(
        self,
        *,
        query: str | None = None,
        category: EventCategory | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 200,
    ):
        items = self.events.list_all(
            query=query.strip() if query else None,
            category=category,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
        )
        return [self._serialize_event_with_equipment_snapshot(item) for item in items]

    def export_events_xlsx(
        self,
        *,
        query: str | None = None,
        category: EventCategory | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 5000,
    ) -> bytes:
        items = self.list_events(
            query=query,
            category=category,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
        )
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Events"
        sheet.append(
            [
                "Дата",
                "Время",
                "Категория",
                "Действие",
                "Заголовок",
                "Описание",
                "Пользователь",
                "Папка",
                "Прибор",
                "Модификация",
                "Заводской номер",
                "Группа",
            ]
        )
        for item in items:
            created_at = self._to_local_datetime(item.created_at)
            sheet.append(
                [
                    created_at.strftime("%d.%m.%Y"),
                    created_at.strftime("%H:%M"),
                    item.category.value,
                    item.action,
                    item.title,
                    item.description,
                    item.user_display_name,
                    item.folder_name,
                    item.equipment_name,
                    item.equipment_modification,
                    item.equipment_serial_number,
                    item.batch_key,
                ]
            )
        output = BytesIO()
        workbook.save(output)
        workbook.close()
        return output.getvalue()

    def _serialize_event_with_equipment_snapshot(self, item) -> EventLogRead:
        equipment_modification = item.equipment_modification
        equipment_serial_number = item.equipment_serial_number

        if item.equipment_id is not None and (
            equipment_modification is None or equipment_serial_number is None
        ):
            equipment = self.equipment.get_by_id(item.equipment_id)
            if equipment is not None:
                if equipment_modification is None:
                    equipment_modification = equipment.modification
                if equipment_serial_number is None:
                    equipment_serial_number = equipment.serial_number

        return EventLogRead.model_validate(
            {
                "id": item.id,
                "category": item.category,
                "action": item.action,
                "title": item.title,
                "description": item.description,
                "user_id": item.user_id,
                "user_display_name": item.user_display_name,
                "equipment_id": item.equipment_id,
                "equipment_name": item.equipment_name,
                "equipment_modification": equipment_modification,
                "equipment_serial_number": equipment_serial_number,
                "folder_id": item.folder_id,
                "folder_name": item.folder_name,
                "batch_key": item.batch_key,
                "event_date": item.event_date,
                "created_at": item.created_at,
            }
        )

    def _to_local_datetime(self, value: datetime) -> datetime:
        return value.astimezone() if value.tzinfo is not None else value
