"""add color to equipment_folders

Revision ID: 0009
Revises: 0008_equipment_categories
Create Date: 2026-03-18

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = '0009'
down_revision = '0008_equipment_categories'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('equipment_folders', sa.Column('color', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('equipment_folders', 'color')
