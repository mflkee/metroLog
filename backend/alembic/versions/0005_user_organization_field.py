"""add user organization field

Revision ID: 0005_user_organization_field
Revises: 0004_user_profile_fields
Create Date: 2026-03-17 17:12:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_user_organization_field"
down_revision: str | None = "0004_user_profile_fields"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("organization", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "organization")
