"""add internal user password lifecycle fields

Revision ID: 0003_user_temp_password_flow
Revises: 0002_auth_codes_email_verify
Create Date: 2026-03-17 16:15:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0003_user_temp_password_flow"
down_revision = "0002_auth_codes_email_verify"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "must_change_password")
