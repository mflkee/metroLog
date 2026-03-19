"""add verification process tables

Revision ID: 0020
Revises: 0019
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "verifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("route_city", sa.String(length=255), nullable=False),
        sa.Column("route_destination", sa.String(length=255), nullable=False),
        sa.Column("sent_to_verification_at", sa.Date(), nullable=False),
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
        sa.Column("closed_at", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
            name=op.f("fk_verifications_equipment_id_equipment"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verifications")),
    )
    op.create_index(op.f("ix_verifications_equipment_id"), "verifications", ["equipment_id"])

    op.create_table(
        "verification_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("verification_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=True),
        sa.Column("author_display_name", sa.String(length=255), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"],
            ["users.id"],
            name=op.f("fk_verification_messages_author_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["verification_id"],
            ["verifications.id"],
            name=op.f("fk_verification_messages_verification_id_verifications"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verification_messages")),
    )
    op.create_index(
        op.f("ix_verification_messages_verification_id"),
        "verification_messages",
        ["verification_id"],
    )
    op.create_index(
        op.f("ix_verification_messages_author_user_id"),
        "verification_messages",
        ["author_user_id"],
    )

    op.create_table(
        "verification_message_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("verification_message_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_display_name", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_mime_type", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            name=op.f("fk_verification_message_attachments_uploaded_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["verification_message_id"],
            ["verification_messages.id"],
            name=op.f(
                "fk_verification_message_attachments_verification_message_id_verification_messages"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verification_message_attachments")),
        sa.UniqueConstraint(
            "storage_path",
            name=op.f("uq_verification_message_attachments_storage_path"),
        ),
    )
    op.create_index(
        op.f("ix_verification_message_attachments_verification_message_id"),
        "verification_message_attachments",
        ["verification_message_id"],
    )
    op.create_index(
        op.f("ix_verification_message_attachments_uploaded_by_user_id"),
        "verification_message_attachments",
        ["uploaded_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_verification_message_attachments_uploaded_by_user_id"),
        table_name="verification_message_attachments",
    )
    op.drop_index(
        op.f("ix_verification_message_attachments_verification_message_id"),
        table_name="verification_message_attachments",
    )
    op.drop_table("verification_message_attachments")
    op.drop_index(
        op.f("ix_verification_messages_author_user_id"),
        table_name="verification_messages",
    )
    op.drop_index(
        op.f("ix_verification_messages_verification_id"),
        table_name="verification_messages",
    )
    op.drop_table("verification_messages")
    op.drop_index(op.f("ix_verifications_equipment_id"), table_name="verifications")
    op.drop_table("verifications")
