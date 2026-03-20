"""add repair batch fields

Revision ID: 0026
Revises: 0025
Create Date: 2026-03-20

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("repairs", sa.Column("batch_key", sa.String(length=64), nullable=True))
    op.add_column("repairs", sa.Column("batch_name", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_repairs_batch_key"), "repairs", ["batch_key"])

    op.add_column(
        "repair_messages",
        sa.Column("batch_key", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_repair_messages_batch_key"),
        "repair_messages",
        ["batch_key"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_repair_messages_batch_key"), table_name="repair_messages")
    op.drop_column("repair_messages", "batch_key")

    op.drop_index(op.f("ix_repairs_batch_key"), table_name="repairs")
    op.drop_column("repairs", "batch_name")
    op.drop_column("repairs", "batch_key")
