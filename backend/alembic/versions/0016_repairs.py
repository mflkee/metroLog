"""add repairs table

Revision ID: 0016
Revises: 0015
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "repairs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("repair_org_name", sa.String(length=255), nullable=False),
        sa.Column("sent_to_repair_at", sa.Date(), nullable=False),
        sa.Column("repair_deadline_at", sa.Date(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("closed_at", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
            ondelete="CASCADE",
            name=op.f("fk_repairs_equipment_id_equipment"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_repairs")),
    )
    op.create_index(op.f("ix_repairs_equipment_id"), "repairs", ["equipment_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_repairs_equipment_id"), table_name="repairs")
    op.drop_table("repairs")
