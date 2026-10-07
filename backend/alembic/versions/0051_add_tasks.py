"""add task management tables

Revision ID: 0051
Revises: 0050
Create Date: 2026-10-08

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "folder_id",
            sa.Integer(),
            sa.ForeignKey("equipment_folders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=128), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_by_display_name", sa.String(length=255), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_tasks_folder_id", "tasks", ["folder_id"])
    op.create_index("ix_tasks_created_by_user_id", "tasks", ["created_by_user_id"])
    op.create_index("ix_tasks_folder_id_status", "tasks", ["folder_id", "status"])
    op.create_index("ix_tasks_due_date_lookup", "tasks", ["due_date"])

    op.create_table(
        "task_participants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "task_id",
            "user_id",
            name="uq_task_participants_task_id_user_id",
        ),
    )
    op.create_index("ix_task_participants_task_id", "task_participants", ["task_id"])
    op.create_index("ix_task_participants_user_id", "task_participants", ["user_id"])

    op.create_table(
        "task_equipment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "equipment_id",
            sa.Integer(),
            sa.ForeignKey("equipment.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "task_id",
            "equipment_id",
            name="uq_task_equipment_task_id_equipment_id",
        ),
    )
    op.create_index("ix_task_equipment_task_id", "task_equipment", ["task_id"])
    op.create_index("ix_task_equipment_equipment_id", "task_equipment", ["equipment_id"])

    op.create_table(
        "task_checklist_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_task_checklist_items_task_id", "task_checklist_items", ["task_id"])
    op.create_index(
        "ix_task_checklist_items_task_id_sort",
        "task_checklist_items",
        ["task_id", "sort_order"],
    )

    op.create_table(
        "task_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("author_display_name", sa.String(length=255), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_task_messages_task_id", "task_messages", ["task_id"])
    op.create_index("ix_task_messages_author_user_id", "task_messages", ["author_user_id"])

    op.create_table(
        "task_message_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_message_id",
            sa.Integer(),
            sa.ForeignKey("task_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("uploaded_by_display_name", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_mime_type", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_task_message_attachments_task_message_id",
        "task_message_attachments",
        ["task_message_id"],
    )

    op.create_table(
        "task_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("uploaded_by_display_name", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_mime_type", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_task_attachments_task_id", "task_attachments", ["task_id"])

    op.create_table(
        "task_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "task_id",
            "user_id",
            name="uq_task_subscriptions_task_id_user_id",
        ),
    )
    op.create_index("ix_task_subscriptions_task_id", "task_subscriptions", ["task_id"])
    op.create_index("ix_task_subscriptions_user_id", "task_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_table("task_subscriptions")
    op.drop_table("task_attachments")
    op.drop_table("task_message_attachments")
    op.drop_table("task_messages")
    op.drop_table("task_checklist_items")
    op.drop_table("task_equipment")
    op.drop_table("task_participants")
    op.drop_table("tasks")
