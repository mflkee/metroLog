"""align equipment structure with folder-first registry and explicit categories

Revision ID: 0008_equipment_categories
Revises: 0007_equipment_registry
Create Date: 2026-03-18 02:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_equipment_categories"
down_revision: str | None = "0007_equipment_registry"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("equipment", sa.Column("folder_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_equipment_folder_id"), "equipment", ["folder_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_equipment_folder_id_equipment_folders"),
        "equipment",
        "equipment_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        sa.text(
            """
            UPDATE equipment AS equipment_item
            SET folder_id = equipment_group.folder_id
            FROM equipment_groups AS equipment_group
            WHERE equipment_item.group_id = equipment_group.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE equipment
            SET equipment_type = 'OTHER'
            WHERE equipment_type = 'NON_SI'
            """
        )
    )

    op.drop_index(op.f("ix_equipment_inventory_number"), table_name="equipment")
    op.drop_column("equipment", "inventory_number")


def downgrade() -> None:
    op.add_column("equipment", sa.Column("inventory_number", sa.String(length=255), nullable=True))
    op.create_index(
        op.f("ix_equipment_inventory_number"),
        "equipment",
        ["inventory_number"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            UPDATE equipment
            SET equipment_type = 'NON_SI'
            WHERE equipment_type IN ('IO', 'VO', 'OTHER')
            """
        )
    )
    op.drop_constraint(
        op.f("fk_equipment_folder_id_equipment_folders"),
        "equipment",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_equipment_folder_id"), table_name="equipment")
    op.drop_column("equipment", "folder_id")
