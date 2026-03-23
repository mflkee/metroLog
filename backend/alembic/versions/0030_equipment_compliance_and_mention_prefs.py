"""add equipment compliance fields and mention email preferences

Revision ID: 0030
Revises: 0029
Create Date: 2026-03-22

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipment", sa.Column("compliance_date", sa.Date(), nullable=True))
    op.add_column("equipment", sa.Column("compliance_interval_months", sa.Integer(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "mention_email_notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "mention_email_notifications_enabled")
    op.drop_column("equipment", "compliance_interval_months")
    op.drop_column("equipment", "compliance_date")
