"""add verification batch fields

Revision ID: 0022
Revises: 0021
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("verifications", sa.Column("batch_key", sa.String(length=64), nullable=True))
    op.add_column("verifications", sa.Column("batch_name", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_verifications_batch_key"), "verifications", ["batch_key"])


def downgrade() -> None:
    op.drop_index(op.f("ix_verifications_batch_key"), table_name="verifications")
    op.drop_column("verifications", "batch_name")
    op.drop_column("verifications", "batch_key")
