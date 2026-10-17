"""let the operator pick the instrument a verification belongs to

A short serial belongs to instruments of many types in Arshin (``841`` alone is carried by
hundreds), so the rescan cannot say that a found verification is the one on the card. Until now the
row only reported that fact — as one sentence listing every type number — and offered to apply the
record the matcher happened to choose. The row now keeps the records it found (`candidates_json`),
flags the ambiguity (`serial_ambiguous`) and remembers which record the operator picked
(`picked_candidate_vri_id`), so the review screen can ask instead of telling.

Existing rows keep their notes and stay applicable: `serial_ambiguous` defaults to false, so the
apply guard does not block rows produced by the previous version.

Revision ID: 0066
Revises: 0065
Create Date: 2026-10-17

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "equipment_folder_refresh_rows",
        sa.Column("serial_ambiguous", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "equipment_folder_refresh_rows",
        sa.Column("candidates_json", sa.JSON(), nullable=True),
    )
    op.add_column(
        "equipment_folder_refresh_rows",
        sa.Column("picked_candidate_vri_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("equipment_folder_refresh_rows", "picked_candidate_vri_id")
    op.drop_column("equipment_folder_refresh_rows", "candidates_json")
    op.drop_column("equipment_folder_refresh_rows", "serial_ambiguous")
