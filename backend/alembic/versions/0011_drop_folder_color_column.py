"""drop folder color column

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("equipment_folders")}
    if "color" in columns:
        with op.batch_alter_table("equipment_folders") as batch_op:
            batch_op.drop_column("color")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("equipment_folders")}
    if "color" not in columns:
        with op.batch_alter_table("equipment_folders") as batch_op:
            batch_op.add_column(sa.Column("color", sa.String(length=32), nullable=True))
