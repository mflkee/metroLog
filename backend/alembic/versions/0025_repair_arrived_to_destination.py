"""add repair arrival at destination date

Revision ID: 0025
Revises: 0024
Create Date: 2026-03-20

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("repairs", sa.Column("arrived_to_destination_at", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("repairs", "arrived_to_destination_at")
