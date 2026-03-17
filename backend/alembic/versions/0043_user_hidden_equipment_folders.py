"""add user hidden equipment folders

Revision ID: 0043
Revises: 0042
Create Date: 2026-04-07 15:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("hidden_equipment_folder_ids", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "hidden_equipment_folder_ids")
