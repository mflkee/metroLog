"""add user dashboard layout

The dashboard arrangement (order, width preset, collapsed state per widget) is personal, so it
lives next to the other per-user JSON preferences. A missing value means "the default arrangement",
which is why the column is nullable and nothing is backfilled.

Revision ID: 0057
Revises: 0056
Create Date: 2026-10-09

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("dashboard_layout", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "dashboard_layout")
