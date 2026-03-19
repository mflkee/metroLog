"""add equipment comments

Revision ID: 0013
Revises: 0012
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=True),
        sa.Column("author_display_name", sa.String(length=255), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_comments")),
    )
    op.create_index(
        op.f("ix_equipment_comments_author_user_id"),
        "equipment_comments",
        ["author_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_comments_equipment_id"),
        "equipment_comments",
        ["equipment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_equipment_comments_equipment_id"),
        table_name="equipment_comments",
    )
    op.drop_index(
        op.f("ix_equipment_comments_author_user_id"),
        table_name="equipment_comments",
    )
    op.drop_table("equipment_comments")
