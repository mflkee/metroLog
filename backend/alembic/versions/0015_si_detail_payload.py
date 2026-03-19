"""add si detail payload

Revision ID: 0015
Revises: 0014
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("si_verifications", sa.Column("detail_payload_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("si_verifications", "detail_payload_json")
