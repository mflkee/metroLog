"""add user profile fields

Revision ID: 0004_user_profile_fields
Revises: 0003_user_temp_password_flow
Create Date: 2026-03-17 16:58:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_user_profile_fields"
down_revision: str | None = "0003_user_temp_password_flow"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("position", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("facility", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "facility")
    op.drop_column("users", "position")
    op.drop_column("users", "phone")
