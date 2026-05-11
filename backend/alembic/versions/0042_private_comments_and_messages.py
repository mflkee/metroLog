"""add private flags for comments and process messages

Revision ID: 0042
Revises: 0041
Create Date: 2026-04-07

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment_comments",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "repair_messages",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "verification_messages",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.alter_column("equipment_comments", "is_private", server_default=None)
    op.alter_column("repair_messages", "is_private", server_default=None)
    op.alter_column("verification_messages", "is_private", server_default=None)


def downgrade() -> None:
    op.drop_column("verification_messages", "is_private")
    op.drop_column("repair_messages", "is_private")
    op.drop_column("equipment_comments", "is_private")
