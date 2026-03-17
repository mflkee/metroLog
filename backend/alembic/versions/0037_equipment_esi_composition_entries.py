"""add persisted esi composition entries

Revision ID: 0037
Revises: 0036
Create Date: 2026-04-02

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_esi_composition_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("vri_id", sa.String(length=255), nullable=False),
        sa.Column("arshin_url", sa.String(length=1024), nullable=True),
        sa.Column("org_title", sa.String(length=255), nullable=True),
        sa.Column("mit_number", sa.String(length=255), nullable=True),
        sa.Column("mit_title", sa.String(length=255), nullable=True),
        sa.Column("mit_notation", sa.String(length=255), nullable=True),
        sa.Column("mi_number", sa.String(length=255), nullable=True),
        sa.Column("result_docnum", sa.String(length=255), nullable=True),
        sa.Column("verification_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_payload_json", sa.JSON(), nullable=True),
        sa.Column("detail_payload_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_esi_composition_entries")),
        sa.UniqueConstraint(
            "equipment_id",
            "vri_id",
            name="uq_equipment_esi_composition_entries_equipment_id_vri_id",
        ),
    )
    op.create_index(
        op.f("ix_equipment_esi_composition_entries_equipment_id"),
        "equipment_esi_composition_entries",
        ["equipment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_esi_composition_entries_vri_id"),
        "equipment_esi_composition_entries",
        ["vri_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_equipment_esi_composition_entries_vri_id"),
        table_name="equipment_esi_composition_entries",
    )
    op.drop_index(
        op.f("ix_equipment_esi_composition_entries_equipment_id"),
        table_name="equipment_esi_composition_entries",
    )
    op.drop_table("equipment_esi_composition_entries")
