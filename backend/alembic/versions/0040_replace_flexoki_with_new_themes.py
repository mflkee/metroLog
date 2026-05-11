"""replace flexoki theme with supported themes

Revision ID: 0040
Revises: 0039
Create Date: 2026-04-02

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


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
        next_theme_preference = "light" if theme_preference == "flexoki" else theme_preference
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
        next_enabled_options = _restore_flexoki(enabled_theme_options)
        if next_enabled_options == enabled_theme_options:
            continue

        bind.execute(
            users_table.update()
            .where(users_table.c.id == user_id)
            .values(
                theme_preference=theme_preference,
                enabled_theme_options=next_enabled_options,
            )
        )


def _normalize_enabled_themes(values: list[str] | None) -> list[str] | None:
    if not isinstance(values, list):
        return values

    normalized: list[str] = []
    seen: set[str] = set()
    for raw_value in values:
        value = "light" if raw_value == "flexoki" else raw_value
        if value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _restore_flexoki(values: list[str] | None) -> list[str] | None:
    if not isinstance(values, list):
        return values
    return ["flexoki" if value == "light" else value for value in values]
