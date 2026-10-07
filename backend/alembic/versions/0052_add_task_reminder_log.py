"""add task reminder log

Revision ID: 0052
Revises: 0051
Create Date: 2026-10-08

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_reminder_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reminder_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "task_id",
            "reminder_date",
            name="uq_task_reminder_log_task_id_reminder_date",
        ),
    )
    op.create_index("ix_task_reminder_log_task_id", "task_reminder_log", ["task_id"])


def downgrade() -> None:
    op.drop_table("task_reminder_log")
