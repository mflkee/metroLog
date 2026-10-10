"""retire the light and moonfly themes

The owner removed both from the catalogue: the light theme never fitted the product, and moonfly
read as a second neutral dark next to `dark`. The enum keeps the retired members on purpose — a
client with a cached bundle can still send `light` without a 422, and the frontend coerces a retired
value to `dark` — but the stored preference is moved to `dark` here, so the data matches the
catalogue.

`theme_preference` holds the enum *name* (`LIGHT`, `MOONFLY`), because the column is an
`Enum(..., native_enum=False)` without `values_callable`; writing the value would fail on read.

Revision ID: 0062
Revises: 0061
Create Date: 2026-10-10

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None

_RETIRED_TO = {"LIGHT": "DARK", "MOONFLY": "DARK"}


def upgrade() -> None:
    connection = op.get_bind()
    for retired, replacement in _RETIRED_TO.items():
        connection.execute(
            sa.text(
                "UPDATE users SET theme_preference = :replacement WHERE theme_preference = :retired"
            ),
            {"replacement": replacement, "retired": retired},
        )


def downgrade() -> None:
    # The retired themes are gone from the catalogue; there is nothing meaningful to restore.
    pass
