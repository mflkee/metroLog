"""take folder ids that no longer exist out of the users' scopes

`users.allowed_folder_ids` and the dashboard lists are plain JSON, so deleting a folder never
took it out of them: the delete path cleaned process subscriptions and equipment, and nothing
else. A stale id is not harmless — the scope is validated whenever the row is written, so the
person whose scope held it could not be edited at all (`404 Разрешенная папка 30 не найдена` on
any role or activity change) until somebody cleaned the data by hand.

The delete path prunes the scopes from now on; this migration cleans up what the old one left.

A NULL scope stays NULL (that is "no restriction" for the roles that ignore folders), while a
list that loses its last id becomes empty rather than NULL — an empty list is "no folders", and
turning it into NULL would hand that person every folder.

Revision ID: 0064
Revises: 0063
Create Date: 2026-10-14

"""

from __future__ import annotations

import json

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    folder_ids = {
        int(row[0]) for row in connection.execute(sa.text("select id from equipment_folders"))
    }
    rows = list(
        connection.execute(
            sa.text(
                "select id, allowed_folder_ids, dashboard_folder_ids, dashboard_folder_id "
                "from users"
            )
        )
    )
    statement = sa.text(
        "update users set allowed_folder_ids = :allowed, dashboard_folder_ids = :dashboards, "
        "dashboard_folder_id = :dashboard_id where id = :user_id"
    ).bindparams(
        sa.bindparam("allowed", type_=sa.JSON()),
        sa.bindparam("dashboards", type_=sa.JSON()),
    )

    for user_id, allowed, dashboards, dashboard_folder_id in rows:
        kept_allowed = _prune(_as_list(allowed), folder_ids)
        kept_dashboards = _prune(_as_list(dashboards), folder_ids)
        stale_dashboard = (
            dashboard_folder_id is not None and int(dashboard_folder_id) not in folder_ids
        )
        kept_dashboard_id = (
            (kept_dashboards[0] if kept_dashboards else None)
            if stale_dashboard
            else dashboard_folder_id
        )
        if (kept_allowed, kept_dashboards, kept_dashboard_id) == (
            _as_list(allowed),
            _as_list(dashboards),
            dashboard_folder_id,
        ):
            continue
        connection.execute(
            statement,
            {
                "allowed": kept_allowed,
                "dashboards": kept_dashboards,
                "dashboard_id": kept_dashboard_id,
                "user_id": user_id,
            },
        )


def downgrade() -> None:
    """Nothing to undo: the ids pointed at folders that are already gone."""


def _as_list(value: object) -> list | None:
    """A JSON column as a list, whatever the driver handed back."""

    if value is None:
        return None
    if isinstance(value, str):
        value = json.loads(value)
    return list(value) if isinstance(value, (list, tuple)) else None


def _prune(values: list | None, folder_ids: set[int]) -> list | None:
    if values is None:
        return None
    kept: list = []
    for value in values:
        try:
            folder_id = int(value)
        except (TypeError, ValueError):
            continue
        if folder_id in folder_ids:
            kept.append(value)
    return kept
