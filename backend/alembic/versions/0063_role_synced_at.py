"""remember which registry role the local copy came from

The role in metroLog is a mirror of the registry's, and the row already stores the value; what it
did not store is *which* registry value it mirrors. Without that, a role change can only be pushed
blindly: the write says "make it ADMINISTRATOR" with no way to notice that the registry had moved
on since the screen was rendered, and the owner's newer change is lost without a word.

`role_synced_at` is that memory — the `role_updated_at` the local copy was last built from. It is
also what the write sends back to the registry, so a save based on a screen that is out of date is
refused (409) instead of applied.

Nothing is backfilled: NULL means "we do not know", and the first read takes the registry's answer,
which is exactly the state every existing row is in today.

Revision ID: 0063
Revises: 0062
Create Date: 2026-10-14

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role_synced_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "role_synced_at")
