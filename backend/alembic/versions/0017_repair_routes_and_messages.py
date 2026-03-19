"""refine repairs into route and message dialog

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("repairs") as batch_op:
        batch_op.alter_column(
            "repair_org_name",
            existing_type=sa.String(length=255),
            new_column_name="route_destination",
        )
        batch_op.add_column(
            sa.Column("route_city", sa.String(length=255), nullable=False, server_default="")
        )
        batch_op.drop_column("comment")
        batch_op.alter_column("route_city", server_default=None)

    op.create_table(
        "repair_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repair_id", sa.Integer(), nullable=False),
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
            name=op.f("fk_repair_messages_author_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["repair_id"],
            ["repairs.id"],
            name=op.f("fk_repair_messages_repair_id_repairs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_repair_messages")),
    )
    op.create_index(
        op.f("ix_repair_messages_repair_id"),
        "repair_messages",
        ["repair_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_repair_messages_author_user_id"),
        "repair_messages",
        ["author_user_id"],
        unique=False,
    )

    op.create_table(
        "repair_message_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repair_message_id", sa.Integer(), nullable=False),
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
            ["repair_message_id"],
            ["repair_messages.id"],
            name=op.f(
                "fk_repair_message_attachments_repair_message_id_repair_messages"
            ),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            name=op.f("fk_repair_message_attachments_uploaded_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_repair_message_attachments")),
        sa.UniqueConstraint(
            "storage_path",
            name=op.f("uq_repair_message_attachments_storage_path"),
        ),
    )
    op.create_index(
        op.f("ix_repair_message_attachments_repair_message_id"),
        "repair_message_attachments",
        ["repair_message_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_repair_message_attachments_uploaded_by_user_id"),
        "repair_message_attachments",
        ["uploaded_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_repair_message_attachments_uploaded_by_user_id"),
        table_name="repair_message_attachments",
    )
    op.drop_index(
        op.f("ix_repair_message_attachments_repair_message_id"),
        table_name="repair_message_attachments",
    )
    op.drop_table("repair_message_attachments")

    op.drop_index(op.f("ix_repair_messages_author_user_id"), table_name="repair_messages")
    op.drop_index(op.f("ix_repair_messages_repair_id"), table_name="repair_messages")
    op.drop_table("repair_messages")

    with op.batch_alter_table("repairs") as batch_op:
        batch_op.add_column(sa.Column("comment", sa.Text(), nullable=True))
        batch_op.drop_column("route_city")
        batch_op.alter_column(
            "route_destination",
            existing_type=sa.String(length=255),
            new_column_name="repair_org_name",
        )
