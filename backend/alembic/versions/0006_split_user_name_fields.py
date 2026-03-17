"""split user display name into separate fields

Revision ID: 0006_split_user_name_fields
Revises: 0005_user_organization_field
Create Date: 2026-03-17 23:40:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_split_user_name_fields"
down_revision: str | None = "0005_user_organization_field"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("patronymic", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("display_name", sa.String(length=255)),
        sa.column("first_name", sa.String(length=255)),
        sa.column("last_name", sa.String(length=255)),
        sa.column("patronymic", sa.String(length=255)),
    )

    rows = bind.execute(sa.select(users.c.id, users.c.display_name)).mappings().all()
    for row in rows:
        display_name = (row["display_name"] or "").strip()
        first_name = display_name or "User"
        bind.execute(
            users.update()
            .where(users.c.id == row["id"])
            .values(
                first_name=first_name,
                last_name="",
                patronymic=None,
            )
        )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("first_name", existing_type=sa.String(length=255), nullable=False)
        batch_op.alter_column("last_name", existing_type=sa.String(length=255), nullable=False)
        batch_op.drop_column("display_name")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("display_name", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("display_name", sa.String(length=255)),
        sa.column("first_name", sa.String(length=255)),
        sa.column("last_name", sa.String(length=255)),
        sa.column("patronymic", sa.String(length=255)),
    )

    rows = bind.execute(
        sa.select(
            users.c.id,
            users.c.first_name,
            users.c.last_name,
            users.c.patronymic,
        )
    ).mappings().all()

    for row in rows:
        parts = [row["last_name"], row["first_name"], row["patronymic"]]
        display_name = " ".join(part for part in parts if part)
        bind.execute(
            users.update()
            .where(users.c.id == row["id"])
            .values(display_name=display_name or "User")
        )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("display_name", existing_type=sa.String(length=255), nullable=False)
        batch_op.drop_column("patronymic")
        batch_op.drop_column("last_name")
        batch_op.drop_column("first_name")
