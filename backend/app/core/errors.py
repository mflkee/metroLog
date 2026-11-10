"""Единый формат ошибок API.

Каждый ответ с ошибкой выглядит одинаково::

    {"detail": "...", "error_code": "NOT_FOUND", "field": null}

``detail`` остаётся строкой: фронтенд и существующие тесты читают его как сообщение, поэтому
``error_code`` и ``field`` только добавляются. ``error_code`` — машиночитаемая причина,
``field`` — первое невалидное поле запроса (``null``, если ошибка не про поле).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

ERROR_CODE_BY_STATUS: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
    status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
    status.HTTP_403_FORBIDDEN: "FORBIDDEN",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    status.HTTP_409_CONFLICT: "CONFLICT",
    status.HTTP_413_CONTENT_TOO_LARGE: "PAYLOAD_TOO_LARGE",
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
    status.HTTP_422_UNPROCESSABLE_CONTENT: "VALIDATION_ERROR",
    status.HTTP_429_TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_ERROR",
}

# ``loc`` из pydantic начинается с части запроса; в ``field`` она лишняя.
_REQUEST_PART_LOCATIONS = frozenset({"body", "query", "path", "header", "cookie"})

INTERNAL_ERROR_DETAIL = "Internal server error."


class AppError(HTTPException):
    """База доменных ошибок.

    Наследование от ``HTTPException`` сохраняет работу всех существующих ``except HTTPException``
    и обработку в FastAPI; ``error_code``/``field`` добавляются глобальными обработчиками.
    """

    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "BAD_REQUEST"
    default_detail = "Request could not be processed."

    def __init__(
        self,
        detail: str | None = None,
        *,
        field: str | None = None,
        error_code: str | None = None,
        status_code: int | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        self.field = field
        self.error_code = error_code or type(self).error_code
        super().__init__(
            status_code=status_code or type(self).status_code,
            detail=detail or type(self).default_detail,
            headers=dict(headers) if headers is not None else None,
        )


class NotFoundError(AppError):
    """Ресурс не существует или недоступен пользователю."""

    status_code = status.HTTP_404_NOT_FOUND
    error_code = "NOT_FOUND"
    default_detail = "Resource not found."


class ConflictError(AppError):
    """Запрос противоречит текущему состоянию данных."""

    status_code = status.HTTP_409_CONFLICT
    error_code = "CONFLICT"
    default_detail = "Request conflicts with the current state of the resource."


class ForbiddenError(AppError):
    """Прав на операцию нет."""

    status_code = status.HTTP_403_FORBIDDEN
    error_code = "FORBIDDEN"
    default_detail = "Not enough permissions."


class ValidationError(AppError):
    """Доменная проверка запроса (не путать с ``pydantic.ValidationError``)."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    error_code = "VALIDATION_ERROR"
    default_detail = "Request validation failed."


def error_response(
    *,
    status_code: int,
    detail: str,
    error_code: str,
    field: str | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "error_code": error_code, "field": field},
        headers=dict(headers) if headers is not None else None,
    )


def http_error_code(status_code: int) -> str:
    fallback = "INTERNAL_ERROR" if status_code >= 500 else "HTTP_ERROR"
    return ERROR_CODE_BY_STATUS.get(status_code, fallback)


def validation_field(location: tuple[Any, ...]) -> str | None:
    """Первое невалидное поле из ``loc``: ``("body", "payload", "name")`` → ``"payload.name"``."""

    parts = [str(part) for part in location if str(part) not in _REQUEST_PART_LOCATIONS]
    return ".".join(parts) or None


def _error_code_of(exc: HTTPException) -> str:
    explicit = getattr(exc, "error_code", None)
    return explicit if isinstance(explicit, str) and explicit else http_error_code(exc.status_code)


def _field_of(exc: HTTPException) -> str | None:
    field = getattr(exc, "field", None)
    return field if isinstance(field, str) else None


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return error_response(
        status_code=exc.status_code,
        detail=str(exc.detail),
        error_code=_error_code_of(exc),
        field=_field_of(exc),
        headers=exc.headers,
    )


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return error_response(
        status_code=exc.status_code,
        detail=str(exc.detail),
        error_code=_error_code_of(exc),
        field=_field_of(exc),
        headers=exc.headers,
    )


async def request_validation_exception_handler(
    _: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    field = validation_field(tuple(first.get("loc", ())))
    message = str(first.get("msg") or "Request validation failed.")
    detail = f"Validation failed for field '{field}': {message}" if field else message
    return error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=detail,
        error_code="VALIDATION_ERROR",
        field=field,
    )


class InternalErrorMiddleware:
    """Превращает непойманное исключение в стандартный конверт ошибки.

    ``app.add_exception_handler(Exception, ...)`` тоже подошёл бы, но ``ServerErrorMiddleware``
    Starlette после отправки ответа перевыбрасывает исключение — клиент получает JSON, а тесты и
    сервер видят трейсбек. Этот middleware отвечает сам (и пишет трейсбек в лог), поэтому наружу
    стектрейс не уходит.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_with_flag(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_with_flag)
        except Exception:
            logger.exception(
                "Unhandled error while processing %s %s",
                scope.get("method"),
                scope.get("path"),
            )
            if response_started:
                raise
            response = error_response(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=INTERNAL_ERROR_DETAIL,
                error_code="INTERNAL_ERROR",
            )
            await response(scope, receive, send)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    # StarletteHTTPException покрывает и fastapi.HTTPException: доменные классы наследуются от него.
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
