"""add the manual board order of a task

A board column is a shared queue, so its order belongs to the task itself rather than to a user.
Null means "never reordered": those tasks sort after the explicitly ordered ones of their column.

Revision ID: 0058
Revises: 0057
Create Date: 2026-10-09

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("board_order", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "board_order")
