"""drop preset-seeded duplicate custom stages from repairs and verifications

Verification/repair creation used to seed a copy of every preset stage (after the
first) into ``custom_stages_json``, while the same stages were already rendered
from the template. This one-off cleanup removes only those seeded duplicates,
identified by their ``preset_`` id prefix, and keeps the ``preset_variant`` meta
marker plus any user-added custom stages.

Revision ID: 0050
Revises: 0049
Create Date: 2026-10-07

"""

from __future__ import annotations

import json

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None

# ``PROCESS_TEMPLATE_VARIANT_META_KIND`` and the seeded id prefix are frozen here
# on purpose: a migration must keep working even if the application constants
# later change.
VARIANT_META_KIND = "preset_variant"
SEEDED_CUSTOM_STAGE_ID_PREFIX = "preset_"


def _strip_seeded_custom_stages(payload: object) -> list[dict[str, object]]:
    if not isinstance(payload, list):
        return []
    result: list[dict[str, object]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        if item.get("kind") == VARIANT_META_KIND:
            result.append(dict(item))
            continue
        if str(item.get("id") or "").startswith(SEEDED_CUSTOM_STAGE_ID_PREFIX):
            continue
        result.append(dict(item))
    return result


def upgrade() -> None:
    bind = op.get_bind()
    for table in ("repairs", "verifications"):
        rows = bind.execute(sa.text(f"SELECT id, custom_stages_json FROM {table}")).fetchall()
        for row_id, payload in rows:
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except (TypeError, ValueError):
                    continue
            cleaned = _strip_seeded_custom_stages(payload)
            if cleaned == payload:
                continue
            bind.execute(
                sa.text(
                    f"UPDATE {table} SET custom_stages_json = CAST(:payload AS JSON) WHERE id = :id"
                ),
                {"payload": json.dumps(cleaned, ensure_ascii=False), "id": row_id},
            )


def downgrade() -> None:
    # Irreversible data cleanup: the removed rows were duplicates seeded from the
    # preset variant, not user data.
    pass
