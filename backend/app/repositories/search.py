"""Term-based text search, shared by every list query that takes a `query` parameter.

Every whitespace-separated term has to match at least one of the columns — the order does not matter
and the terms may live in different fields. That is what makes «Мкаир Кужим» find a user whose
organisation and surname say so, and «При 81» find an instrument whose name and number are two
different columns; the plain `%При 81%` substring found neither.

Case folding is left to the database: `ILIKE` knows the locale in PostgreSQL, while SQLite's
`lower()` only handles ASCII — folding the case in Python would *lose* the case PostgreSQL is
happy to ignore. Only «ё» is folded here, because it is spelled «е» often enough that the two
have to match.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import and_, func, or_
from sqlalchemy.sql.elements import ColumnElement


def _fold_yo_text(value: str) -> str:
    return value.replace("ё", "е").replace("Ё", "Е")


def _fold_yo_column(column: object) -> ColumnElement[str]:
    return func.replace(func.replace(column, "ё", "е"), "Ё", "Е")


def search_condition(
    columns: Sequence[object],
    query: str | None,
) -> ColumnElement[bool] | None:
    """The `where` clause for a search box, or `None` when there is nothing to search for."""
    terms = [
        folded
        for folded in (_fold_yo_text(part).strip() for part in (query or "").split())
        if folded
    ]
    if not terms:
        return None

    return and_(
        *[
            or_(*[_fold_yo_column(column).ilike(f"%{term}%") for column in columns])
            for term in terms
        ]
    )
