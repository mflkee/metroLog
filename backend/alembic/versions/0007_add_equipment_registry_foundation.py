"""add equipment registry foundation

Revision ID: 0007_equipment_registry
Revises: 0006_split_user_name_fields
Create Date: 2026-03-18 00:05:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_equipment_registry"
down_revision: str | None = "0006_split_user_name_fields"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "equipment_folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_folders")),
        sa.UniqueConstraint("name", name=op.f("uq_equipment_folders_name")),
    )
    op.create_index(
        op.f("ix_equipment_folders_name"),
        "equipment_folders",
        ["name"],
        unique=False,
    )

    op.create_table(
        "equipment_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["folder_id"],
            ["equipment_folders.id"],
            name=op.f("fk_equipment_groups_folder_id_equipment_folders"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment_groups")),
        sa.UniqueConstraint("folder_id", "name", name=op.f("uq_equipment_groups_folder_id_name")),
    )
    op.create_index(
        op.f("ix_equipment_groups_folder_id"),
        "equipment_groups",
        ["folder_id"],
        unique=False,
    )

    op.create_table(
        "equipment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("object_name", sa.String(length=255), nullable=False),
        sa.Column("equipment_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("modification", sa.String(length=255), nullable=True),
        sa.Column("serial_number", sa.String(length=255), nullable=True),
        sa.Column("inventory_number", sa.String(length=255), nullable=True),
        sa.Column("manufacture_year", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("current_location_manual", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["equipment_groups.id"],
            name=op.f("fk_equipment_group_id_equipment_groups"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment")),
    )
    op.create_index(op.f("ix_equipment_group_id"), "equipment", ["group_id"], unique=False)
    op.create_index(
        op.f("ix_equipment_inventory_number"),
        "equipment",
        ["inventory_number"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_serial_number"),
        "equipment",
        ["serial_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_equipment_serial_number"), table_name="equipment")
    op.drop_index(op.f("ix_equipment_inventory_number"), table_name="equipment")
    op.drop_index(op.f("ix_equipment_group_id"), table_name="equipment")
    op.drop_table("equipment")
    op.drop_index(op.f("ix_equipment_groups_folder_id"), table_name="equipment_groups")
    op.drop_table("equipment_groups")
    op.drop_index(op.f("ix_equipment_folders_name"), table_name="equipment_folders")
    op.drop_table("equipment_folders")
