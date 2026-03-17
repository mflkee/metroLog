"""add equipment process subscriptions

Revision ID: 0033
Revises: 0032
Create Date: 2026-03-23

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_process_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_process_subscriptions")),
        sa.UniqueConstraint(
            "equipment_id",
            "user_id",
            name="uq_equipment_process_subscriptions_equipment_id_user_id",
        ),
    )
    op.create_index(
        op.f("ix_equipment_process_subscriptions_equipment_id"),
        "equipment_process_subscriptions",
        ["equipment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_process_subscriptions_user_id"),
        "equipment_process_subscriptions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_equipment_process_subscriptions_user_id"),
        table_name="equipment_process_subscriptions",
    )
    op.drop_index(
        op.f("ix_equipment_process_subscriptions_equipment_id"),
        table_name="equipment_process_subscriptions",
    )
    op.drop_table("equipment_process_subscriptions")
