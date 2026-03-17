"""add auth codes and email verification

Revision ID: 0002_auth_codes_email_verify
Revises: 0001_create_users
Create Date: 2026-03-17 14:45:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_auth_codes_email_verify"
down_revision = "0001_create_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "auth_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code_type", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_codes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_codes")),
    )
    op.create_index(op.f("ix_auth_codes_code_hash"), "auth_codes", ["code_hash"], unique=False)
    op.create_index(op.f("ix_auth_codes_code_type"), "auth_codes", ["code_type"], unique=False)
    op.create_index(op.f("ix_auth_codes_expires_at"), "auth_codes", ["expires_at"], unique=False)
    op.create_index(op.f("ix_auth_codes_user_id"), "auth_codes", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_codes_user_id"), table_name="auth_codes")
    op.drop_index(op.f("ix_auth_codes_expires_at"), table_name="auth_codes")
    op.drop_index(op.f("ix_auth_codes_code_type"), table_name="auth_codes")
    op.drop_index(op.f("ix_auth_codes_code_hash"), table_name="auth_codes")
    op.drop_table("auth_codes")
    op.drop_column("users", "email_verified_at")
