"""add process stage templates and verification flow mode

Revision ID: 0048
Revises: 0047
Create Date: 2026-04-29

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


verification_flow_mode_enum = sa.Enum(
    "OFFSITE_WITH_DEMOLITION",
    "ONSITE_WITH_DEMOLITION",
    "ONSITE_WITHOUT_DEMOLITION",
    name="verificationflowmode",
    native_enum=False,
    length=48,
)


def upgrade() -> None:
    op.add_column(
        "deadline_presets",
        sa.Column("repair_stage_templates_json", sa.JSON(), nullable=True),
    )
    op.add_column(
        "deadline_presets",
        sa.Column("verification_stage_templates_json", sa.JSON(), nullable=True),
    )
    op.add_column(
        "verifications",
        sa.Column(
            "flow_mode",
            verification_flow_mode_enum,
            nullable=False,
            server_default="OFFSITE_WITH_DEMOLITION",
        ),
    )
    op.execute(
        """
        UPDATE verifications
        SET flow_mode = CASE
            WHEN is_on_site THEN 'ONSITE_WITH_DEMOLITION'
            ELSE 'OFFSITE_WITH_DEMOLITION'
        END
        """
    )
    op.alter_column("verifications", "flow_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("verifications", "flow_mode")
    op.drop_column("deadline_presets", "verification_stage_templates_json")
    op.drop_column("deadline_presets", "repair_stage_templates_json")
