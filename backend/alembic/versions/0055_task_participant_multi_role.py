"""let one person hold two roles in a task

The responsible participant may also be an assignee (people often run the task they own). The
constraint used to allow one role per person, and the service silently dropped the duplicate, so the
role simply vanished.

Revision ID: 0055
Revises: 0054
Create Date: 2026-10-09

"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None

_OLD = "uq_task_participants_task_id_user_id"
_NEW = "uq_task_participants_task_id_user_id_role"


def upgrade() -> None:
    with op.batch_alter_table("task_participants") as batch:
        batch.drop_constraint(_OLD, type_="unique")
        batch.create_unique_constraint(_NEW, ["task_id", "user_id", "role"])


def downgrade() -> None:
    # Two rows for one person cannot satisfy the old constraint; the downgrade fails loudly rather
    # than deleting somebody's role silently.
    with op.batch_alter_table("task_participants") as batch:
        batch.drop_constraint(_NEW, type_="unique")
        batch.create_unique_constraint(_OLD, ["task_id", "user_id"])
