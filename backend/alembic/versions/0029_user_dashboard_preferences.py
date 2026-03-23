"""add user dashboard preferences

Revision ID: 0029
Revises: 0028
Create Date: 2026-03-22

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dashboard_folder_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("dashboard_widget_options", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "dashboard_widget_options")
    op.drop_column("users", "dashboard_folder_id")
