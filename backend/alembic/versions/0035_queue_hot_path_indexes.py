"""add queue hot path indexes

Revision ID: 0035
Revises: 0034
Create Date: 2026-03-27

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_repairs_active_queue_order",
        "repairs",
        ["sent_to_repair_at", "created_at", "id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NULL"),
    )
    op.create_index(
        "ix_repairs_archived_queue_order",
        "repairs",
        ["closed_at", "updated_at", "id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NOT NULL"),
    )
    op.create_index(
        "ix_repairs_active_equipment_lookup",
        "repairs",
        ["equipment_id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NULL"),
    )
    op.create_index(
        "ix_repairs_active_batch_lookup",
        "repairs",
        ["batch_key", "id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NULL"),
    )
    op.create_index(
        "ix_verifications_active_queue_order",
        "verifications",
        ["sent_to_verification_at", "created_at", "id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NULL"),
    )
    op.create_index(
        "ix_verifications_archived_queue_order",
        "verifications",
        ["closed_at", "updated_at", "id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NOT NULL"),
    )
    op.create_index(
        "ix_verifications_active_equipment_lookup",
        "verifications",
        ["equipment_id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NULL"),
    )
    op.create_index(
        "ix_verifications_active_batch_lookup",
        "verifications",
        ["batch_key", "id"],
        unique=False,
        postgresql_where=sa.text("closed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_verifications_active_batch_lookup", table_name="verifications")
    op.drop_index("ix_verifications_active_equipment_lookup", table_name="verifications")
    op.drop_index("ix_verifications_archived_queue_order", table_name="verifications")
    op.drop_index("ix_verifications_active_queue_order", table_name="verifications")
    op.drop_index("ix_repairs_active_batch_lookup", table_name="repairs")
    op.drop_index("ix_repairs_active_equipment_lookup", table_name="repairs")
    op.drop_index("ix_repairs_archived_queue_order", table_name="repairs")
    op.drop_index("ix_repairs_active_queue_order", table_name="repairs")
