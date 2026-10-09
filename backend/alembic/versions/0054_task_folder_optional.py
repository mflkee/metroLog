"""make a task's folder optional

A task is now created without asking for a folder: it inherits the folder of the equipment it
points at, and stays folder-less when there is no equipment or the equipment spans several folders.
Folder-less tasks are visible to their author, their participants and operators.

Revision ID: 0054
Revises: 0053
Create Date: 2026-10-09

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("tasks", "folder_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Folder-less tasks cannot satisfy the old constraint; they have to be dealt with first, so the
    # downgrade fails loudly here instead of deleting somebody's tasks silently.
    op.alter_column("tasks", "folder_id", existing_type=sa.Integer(), nullable=False)
