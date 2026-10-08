from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

from app.models.equipment import VerificationFlowMode
from app.services import equipment_process_templates as tpl
from app.services import equipment_service as eq
from app.services import equipment_verifications as ver

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "0050_cleanup_preset_seeded_custom_stages.py"
)


def load_cleanup_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migration_0050", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render_rows(
    variant: dict[str, object],
    *,
    template_key: str,
    anchor_key: str,
) -> tuple[list[str], list[str]]:
    stage_template = tpl._build_stage_template_from_process_variant(
        variant,
        key=template_key,
        fallback_label="Этап",
    )
    custom_stages = tpl._normalize_process_custom_stages_for_read(
        tpl._build_process_custom_stages_from_variant(variant, anchor_key=anchor_key),
        stage_template=stage_template,
    )
    return (
        [str(stage["label"]) for stage in stage_template],
        [str(stage["label"]) for stage in custom_stages],
    )


@pytest.mark.parametrize("flow_mode", list(VerificationFlowMode))
def test_verification_variant_renders_each_stage_once(flow_mode) -> None:
    variants = eq._build_default_verification_stage_template_variants()
    variant = tpl._select_process_template_variant(
        variants=variants,
        variant_id=None,
        route_kind="on_site" if ver._is_verification_on_site(flow_mode) else "offsite",
        flow_mode=flow_mode,
    )
    assert variant is not None

    template_labels, custom_labels = render_rows(
        variant,
        template_key="sent_to_verification_at",
        anchor_key="sent_to_verification_at",
    )

    variant_labels = [str(stage["label"]) for stage in variant["stages"]]
    assert custom_labels == []
    assert template_labels == variant_labels
    assert len(template_labels) == len(set(template_labels))


@pytest.mark.parametrize("is_on_site", [True, False])
def test_repair_variant_renders_each_stage_once(is_on_site: bool) -> None:
    variants = eq._build_default_repair_stage_template_variants()
    variant = tpl._select_process_template_variant(
        variants=variants,
        variant_id=None,
        route_kind="on_site" if is_on_site else "offsite",
    )
    assert variant is not None

    template_labels, custom_labels = render_rows(
        variant,
        template_key="sent_to_repair_at",
        anchor_key="sent_to_repair_at",
    )

    variant_labels = [str(stage["label"]) for stage in variant["stages"]]
    assert custom_labels == []
    assert template_labels == variant_labels
    assert len(template_labels) == len(set(template_labels))


def test_extra_variant_stage_becomes_custom_stage() -> None:
    variants = eq._build_default_verification_stage_template_variants()
    variant = tpl._select_process_template_variant(
        variants=variants,
        variant_id=None,
        route_kind="offsite",
        flow_mode=VerificationFlowMode.OFFSITE_WITH_DEMOLITION,
    )
    assert variant is not None
    variant = {
        **variant,
        "stages": [
            *variant["stages"],
            {"id": "extra_stage", "label": "Дополнительный этап", "deadline_days": 3},
        ],
    }

    template_labels, custom_labels = render_rows(
        variant,
        template_key="sent_to_verification_at",
        anchor_key="sent_to_verification_at",
    )

    standard_labels = [str(stage["label"]) for stage in variant["stages"][:-1]]
    assert template_labels == standard_labels
    assert custom_labels == ["Дополнительный этап"]


def test_cleanup_strips_only_preset_seeded_stages() -> None:
    migration = load_cleanup_migration()
    payload = [
        {"kind": "preset_variant", "template_variant_id": "offsite_with_demolition"},
        {
            "id": "preset_offsite_with_demolition_received_at_destination_at",
            "after_key": "sent_to_verification_at",
            "label": "Получение в пункте назначения",
            "date": None,
            "sort_order": 0,
        },
        {
            "id": "cs-test-1",
            "after_key": "sent_to_verification_at",
            "label": "Пользовательский этап",
            "date": "2026-04-01",
            "sort_order": 1,
        },
    ]

    cleaned = migration._strip_seeded_custom_stages(payload)

    assert cleaned == [
        {"kind": "preset_variant", "template_variant_id": "offsite_with_demolition"},
        {
            "id": "cs-test-1",
            "after_key": "sent_to_verification_at",
            "label": "Пользовательский этап",
            "date": "2026-04-01",
            "sort_order": 1,
        },
    ]
    assert migration._strip_seeded_custom_stages(cleaned) == cleaned
