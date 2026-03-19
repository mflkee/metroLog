"""add si verification profiles

Revision ID: 0014
Revises: 0013
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "si_verifications",
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
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_si_verifications")),
        sa.UniqueConstraint("equipment_id", name=op.f("uq_si_verifications_equipment_id")),
    )
    op.create_index(
        op.f("ix_si_verifications_equipment_id"),
        "si_verifications",
        ["equipment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_si_verifications_vri_id"),
        "si_verifications",
        ["vri_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_si_verifications_vri_id"), table_name="si_verifications")
    op.drop_index(op.f("ix_si_verifications_equipment_id"), table_name="si_verifications")
    op.drop_table("si_verifications")
