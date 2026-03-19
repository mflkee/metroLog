"""add equipment attachments

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_display_name", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_mime_type", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_attachments")),
        sa.UniqueConstraint("storage_path", name=op.f("uq_equipment_attachments_storage_path")),
    )
    op.create_index(
        op.f("ix_equipment_attachments_equipment_id"),
        "equipment_attachments",
        ["equipment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_attachments_uploaded_by_user_id"),
        "equipment_attachments",
        ["uploaded_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_equipment_attachments_uploaded_by_user_id"),
        table_name="equipment_attachments",
    )
    op.drop_index(
        op.f("ix_equipment_attachments_equipment_id"),
        table_name="equipment_attachments",
    )
    op.drop_table("equipment_attachments")
