"""add verification milestone dates

Revision ID: 0021
Revises: 0020
Create Date: 2026-03-19

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "verifications",
        sa.Column("received_at_destination_at", sa.Date(), nullable=True),
    )
    op.add_column("verifications", sa.Column("handed_to_csm_at", sa.Date(), nullable=True))
    op.add_column(
        "verifications",
        sa.Column("verification_completed_at", sa.Date(), nullable=True),
    )
    op.add_column("verifications", sa.Column("picked_up_from_csm_at", sa.Date(), nullable=True))
    op.add_column("verifications", sa.Column("shipped_back_at", sa.Date(), nullable=True))
    op.add_column(
        "verifications",
        sa.Column("returned_from_verification_at", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("verifications", "returned_from_verification_at")
    op.drop_column("verifications", "shipped_back_at")
    op.drop_column("verifications", "picked_up_from_csm_at")
    op.drop_column("verifications", "verification_completed_at")
    op.drop_column("verifications", "handed_to_csm_at")
    op.drop_column("verifications", "received_at_destination_at")
