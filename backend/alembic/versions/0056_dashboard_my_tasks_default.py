"""turn the «Мои задачи» dashboard widget on for everybody

The widget is part of the defaults, but anybody who had ever saved their dashboard settings kept an
older stored list without it, so the widget stayed hidden. This appends the key once, for people who
have a stored list; from then on their own choice (including turning it off) is respected.

Revision ID: 0056
Revises: 0055
Create Date: 2026-10-09

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None

_WIDGET = "my_tasks"

_USERS = sa.table(
    "users",
    sa.column("id", sa.Integer),
    sa.column("dashboard_widget_options", sa.JSON),
)


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(_USERS.c.id, _USERS.c.dashboard_widget_options).where(
            _USERS.c.dashboard_widget_options.isnot(None)
        )
    ).fetchall()
    for user_id, options in rows:
        current = options if isinstance(options, list) else []
        if _WIDGET in current:
            continue
        connection.execute(
            _USERS.update()
            .where(_USERS.c.id == user_id)
            .values(dashboard_widget_options=[*current, _WIDGET])
        )


def downgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(_USERS.c.id, _USERS.c.dashboard_widget_options).where(
            _USERS.c.dashboard_widget_options.isnot(None)
        )
    ).fetchall()
    for user_id, options in rows:
        current = options if isinstance(options, list) else []
        if _WIDGET not in current:
            continue
        connection.execute(
            _USERS.update()
            .where(_USERS.c.id == user_id)
            .values(dashboard_widget_options=[value for value in current if value != _WIDGET])
        )
