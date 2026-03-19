"""add user enabled themes

Revision ID: 0019
Revises: 0018
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("enabled_theme_options", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "enabled_theme_options")
