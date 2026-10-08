"""add user folder order

Revision ID: 0053
Revises: 0052
Create Date: 2026-10-08

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("folder_order_ids", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "folder_order_ids")
