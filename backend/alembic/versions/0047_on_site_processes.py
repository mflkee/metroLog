"""add on-site flag for repair and verification processes

Revision ID: 0047
Revises: 0046
Create Date: 2026-04-29

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "repairs",
        sa.Column("is_on_site", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "verifications",
        sa.Column("is_on_site", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("repairs", "is_on_site", server_default=None)
    op.alter_column("verifications", "is_on_site", server_default=None)


def downgrade() -> None:
    op.drop_column("verifications", "is_on_site")
    op.drop_column("repairs", "is_on_site")
