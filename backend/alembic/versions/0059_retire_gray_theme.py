"""retire the gray theme

The gray theme was removed from the app: `coerceThemePreference` maps it to `light` and the
stylesheet has no `[data-theme="gray"]` block, so a user who still had it stored simply got the
light theme — while the database kept a theme that no longer exists. This rewrites those rows so
the stored value matches what the user actually sees, and so `GRAY` can be dropped from
`UserThemePreference` later.

`flexoki` is swept up here too: migration 0040 rewrote it in `theme_preference` but not in
`enabled_theme_options`, so the retired name can still sit in that list.

Revision ID: 0059
Revises: 0058
Create Date: 2026-10-09

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None

# A theme that was removed from the app, and the one its users actually get.
#
# The two columns do not use the same form: `theme_preference` is a SQLAlchemy `Enum` without
# `values_callable`, so it stores the member *name* (upper case in the database), while
# `enabled_theme_options` is a plain JSON list of the member *values*.
_RETIRED_THEME_PREFERENCES = {
    "gray": "LIGHT",
    "flexoki": "LIGHT",
}
_RETIRED_THEME_OPTIONS = {
    "gray": "light",
    "flexoki": "light",
}


def upgrade() -> None:
    bind = op.get_bind()
    users_table = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("theme_preference", sa.String(length=32)),
        sa.column("enabled_theme_options", sa.JSON()),
    )

    rows: Sequence[tuple[int, str | None, list[str] | None]] = bind.execute(
        sa.select(
            users_table.c.id,
            users_table.c.theme_preference,
            users_table.c.enabled_theme_options,
        )
    ).all()

    for user_id, theme_preference, enabled_theme_options in rows:
        next_theme_preference = _retire_preference(theme_preference)
        next_enabled_options = _normalize_enabled_themes(enabled_theme_options)

        if (
            next_theme_preference == theme_preference
            and next_enabled_options == enabled_theme_options
        ):
            continue

        bind.execute(
            users_table.update()
            .where(users_table.c.id == user_id)
            .values(
                theme_preference=next_theme_preference,
                enabled_theme_options=next_enabled_options,
            )
        )


def downgrade() -> None:
    """Deliberately does nothing.

    A retired theme cannot be put back: mapping `light` to `gray` would silently change every user
    who picked the light theme themselves. The name stays in the code (`coerceThemePreference`
    still reads a stale value), so nothing breaks without it.
    """


def _retire_preference(value: str | None) -> str | None:
    if not isinstance(value, str):
        return value
    return _RETIRED_THEME_PREFERENCES.get(value.lower(), value)


def _retire_option(value: str | None) -> str | None:
    if not isinstance(value, str):
        return value
    return _RETIRED_THEME_OPTIONS.get(value.lower(), value)


def _normalize_enabled_themes(values: list[str] | None) -> list[str] | None:
    if not isinstance(values, list):
        return values

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_value in values:
        value = _retire_option(raw_value)
        if not isinstance(value, str) or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized
