"""add missing event log equipment snapshot columns

Revision ID: 0028
Revises: 0027
Create Date: 2026-03-20

"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE event_logs
        ADD COLUMN IF NOT EXISTS equipment_modification VARCHAR(255)
        """
    )
    op.execute(
        """
        ALTER TABLE event_logs
        ADD COLUMN IF NOT EXISTS equipment_serial_number VARCHAR(255)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE event_logs
        DROP COLUMN IF EXISTS equipment_serial_number
        """
    )
    op.execute(
        """
        ALTER TABLE event_logs
        DROP COLUMN IF EXISTS equipment_modification
        """
    )
