"""add user dashboard folder ids

Revision ID: 0044
Revises: 0043
Create Date: 2026-04-08 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dashboard_folder_ids", sa.JSON(), nullable=True))
    op.execute(
        """
        UPDATE users
        SET dashboard_folder_ids = json_build_array(dashboard_folder_id)
        WHERE dashboard_folder_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET dashboard_folder_id = NULLIF((dashboard_folder_ids ->> 0), '')::integer
        WHERE dashboard_folder_ids IS NOT NULL
        """
    )
    op.drop_column("users", "dashboard_folder_ids")
