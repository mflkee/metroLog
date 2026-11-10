"""Схемы ошибок: единый конверт для всех эндпоинтов."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """Ответ с ошибкой в едином формате.

    ``detail`` остаётся строкой для обратной совместимости с фронтендом и существующими
    клиентами; ``error_code`` даёт машиночитаемую причину, ``field`` — невалидное поле запроса.
    """

    detail: str = Field(
        description="Человекочитаемое описание ошибки (всегда строка).",
        examples=["Equipment not found."],
    )
    error_code: str = Field(
        description=(
            "Машиночитаемый код: NOT_FOUND, CONFLICT, FORBIDDEN, VALIDATION_ERROR, "
            "UNAUTHORIZED, INTERNAL_ERROR и т. п."
        ),
        examples=["NOT_FOUND"],
    )
    field: str | None = Field(
        default=None,
        description="Первое невалидное поле запроса (для VALIDATION_ERROR), иначе null.",
        examples=["per_page"],
    )


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """Описание ошибок для ``responses=`` в маршрутах, чтобы Swagger показывал конверт."""

    descriptions = {
        401: "Требуется аутентификация.",
        403: "Недостаточно прав.",
        404: "Ресурс не найден.",
        409: "Конфликт с текущим состоянием ресурса.",
        422: "Ошибка валидации запроса.",
        500: "Внутренняя ошибка сервера.",
    }
    return {
        code: {"model": ErrorResponse, "description": descriptions.get(code, "Ошибка.")}
        for code in status_codes
    }
