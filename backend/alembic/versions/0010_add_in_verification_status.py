"""add IN_VERIFICATION status and rename ACTIVE to IN_WORK

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-18

"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename ACTIVE to IN_WORK in the data
    # The status column is a varchar, so no enum alteration needed
    op.execute("UPDATE equipment SET status = 'IN_WORK' WHERE status = 'ACTIVE'")


def downgrade() -> None:
    # Reverse: rename IN_WORK back to ACTIVE
    op.execute("UPDATE equipment SET status = 'ACTIVE' WHERE status = 'IN_WORK'")
