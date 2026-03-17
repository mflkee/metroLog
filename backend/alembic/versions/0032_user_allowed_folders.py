"""add user allowed folders

Revision ID: 0032
Revises: 0031
Create Date: 2026-03-23

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("allowed_folder_ids", sa.JSON(), nullable=True))
    op.execute(
        sa.text("UPDATE users SET allowed_folder_ids = '[]' WHERE role IN ('CUSTOMER', 'MKAIR')")
    )


def downgrade() -> None:
    op.drop_column("users", "allowed_folder_ids")
