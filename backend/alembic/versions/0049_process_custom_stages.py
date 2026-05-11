"""add custom process stages for repairs and verifications

Revision ID: 0049
Revises: 0048
Create Date: 2026-04-29

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "repairs",
        sa.Column(
            "custom_stages_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "verifications",
        sa.Column(
            "custom_stages_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.alter_column("repairs", "custom_stages_json", server_default=None)
    op.alter_column("verifications", "custom_stages_json", server_default=None)


def downgrade() -> None:
    op.drop_column("verifications", "custom_stages_json")
    op.drop_column("repairs", "custom_stages_json")
