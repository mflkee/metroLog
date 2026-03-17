"""add equipment measurement fields and folder process subscriptions

Revision ID: 0036
Revises: 0035
Create Date: 2026-03-31

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment",
        sa.Column("measurement_range_start", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "equipment",
        sa.Column("measurement_range_end", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "equipment",
        sa.Column("measurement_unit", sa.String(length=128), nullable=True),
    )

    op.create_table(
        "folder_process_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["folder_id"], ["equipment_folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_folder_process_subscriptions")),
        sa.UniqueConstraint(
            "folder_id",
            "user_id",
            name="uq_folder_process_subscriptions_folder_id_user_id",
        ),
    )
    op.create_index(
        op.f("ix_folder_process_subscriptions_folder_id"),
        "folder_process_subscriptions",
        ["folder_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_folder_process_subscriptions_user_id"),
        "folder_process_subscriptions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_folder_process_subscriptions_user_id"),
        table_name="folder_process_subscriptions",
    )
    op.drop_index(
        op.f("ix_folder_process_subscriptions_folder_id"),
        table_name="folder_process_subscriptions",
    )
    op.drop_table("folder_process_subscriptions")

    op.drop_column("equipment", "measurement_unit")
    op.drop_column("equipment", "measurement_range_end")
    op.drop_column("equipment", "measurement_range_start")
