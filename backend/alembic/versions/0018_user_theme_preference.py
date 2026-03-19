"""add user theme preference

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "theme_preference",
            sa.Enum(
                "light",
                "dark",
                "gray",
                name="userthemepreference",
                native_enum=False,
                length=32,
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "theme_preference")
