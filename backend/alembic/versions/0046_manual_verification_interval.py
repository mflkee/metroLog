"""add manual verification interval for si equipment

Revision ID: 0046
Revises: 0045
Create Date: 2026-04-19

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment",
        sa.Column("manual_verification_interval_months", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("equipment", "manual_verification_interval_months")
