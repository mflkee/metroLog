"""add folder refresh tasks

Revision ID: 0039
Revises: 0038
Create Date: 2026-04-02

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "equipment_folder_refresh_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "folder_id",
            sa.Integer(),
            sa.ForeignKey("equipment_folders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary_json", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_equipment_folder_refresh_tasks_folder_id",
        "equipment_folder_refresh_tasks",
        ["folder_id"],
    )
    op.create_index(
        "ix_equipment_folder_refresh_tasks_created_by_user_id",
        "equipment_folder_refresh_tasks",
        ["created_by_user_id"],
    )

    op.create_table(
        "equipment_folder_refresh_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "task_id",
            sa.Integer(),
            sa.ForeignKey("equipment_folder_refresh_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "equipment_id",
            sa.Integer(),
            sa.ForeignKey("equipment.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "composition_entry_id",
            sa.Integer(),
            sa.ForeignKey("equipment_esi_composition_entries.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_kind", sa.String(length=32), nullable=False),
        sa.Column("module_kind", sa.String(length=32), nullable=True),
        sa.Column("equipment_name", sa.String(length=255), nullable=False),
        sa.Column("equipment_modification", sa.String(length=255), nullable=True),
        sa.Column("equipment_serial_number", sa.String(length=255), nullable=True),
        sa.Column("target_title", sa.String(length=255), nullable=True),
        sa.Column("target_serial_number", sa.String(length=255), nullable=True),
        sa.Column("target_registry_number", sa.String(length=255), nullable=True),
        sa.Column("measurement_limit", sa.String(length=255), nullable=True),
        sa.Column("current_certificate_number", sa.String(length=255), nullable=True),
        sa.Column("current_verification_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_valid_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("uncertain_update", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("stage2_successful", sa.Boolean(), nullable=True),
        sa.Column("modification_relaxed", sa.Boolean(), nullable=True),
        sa.Column("notation_relaxed", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("matched_vri_id", sa.String(length=255), nullable=True),
        sa.Column("matched_arshin_url", sa.String(length=1024), nullable=True),
        sa.Column("matched_registry_number", sa.String(length=255), nullable=True),
        sa.Column("matched_certificate_number", sa.String(length=255), nullable=True),
        sa.Column("matched_verification_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("matched_valid_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("matched_payload_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_equipment_folder_refresh_rows_task_id",
        "equipment_folder_refresh_rows",
        ["task_id"],
    )
    op.create_index(
        "ix_equipment_folder_refresh_rows_equipment_id",
        "equipment_folder_refresh_rows",
        ["equipment_id"],
    )
    op.create_index(
        "ix_equipment_folder_refresh_rows_composition_entry_id",
        "equipment_folder_refresh_rows",
        ["composition_entry_id"],
    )
    op.create_index(
        "ix_equipment_folder_refresh_rows_task_sort",
        "equipment_folder_refresh_rows",
        ["task_id", "sort_order", "id"],
    )

    op.alter_column("equipment_folder_refresh_tasks", "progress", server_default=None)
    op.alter_column("equipment_folder_refresh_tasks", "total_rows", server_default=None)
    op.alter_column("equipment_folder_refresh_tasks", "processed_rows", server_default=None)
    op.alter_column("equipment_folder_refresh_rows", "sort_order", server_default=None)
    op.alter_column("equipment_folder_refresh_rows", "uncertain_update", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_equipment_folder_refresh_rows_task_sort",
        table_name="equipment_folder_refresh_rows",
    )
    op.drop_index(
        "ix_equipment_folder_refresh_rows_composition_entry_id",
        table_name="equipment_folder_refresh_rows",
    )
    op.drop_index(
        "ix_equipment_folder_refresh_rows_equipment_id",
        table_name="equipment_folder_refresh_rows",
    )
    op.drop_index(
        "ix_equipment_folder_refresh_rows_task_id",
        table_name="equipment_folder_refresh_rows",
    )
    op.drop_table("equipment_folder_refresh_rows")

    op.drop_index(
        "ix_equipment_folder_refresh_tasks_created_by_user_id",
        table_name="equipment_folder_refresh_tasks",
    )
    op.drop_index(
        "ix_equipment_folder_refresh_tasks_folder_id",
        table_name="equipment_folder_refresh_tasks",
    )
    op.drop_table("equipment_folder_refresh_tasks")
