"""add repair milestone dates

Revision ID: 0024
Revises: 0023
Create Date: 2026-03-20

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("repairs", sa.Column("sent_from_repair_at", sa.Date(), nullable=True))
    op.add_column("repairs", sa.Column("sent_from_irkutsk_at", sa.Date(), nullable=True))
    op.add_column("repairs", sa.Column("arrived_to_lensk_at", sa.Date(), nullable=True))
    op.add_column("repairs", sa.Column("actually_received_at", sa.Date(), nullable=True))
    op.add_column("repairs", sa.Column("incoming_control_at", sa.Date(), nullable=True))
    op.add_column("repairs", sa.Column("paid_at", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("repairs", "paid_at")
    op.drop_column("repairs", "incoming_control_at")
    op.drop_column("repairs", "actually_received_at")
    op.drop_column("repairs", "arrived_to_lensk_at")
    op.drop_column("repairs", "sent_from_irkutsk_at")
    op.drop_column("repairs", "sent_from_repair_at")
