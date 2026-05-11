"""add equipment comment attachments

Revision ID: 0034
Revises: 0033
Create Date: 2026-03-26

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_comment_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_comment_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_display_name", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_mime_type", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["equipment_comment_id"],
            ["equipment_comments.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_comment_attachments")),
        sa.UniqueConstraint(
            "storage_path",
            name=op.f("uq_equipment_comment_attachments_storage_path"),
        ),
    )
    op.create_index(
        op.f("ix_equipment_comment_attachments_equipment_comment_id"),
        "equipment_comment_attachments",
        ["equipment_comment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_comment_attachments_uploaded_by_user_id"),
        "equipment_comment_attachments",
        ["uploaded_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_equipment_comment_attachments_uploaded_by_user_id"),
        table_name="equipment_comment_attachments",
    )
    op.drop_index(
        op.f("ix_equipment_comment_attachments_equipment_comment_id"),
        table_name="equipment_comment_attachments",
    )
    op.drop_table("equipment_comment_attachments")
