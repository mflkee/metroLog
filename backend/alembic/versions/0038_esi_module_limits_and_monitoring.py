"""add esi module kinds and measurement limits

Revision ID: 0038
Revises: 0037
Create Date: 2026-04-02

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment_esi_composition_entries",
        sa.Column(
            "module_kind",
            sa.String(length=32),
            nullable=False,
            server_default="EXTERNAL",
        ),
    )
    op.add_column(
        "equipment_esi_composition_entries",
        sa.Column("measurement_limit", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "equipment_esi_composition_entries",
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column(
        "equipment_esi_composition_entries",
        "module_kind",
        server_default=None,
    )
    op.alter_column(
        "equipment_esi_composition_entries",
        "sort_order",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("equipment_esi_composition_entries", "sort_order")
    op.drop_column("equipment_esi_composition_entries", "measurement_limit")
    op.drop_column("equipment_esi_composition_entries", "module_kind")
