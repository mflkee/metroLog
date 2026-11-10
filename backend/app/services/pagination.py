"""Пагинация в нотации ``page``/``per_page`` поверх исторических ``limit``/``offset``.

Оба способа живут одновременно: старые клиенты присылают ``limit``/``offset`` (и получают
прежнее поведение), новые — ``page``/``per_page``. Смешивать их в одном запросе нельзя: это
неоднозначно, поэтому конфликт — ``422`` с ``error_code="VALIDATION_ERROR"``.
"""

from __future__ import annotations

from app.core.errors import ValidationError

DEFAULT_LIMIT = 100
MAX_LIMIT = 500
DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 200


def resolve_pagination(
    *,
    limit: int | None = None,
    offset: int | None = None,
    page: int | None = None,
    per_page: int | None = None,
) -> tuple[int, int, int, int]:
    """Вернуть согласованные ``(limit, offset, page, per_page)``.

    ``page``/``per_page`` приоритетнее ``limit``/``offset``, но если пришли и те и другие —
    это ошибка запроса, а не повод молча выбрать одну из нотаций.
    """

    if page is not None or per_page is not None:
        if limit is not None or offset is not None:
            raise ValidationError(
                "Use either page/per_page or limit/offset, not both.",
                field="page" if page is not None else "per_page",
            )
        resolved_per_page = DEFAULT_PER_PAGE if per_page is None else per_page
        if not 1 <= resolved_per_page <= MAX_PER_PAGE:
            raise ValidationError(
                f"per_page must be between 1 and {MAX_PER_PAGE}.",
                field="per_page",
            )
        resolved_page = 1 if page is None else page
        if resolved_page < 1:
            raise ValidationError("page must be greater than or equal to 1.", field="page")
        return (
            resolved_per_page,
            (resolved_page - 1) * resolved_per_page,
            resolved_page,
            resolved_per_page,
        )

    resolved_limit = DEFAULT_LIMIT if limit is None else limit
    if not 1 <= resolved_limit <= MAX_LIMIT:
        raise ValidationError(
            f"limit must be between 1 and {MAX_LIMIT}.",
            field="limit",
        )
    resolved_offset = 0 if offset is None else offset
    if resolved_offset < 0:
        raise ValidationError("offset must be greater than or equal to 0.", field="offset")
    # Историческая нотация: страницу выводим из смещения, чтобы клиенту всегда были доступны
    # все поля ответа, а не только limit/offset.
    return (
        resolved_limit,
        resolved_offset,
        resolved_offset // resolved_limit + 1,
        resolved_limit,
    )


def total_pages(total: int, per_page: int) -> int:
    """Сколько всего страниц занимает ``total`` записей (0, если записей нет)."""

    if total <= 0 or per_page <= 0:
        return 0
    return (total + per_page - 1) // per_page
