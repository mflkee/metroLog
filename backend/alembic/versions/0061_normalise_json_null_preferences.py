"""turn a JSON `null` in the preference columns into a real SQL NULL

`0060` cleared the two lists with a JSON-typed bind parameter, and SQLAlchemy's `JSON` type stores a
Python `None` as the JSON literal `null` unless `none_as_null` is set. Those rows therefore kept a
value that `IS NOT NULL` still matches, even though the read path was fine (a JSON `null` decodes
back to `None`, so the frontend already saw the default). This normalises them, so the column says
what it means. A database where `0060` already wrote SQL NULL is left untouched.

Revision ID: 0061
Revises: 0060
Create Date: 2026-10-10

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None

_COLUMNS = ("dashboard_widget_options", "enabled_theme_options")


def upgrade() -> None:
    connection = op.get_bind()
    for column in _COLUMNS:
        connection.execute(
            sa.text(f"UPDATE users SET {column} = NULL WHERE {column}::text = 'null'")  # noqa: S608
        )


def downgrade() -> None:
    # Nothing to restore: the previous value was a JSON `null`, which is not a meaningful state.
    pass
