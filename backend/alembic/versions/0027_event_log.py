"""add event log table

Revision ID: 0027
Revises: 0026
Create Date: 2026-03-20

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "EQUIPMENT",
                "REPAIR",
                "VERIFICATION",
                name="eventcategory",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("user_display_name", sa.String(length=255), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("equipment_name", sa.String(length=255), nullable=True),
        sa.Column("equipment_modification", sa.String(length=255), nullable=True),
        sa.Column("equipment_serial_number", sa.String(length=255), nullable=True),
        sa.Column("folder_id", sa.Integer(), nullable=True),
        sa.Column("folder_name", sa.String(length=255), nullable=True),
        sa.Column("batch_key", sa.String(length=64), nullable=True),
        sa.Column("event_date", sa.Date(), nullable=False, server_default=sa.func.current_date()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["folder_id"], ["equipment_folders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_logs")),
    )
    op.create_index(op.f("ix_event_logs_action"), "event_logs", ["action"])
    op.create_index(op.f("ix_event_logs_batch_key"), "event_logs", ["batch_key"])
    op.create_index(op.f("ix_event_logs_category"), "event_logs", ["category"])
    op.create_index(op.f("ix_event_logs_created_at"), "event_logs", ["created_at"])
    op.create_index(op.f("ix_event_logs_equipment_id"), "event_logs", ["equipment_id"])
    op.create_index(op.f("ix_event_logs_event_date"), "event_logs", ["event_date"])
    op.create_index(op.f("ix_event_logs_folder_id"), "event_logs", ["folder_id"])
    op.create_index(op.f("ix_event_logs_user_id"), "event_logs", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_event_logs_user_id"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_folder_id"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_event_date"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_equipment_id"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_created_at"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_category"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_batch_key"), table_name="event_logs")
    op.drop_index(op.f("ix_event_logs_action"), table_name="event_logs")
    op.drop_table("event_logs")
