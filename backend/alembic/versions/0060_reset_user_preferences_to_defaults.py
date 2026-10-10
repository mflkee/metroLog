"""reset the dashboard widget and theme lists to the default

The owner asked for every widget and every theme to be on for everybody out of the box. A stored
`null` already means «the default» on the read path — the frontend falls back to the whole widget
catalogue and to the whole theme catalogue — so the lists users had saved are cleared here: from now
on a widget or a theme added to the catalogue appears for everybody without another migration, and
the Settings page shows every switch on.

The `theme_preference` column is deliberately left alone: that is the theme the user is looking at,
not the list they may choose from.

Revision ID: 0060
Revises: 0059
Create Date: 2026-10-10

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None

_USERS = sa.table(
    "users",
    sa.column("id", sa.Integer),
    sa.column("dashboard_widget_options", sa.JSON),
    sa.column("enabled_theme_options", sa.JSON),
)


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.update(_USERS)
        .where(
            sa.or_(
                _USERS.c.dashboard_widget_options.isnot(None),
                _USERS.c.enabled_theme_options.isnot(None),
            )
        )
        .values(dashboard_widget_options=None, enabled_theme_options=None)
    )


def downgrade() -> None:
    # The previous per-user lists are gone by design; `null` is the default either way.
    pass
