"""add batch key to verification messages

Revision ID: 0023
Revises: 0022
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "verification_messages",
        sa.Column("batch_key", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_verification_messages_batch_key"),
        "verification_messages",
        ["batch_key"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_verification_messages_batch_key"),
        table_name="verification_messages",
    )
    op.drop_column("verification_messages", "batch_key")
