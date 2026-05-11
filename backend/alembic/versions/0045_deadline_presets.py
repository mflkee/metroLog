"""add deadline presets

Revision ID: 0045
Revises: 0044
Create Date: 2026-04-08 00:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deadline_presets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("repair_total_days", sa.Integer(), nullable=False),
        sa.Column("registration_after_arrival_days", sa.Integer(), nullable=False),
        sa.Column("incoming_control_after_receipt_days", sa.Integer(), nullable=False),
        sa.Column("payment_after_control_days", sa.Integer(), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_deadline_presets_code"), "deadline_presets", ["code"], unique=True)
    op.create_index(op.f("ix_deadline_presets_name"), "deadline_presets", ["name"], unique=True)

    op.add_column(
        "equipment_folders",
        sa.Column("deadline_preset_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "equipment_folders",
        sa.Column("deadline_preset_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "equipment_folders",
        sa.Column("deadline_preset_snapshot_json", sa.JSON(), nullable=True),
    )
    op.add_column(
        "repairs",
        sa.Column("repair_total_days_snapshot", sa.Integer(), nullable=True),
    )
    op.add_column(
        "repairs",
        sa.Column("registration_after_arrival_days_snapshot", sa.Integer(), nullable=True),
    )
    op.add_column(
        "repairs",
        sa.Column("incoming_control_after_receipt_days_snapshot", sa.Integer(), nullable=True),
    )
    op.add_column(
        "repairs",
        sa.Column("payment_after_control_days_snapshot", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_equipment_folders_deadline_preset_id"),
        "equipment_folders",
        ["deadline_preset_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_equipment_folders_deadline_preset_id_deadline_presets"),
        "equipment_folders",
        "deadline_presets",
        ["deadline_preset_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        INSERT INTO deadline_presets (
            code,
            name,
            description,
            is_active,
            is_system,
            sort_order,
            repair_total_days,
            registration_after_arrival_days,
            incoming_control_after_receipt_days,
            payment_after_control_days
        ) VALUES (
            'tyungd',
            'ТЮНГД',
            'Базовый пресет сроков ремонта.',
            true,
            true,
            0,
            100,
            5,
            40,
            70
        )
        """
    )
    op.execute(
        """
        UPDATE equipment_folders
        SET
            deadline_preset_id = preset.id,
            deadline_preset_name = preset.name,
            deadline_preset_snapshot_json = json_build_object(
                'repair_total_days', preset.repair_total_days,
                'registration_after_arrival_days', preset.registration_after_arrival_days,
                'incoming_control_after_receipt_days', preset.incoming_control_after_receipt_days,
                'payment_after_control_days', preset.payment_after_control_days
            )
        FROM deadline_presets AS preset
        WHERE preset.code = 'tyungd'
        """
    )
    op.execute(
        """
        UPDATE repairs
        SET
            repair_total_days_snapshot = COALESCE(
                NULLIF(
                    (folders.deadline_preset_snapshot_json ->> 'repair_total_days'),
                    ''
                )::integer,
                100
            ),
            registration_after_arrival_days_snapshot = COALESCE(
                NULLIF(
                    (
                        folders.deadline_preset_snapshot_json
                        ->> 'registration_after_arrival_days'
                    ),
                    ''
                )::integer,
                5
            ),
            incoming_control_after_receipt_days_snapshot = COALESCE(
                NULLIF(
                    (
                        folders.deadline_preset_snapshot_json
                        ->> 'incoming_control_after_receipt_days'
                    ),
                    ''
                )::integer,
                40
            ),
            payment_after_control_days_snapshot = COALESCE(
                NULLIF(
                    (
                        folders.deadline_preset_snapshot_json
                        ->> 'payment_after_control_days'
                    ),
                    ''
                )::integer,
                70
            )
        FROM equipment
        LEFT JOIN equipment_folders AS folders ON folders.id = equipment.folder_id
        WHERE equipment.id = repairs.equipment_id
        """
    )
    op.alter_column("repairs", "repair_total_days_snapshot", nullable=False)
    op.alter_column("repairs", "registration_after_arrival_days_snapshot", nullable=False)
    op.alter_column("repairs", "incoming_control_after_receipt_days_snapshot", nullable=False)
    op.alter_column("repairs", "payment_after_control_days_snapshot", nullable=False)


def downgrade() -> None:
    op.drop_column("repairs", "payment_after_control_days_snapshot")
    op.drop_column("repairs", "incoming_control_after_receipt_days_snapshot")
    op.drop_column("repairs", "registration_after_arrival_days_snapshot")
    op.drop_column("repairs", "repair_total_days_snapshot")
    op.drop_constraint(
        op.f("fk_equipment_folders_deadline_preset_id_deadline_presets"),
        "equipment_folders",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_equipment_folders_deadline_preset_id"), table_name="equipment_folders")
    op.drop_column("equipment_folders", "deadline_preset_snapshot_json")
    op.drop_column("equipment_folders", "deadline_preset_name")
    op.drop_column("equipment_folders", "deadline_preset_id")
    op.drop_index(op.f("ix_deadline_presets_name"), table_name="deadline_presets")
    op.drop_index(op.f("ix_deadline_presets_code"), table_name="deadline_presets")
    op.drop_table("deadline_presets")
