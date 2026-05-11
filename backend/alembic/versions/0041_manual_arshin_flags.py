"""add manual arshin flags and stored certificate number

Revision ID: 0041
Revises: 0040
Create Date: 2026-04-07

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment",
        sa.Column("created_manually", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "equipment",
        sa.Column(
            "exclude_from_arshin_refresh",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "si_verifications",
        sa.Column("certificate_number", sa.String(length=255), nullable=True),
    )

    op.alter_column("equipment", "created_manually", server_default=None)
    op.alter_column("equipment", "exclude_from_arshin_refresh", server_default=None)


def downgrade() -> None:
    op.drop_column("si_verifications", "certificate_number")
    op.drop_column("equipment", "exclude_from_arshin_refresh")
    op.drop_column("equipment", "created_manually")
