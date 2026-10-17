"""give equipment an explicit place in the registry

The registry had no order of its own: with no column chosen, the list came back
`created_at desc, id desc` — that is, whatever was added last sat on top, and the order of
instruments of one object was an accident of import order. On the object "СИКН 1520" that read
badly: the main process instruments and the spare thermometers were shuffled together.

`equipment.sort_order` is the order the registry falls back to when the person has not picked a
column. Zero keeps the old behaviour (newest first), so no folder changes until somebody sets
the field; the object that wants the order of its maintenance schedule gets it filled.

Revision ID: 0065
Revises: 0064
Create Date: 2026-10-17

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("equipment", "sort_order")
