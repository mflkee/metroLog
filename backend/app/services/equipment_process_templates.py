"""Process stage templates and repair-deadline presets.

Extracted from app/services/equipment_service.py so that the service module stops
carrying this subsystem and every later extraction stops dragging it along.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, status

from app.models.equipment import DeadlinePreset, VerificationFlowMode

PROCESS_CUSTOM_STAGE_ID_SAFE_PATTERN = re.compile(r"[^a-zA-Z0-9_-]+")
PROCESS_CUSTOM_STAGE_MAX_ITEMS = 32
PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH = 120
PROCESS_TEMPLATE_VARIANT_MAX_ITEMS = 24
PROCESS_TEMPLATE_STAGE_MAX_ITEMS = 32
PROCESS_TEMPLATE_VARIANT_META_KIND = "preset_variant"
PROCESS_TEMPLATE_ROUTE_KINDS = {"offsite", "on_site"}


@dataclass(frozen=True, slots=True)
class RepairDeadlineSettings:
    repair_total_days: int
    registration_after_arrival_days: int
    incoming_control_after_receipt_days: int
    payment_after_control_days: int


DEFAULT_DEADLINE_PRESET_CODE = "tyungd"
DEFAULT_DEADLINE_PRESET_NAME = "ТЮНГД"
DEFAULT_DEADLINE_PRESET_DESCRIPTION = "Базовый пресет сроков ремонта."
DEFAULT_REPAIR_DEADLINE_SETTINGS = RepairDeadlineSettings(
    repair_total_days=100,
    registration_after_arrival_days=5,
    incoming_control_after_receipt_days=40,
    payment_after_control_days=70,
)
DEFAULT_REPAIR_STAGE_TEMPLATES = {
    "offsite": (
        {"key": "sent_to_repair_at", "label": "Демонтаж", "required": True, "enabled": True},
        {
            "key": "arrived_to_destination_at",
            "label": "Прибыло в пункт назначения",
            "required": False,
            "enabled": True,
        },
        {
            "key": "sent_from_repair_at",
            "label": "Ремонт произведен",
            "required": True,
            "enabled": True,
        },
        {
            "key": "sent_from_irkutsk_at",
            "label": "Отправлено обратно",
            "required": False,
            "enabled": True,
        },
        {
            "key": "arrived_to_lensk_at",
            "label": "Прибыло обратно",
            "required": True,
            "enabled": True,
        },
        {"key": "actually_received_at", "label": "Получено", "required": True, "enabled": True},
        {
            "key": "incoming_control_at",
            "label": "Входной контроль",
            "required": True,
            "enabled": True,
        },
        {"key": "paid_at", "label": "Оплата", "required": True, "enabled": True},
    ),
    "on_site": (
        {"key": "sent_to_repair_at", "label": "Демонтаж", "required": True, "enabled": True},
        {
            "key": "sent_from_repair_at",
            "label": "Ремонт произведен",
            "required": True,
            "enabled": True,
        },
        {"key": "arrived_to_lensk_at", "label": "Монтаж", "required": True, "enabled": True},
    ),
}
VERIFICATION_STAGE_TEMPLATE_KEY_BY_FLOW_MODE: dict[VerificationFlowMode, str] = {
    VerificationFlowMode.OFFSITE_WITH_DEMOLITION: "offsite_with_demolition",
    VerificationFlowMode.ONSITE_WITH_DEMOLITION: "on_site_with_demolition",
    VerificationFlowMode.ONSITE_WITHOUT_DEMOLITION: "on_site_without_demolition",
}
LEGACY_VERIFICATION_STAGE_TEMPLATE_KEY_BY_TEMPLATE_KEY = {
    template_key: flow_mode.value
    for flow_mode, template_key in VERIFICATION_STAGE_TEMPLATE_KEY_BY_FLOW_MODE.items()
}
DEFAULT_VERIFICATION_STAGE_TEMPLATES = {
    VERIFICATION_STAGE_TEMPLATE_KEY_BY_FLOW_MODE[VerificationFlowMode.OFFSITE_WITH_DEMOLITION]: (
        {"key": "sent_to_verification_at", "label": "Демонтаж", "required": True, "enabled": True},
        {
            "key": "received_at_destination_at",
            "label": "Получение в пункте назначения",
            "required": False,
            "enabled": True,
        },
        {"key": "handed_to_csm_at", "label": "Передано в ЦСМ", "required": False, "enabled": True},
        {
            "key": "verification_completed_at",
            "label": "Поверка выполнена",
            "required": True,
            "enabled": True,
        },
        {
            "key": "picked_up_from_csm_at",
            "label": "Получено в ЦСМ",
            "required": False,
            "enabled": True,
        },
        {
            "key": "shipped_back_at",
            "label": "Упаковано и отправлено обратно",
            "required": False,
            "enabled": True,
        },
        {
            "key": "returned_from_verification_at",
            "label": "Получено обратно",
            "required": True,
            "enabled": True,
        },
    ),
    VERIFICATION_STAGE_TEMPLATE_KEY_BY_FLOW_MODE[VerificationFlowMode.ONSITE_WITH_DEMOLITION]: (
        {"key": "sent_to_verification_at", "label": "Демонтаж", "required": True, "enabled": True},
        {
            "key": "verification_completed_at",
            "label": "Поверка произведена",
            "required": True,
            "enabled": True,
        },
        {
            "key": "returned_from_verification_at",
            "label": "Монтаж",
            "required": True,
            "enabled": True,
        },
    ),
    VERIFICATION_STAGE_TEMPLATE_KEY_BY_FLOW_MODE[VerificationFlowMode.ONSITE_WITHOUT_DEMOLITION]: (
        {
            "key": "sent_to_verification_at",
            "label": "Подготовка к поверке",
            "required": True,
            "enabled": True,
        },
        {
            "key": "verification_completed_at",
            "label": "Поверка произведена",
            "required": True,
            "enabled": True,
        },
    ),
}


def _calculate_registration_deadline_at(
    *,
    arrived_to_lensk_at: date | None,
    registration_after_arrival_days: int,
) -> date | None:
    if arrived_to_lensk_at is None:
        return None
    return arrived_to_lensk_at + timedelta(days=registration_after_arrival_days)


def _calculate_control_deadline_at(
    *,
    actually_received_at: date | None,
    registration_deadline_at: date | None,
    incoming_control_after_receipt_days: int,
) -> date | None:
    anchor = actually_received_at or registration_deadline_at
    if anchor is None:
        return None
    return anchor + timedelta(days=incoming_control_after_receipt_days)


def _calculate_payment_deadline_at(
    *,
    incoming_control_at: date | None,
    control_deadline_at: date | None,
    payment_after_control_days: int,
) -> date | None:
    anchor = incoming_control_at or control_deadline_at
    if anchor is None:
        return None
    return anchor + timedelta(days=payment_after_control_days)


def _build_deadline_preset_snapshot(
    preset: DeadlinePreset | RepairDeadlineSettings,
) -> dict[str, int | dict | None]:
    repair_templates: dict[str, object]
    verification_templates: dict[str, object]
    if isinstance(preset, DeadlinePreset):
        repair_templates = (
            _coerce_repair_stage_template_variants(preset.repair_stage_templates_json)
            or _build_default_repair_stage_template_variants()
        )
        verification_templates = (
            _coerce_verification_stage_template_variants(preset.verification_stage_templates_json)
            or _build_default_verification_stage_template_variants()
        )
    else:
        repair_templates = _build_default_repair_stage_template_variants()
        verification_templates = _build_default_verification_stage_template_variants()
    return {
        "repair_total_days": preset.repair_total_days,
        "registration_after_arrival_days": preset.registration_after_arrival_days,
        "incoming_control_after_receipt_days": preset.incoming_control_after_receipt_days,
        "payment_after_control_days": preset.payment_after_control_days,
        "repair_stage_templates_json": repair_templates,
        "verification_stage_templates_json": verification_templates,
    }


def _build_repair_deadline_settings(
    *,
    repair_total_days: int,
    registration_after_arrival_days: int,
    incoming_control_after_receipt_days: int,
    payment_after_control_days: int,
) -> RepairDeadlineSettings:
    normalized_values = {
        "repair_total_days": repair_total_days,
        "registration_after_arrival_days": registration_after_arrival_days,
        "incoming_control_after_receipt_days": incoming_control_after_receipt_days,
        "payment_after_control_days": payment_after_control_days,
    }
    for field_name, raw_value in normalized_values.items():
        if raw_value < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must not be negative.",
            )
    return RepairDeadlineSettings(**normalized_values)


def _coerce_repair_deadline_settings(payload: object | None) -> RepairDeadlineSettings | None:
    if not isinstance(payload, dict):
        return None
    try:
        return _build_repair_deadline_settings(
            repair_total_days=int(payload["repair_total_days"]),
            registration_after_arrival_days=int(payload["registration_after_arrival_days"]),
            incoming_control_after_receipt_days=int(payload["incoming_control_after_receipt_days"]),
            payment_after_control_days=int(payload["payment_after_control_days"]),
        )
    except (KeyError, TypeError, ValueError, HTTPException):
        return None


def _build_default_repair_stage_templates() -> dict[str, list[dict[str, object]]]:
    return {
        key: [dict(item) for item in items] for key, items in DEFAULT_REPAIR_STAGE_TEMPLATES.items()
    }


def _build_default_verification_stage_templates() -> dict[str, list[dict[str, object]]]:
    return {
        key: [dict(item) for item in items]
        for key, items in DEFAULT_VERIFICATION_STAGE_TEMPLATES.items()
    }


def _build_default_repair_stage_template_variants() -> dict[str, object]:
    return _normalize_repair_stage_template_variants(_build_default_repair_stage_templates())


def _build_default_verification_stage_template_variants() -> dict[str, object]:
    return _normalize_verification_stage_template_variants(
        _build_default_verification_stage_templates()
    )


def _is_process_template_variants_payload(payload: object | None) -> bool:
    if not isinstance(payload, dict):
        payload = payload.model_dump() if hasattr(payload, "model_dump") else None
    return isinstance(payload, dict) and isinstance(payload.get("variants"), list)


def _normalize_process_template_id(raw_id: object, *, prefix: str, index: int) -> str:
    candidate = PROCESS_CUSTOM_STAGE_ID_SAFE_PATTERN.sub("", str(raw_id or "").strip())[:64]
    if candidate:
        return candidate
    return f"{prefix}_{index + 1}_{uuid4().hex[:8]}"


def _normalize_optional_deadline_days(raw_value: object, *, field_label: str) -> int | None:
    if raw_value is None or raw_value == "":
        return None
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} must be a non-negative integer.",
        ) from exc
    if value < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} must be a non-negative integer.",
        )
    return value


def _normalize_process_template_stage_items(raw_items: object | None) -> list[dict[str, object]]:
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура пунктов варианта.",
        )
    if len(raw_items) > PROCESS_TEMPLATE_STAGE_MAX_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Слишком много пунктов в варианте. Максимум: {PROCESS_TEMPLATE_STAGE_MAX_ITEMS}."
            ),
        )

    normalized_input: list[tuple[int, dict[str, object]]] = []
    seen_ids: set[str] = set()
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            raw_item = raw_item.model_dump() if hasattr(raw_item, "model_dump") else None
        if not isinstance(raw_item, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Некорректная структура пункта варианта.",
            )
        stage_id = _normalize_process_template_id(
            raw_item.get("id") or raw_item.get("key"),
            prefix="stage",
            index=index,
        )
        if stage_id in seen_ids:
            stage_id = _normalize_process_template_id("", prefix="stage", index=index)
        seen_ids.add(stage_id)
        label = _normalize_required_text(
            raw_item.get("label"),
            field_label=f"Process stage label {index + 1}",
        )
        if len(label) > PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Слишком длинное название пункта. "
                    f"Максимум: {PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH} символов."
                ),
            )
        try:
            sort_order = int(raw_item.get("sort_order", index))
        except (TypeError, ValueError):
            sort_order = index
        normalized_input.append(
            (
                index,
                {
                    "id": stage_id,
                    "label": label,
                    "deadline_days": _normalize_optional_deadline_days(
                        raw_item.get("deadline_days"),
                        field_label=f"Process stage deadline {index + 1}",
                    ),
                    "sort_order": sort_order,
                },
            )
        )

    normalized_input.sort(key=lambda item: (int(item[1]["sort_order"]), item[0]))
    result: list[dict[str, object]] = []
    for sort_order, (_, item) in enumerate(normalized_input):
        result.append({**item, "sort_order": sort_order})
    return result


def _normalize_verification_variant_flow_mode(
    *,
    raw_flow_mode: object,
    route_kind: str,
    variant_name: str,
) -> str:
    if route_kind == "offsite":
        return VerificationFlowMode.OFFSITE_WITH_DEMOLITION.value

    normalized_name = variant_name.replace("ё", "е").casefold()
    if "без" in normalized_name and "демонтаж" in normalized_name:
        return VerificationFlowMode.ONSITE_WITHOUT_DEMOLITION.value

    try:
        flow_mode = VerificationFlowMode(str(raw_flow_mode))
    except ValueError:
        return VerificationFlowMode.ONSITE_WITH_DEMOLITION.value

    if flow_mode == VerificationFlowMode.OFFSITE_WITH_DEMOLITION:
        return VerificationFlowMode.ONSITE_WITH_DEMOLITION.value
    return flow_mode.value


def _normalize_process_template_variants(
    raw_payload: object | None,
    *,
    legacy_templates: dict[str, list[dict[str, object]]],
    legacy_specs: tuple[dict[str, object], ...],
) -> dict[str, object]:
    supports_flow_mode = any(spec.get("flow_mode") is not None for spec in legacy_specs)
    raw_dict = raw_payload
    if raw_dict is not None and not isinstance(raw_dict, dict):
        raw_dict = raw_dict.model_dump() if hasattr(raw_dict, "model_dump") else None
    if raw_dict is not None and not isinstance(raw_dict, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура вариантов этапов.",
        )

    if _is_process_template_variants_payload(raw_dict):
        raw_variants = raw_dict.get("variants") if isinstance(raw_dict, dict) else []
        if not isinstance(raw_variants, list):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Некорректная структура вариантов этапов.",
            )
        if len(raw_variants) > PROCESS_TEMPLATE_VARIANT_MAX_ITEMS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Слишком много вариантов этапов. "
                    f"Максимум: {PROCESS_TEMPLATE_VARIANT_MAX_ITEMS}."
                ),
            )
        normalized_input: list[tuple[int, dict[str, object]]] = []
        seen_ids: set[str] = set()
        for index, raw_variant in enumerate(raw_variants):
            if not isinstance(raw_variant, dict):
                raw_variant = (
                    raw_variant.model_dump() if hasattr(raw_variant, "model_dump") else None
                )
            if not isinstance(raw_variant, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Некорректная структура варианта этапов.",
                )
            variant_id = _normalize_process_template_id(
                raw_variant.get("id"),
                prefix="variant",
                index=index,
            )
            if variant_id in seen_ids:
                variant_id = _normalize_process_template_id("", prefix="variant", index=index)
            seen_ids.add(variant_id)
            route_kind = str(raw_variant.get("route_kind") or "offsite").strip()
            if route_kind not in PROCESS_TEMPLATE_ROUTE_KINDS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Некорректный тип маршрута варианта.",
                )
            name = _normalize_required_text(
                raw_variant.get("name"),
                field_label=f"Process variant name {index + 1}",
            )[:PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH]
            flow_mode = (
                _normalize_verification_variant_flow_mode(
                    raw_flow_mode=raw_variant.get("flow_mode"),
                    route_kind=route_kind,
                    variant_name=name,
                )
                if supports_flow_mode
                else None
            )
            try:
                sort_order = int(raw_variant.get("sort_order", index))
            except (TypeError, ValueError):
                sort_order = index
            normalized_input.append(
                (
                    index,
                    {
                        "id": variant_id,
                        "name": name,
                        "route_kind": route_kind,
                        "flow_mode": flow_mode,
                        "stages": _normalize_process_template_stage_items(
                            raw_variant.get("stages")
                        ),
                        "sort_order": sort_order,
                    },
                )
            )

        normalized_input.sort(key=lambda item: (int(item[1]["sort_order"]), item[0]))
        return {
            "variants": [
                {**item, "sort_order": sort_order}
                for sort_order, (_, item) in enumerate(normalized_input)
            ]
        }

    variants: list[dict[str, object]] = []
    for index, spec in enumerate(legacy_specs):
        template_key = str(spec["template_key"])
        stages = [
            {
                "id": str(item["key"]),
                "label": str(item["label"]),
                "deadline_days": None,
                "sort_order": item_index,
            }
            for item_index, item in enumerate(
                _get_enabled_stage_template_items(legacy_templates.get(template_key, []))
            )
        ]
        if not stages:
            continue
        variants.append(
            {
                "id": template_key,
                "name": str(spec["name"]),
                "route_kind": str(spec["route_kind"]),
                "flow_mode": spec.get("flow_mode"),
                "stages": stages,
                "sort_order": index,
            }
        )
    return {"variants": variants}


REPAIR_STANDARD_STAGE_KEYS_BY_ROUTE_KIND: dict[str, tuple[str, ...]] = {
    "on_site": (
        "sent_to_repair_at",
        "sent_from_repair_at",
        "arrived_to_lensk_at",
    ),
    "offsite": (
        "sent_to_repair_at",
        "arrived_to_destination_at",
        "sent_from_repair_at",
        "sent_from_irkutsk_at",
        "arrived_to_lensk_at",
        "actually_received_at",
        "incoming_control_at",
        "paid_at",
    ),
}
VERIFICATION_STANDARD_STAGE_KEYS_BY_FLOW_MODE: dict[str, tuple[str, ...]] = {
    "offsite_with_demolition": (
        "sent_to_verification_at",
        "received_at_destination_at",
        "handed_to_csm_at",
        "verification_completed_at",
        "picked_up_from_csm_at",
        "shipped_back_at",
        "returned_from_verification_at",
    ),
    "on_site_with_demolition": (
        "sent_to_verification_at",
        "verification_completed_at",
        "returned_from_verification_at",
    ),
    "on_site_without_demolition": (
        "sent_to_verification_at",
        "verification_completed_at",
    ),
}


def _apply_standard_stage_keys(
    variants: dict[str, object],
    key_mapping: dict[str, tuple[str, ...]],
    lookup_field: str,
) -> dict[str, object]:
    raw_variants = variants.get("variants")
    if not isinstance(raw_variants, list):
        return variants
    for variant in raw_variants:
        if not isinstance(variant, dict):
            continue
        lookup_value = str(variant.get(lookup_field) or "").strip()
        standard_keys = key_mapping.get(lookup_value)
        if not standard_keys:
            continue
        stages = variant.get("stages")
        if not isinstance(stages, list):
            continue
        for index, stage in enumerate(stages):
            if not isinstance(stage, dict):
                continue
            if index < len(standard_keys) and stage.get("id") not in standard_keys:
                stage["id"] = standard_keys[index]
    return variants


def _normalize_repair_stage_template_variants(raw_payload: object | None) -> dict[str, object]:
    legacy_templates = _normalize_repair_stage_templates(raw_payload)
    result = _normalize_process_template_variants(
        raw_payload,
        legacy_templates=legacy_templates,
        legacy_specs=(
            {
                "template_key": "on_site",
                "name": "По месту",
                "route_kind": "on_site",
                "flow_mode": None,
            },
            {
                "template_key": "offsite",
                "name": "С отправкой",
                "route_kind": "offsite",
                "flow_mode": None,
            },
        ),
    )
    return _apply_standard_stage_keys(
        result,
        REPAIR_STANDARD_STAGE_KEYS_BY_ROUTE_KIND,
        lookup_field="route_kind",
    )


def _normalize_verification_stage_template_variants(
    raw_payload: object | None,
) -> dict[str, object]:
    legacy_templates = _normalize_verification_stage_templates(raw_payload)
    result = _normalize_process_template_variants(
        raw_payload,
        legacy_templates=legacy_templates,
        legacy_specs=(
            {
                "template_key": "offsite_with_demolition",
                "name": "С отправкой",
                "route_kind": "offsite",
                "flow_mode": VerificationFlowMode.OFFSITE_WITH_DEMOLITION.value,
            },
            {
                "template_key": "on_site_with_demolition",
                "name": "По месту",
                "route_kind": "on_site",
                "flow_mode": VerificationFlowMode.ONSITE_WITH_DEMOLITION.value,
            },
            {
                "template_key": "on_site_without_demolition",
                "name": "По месту без демонтажа",
                "route_kind": "on_site",
                "flow_mode": VerificationFlowMode.ONSITE_WITHOUT_DEMOLITION.value,
            },
        ),
    )
    return _apply_standard_stage_keys(
        result,
        VERIFICATION_STANDARD_STAGE_KEYS_BY_FLOW_MODE,
        lookup_field="flow_mode",
    )


def _coerce_repair_stage_template_variants(payload: object | None) -> dict[str, object] | None:
    if payload is None:
        return None
    try:
        return _normalize_repair_stage_template_variants(payload)
    except HTTPException:
        return None


def _coerce_verification_stage_template_variants(
    payload: object | None,
) -> dict[str, object] | None:
    if payload is None:
        return None
    try:
        return _normalize_verification_stage_template_variants(payload)
    except HTTPException:
        return None


def _iter_process_template_variants(variants: dict[str, object]) -> list[dict[str, object]]:
    raw_variants = variants.get("variants")
    if not isinstance(raw_variants, list):
        return []
    return [item for item in raw_variants if isinstance(item, dict)]


def _select_process_template_variant(
    *,
    variants: dict[str, object],
    variant_id: str | None,
    route_kind: str,
    flow_mode: VerificationFlowMode | None = None,
) -> dict[str, object] | None:
    items = _iter_process_template_variants(variants)
    normalized_variant_id = str(variant_id or "").strip()
    if normalized_variant_id:
        found = next(
            (item for item in items if str(item.get("id") or "") == normalized_variant_id),
            None,
        )
        if found is not None:
            return found
    if flow_mode is not None:
        found = next(
            (
                item
                for item in items
                if str(item.get("flow_mode") or "") == flow_mode.value
                and str(item.get("route_kind") or "") == route_kind
            ),
            None,
        )
        if found is not None:
            return found
    found = next(
        (item for item in items if str(item.get("route_kind") or "") == route_kind),
        None,
    )
    return found if found is not None else (items[0] if items else None)


def _resolve_standard_stage_key_count(variant: dict[str, object] | None) -> int | None:
    """Number of standard milestone stages for a variant's process flow.

    A variant's stages are positional: the first ``count`` of them map onto the
    standard milestone keys of the flow (``_apply_standard_stage_keys``), and any
    stages beyond that count have no standard form field. Returns ``None`` when
    the flow cannot be resolved, in which case partitioning is skipped.
    """
    if not isinstance(variant, dict):
        return None
    # ``flow_mode`` is stored as the enum name (``OFFSITE_WITH_DEMOLITION``)
    # while the key maps use the lower-case enum values, so normalize both.
    flow_mode = str(variant.get("flow_mode") or "").strip().lower()
    if flow_mode:
        verification_keys = VERIFICATION_STANDARD_STAGE_KEYS_BY_FLOW_MODE.get(flow_mode)
        return len(verification_keys) if verification_keys is not None else None
    route_kind = str(variant.get("route_kind") or "").strip().lower()
    repair_keys = REPAIR_STANDARD_STAGE_KEYS_BY_ROUTE_KIND.get(route_kind)
    if repair_keys is not None:
        return len(repair_keys)
    return None


def _partition_process_variant_stages(
    variant: dict[str, object] | None,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Split a variant's stages into (standard template stages, extra stages).

    Extra stages have no standard milestone key and must be exposed as custom
    stages so they render exactly once, after the standard template stages.
    """
    stages = variant.get("stages") if isinstance(variant, dict) else None
    normalized = (
        [stage for stage in stages if isinstance(stage, dict)] if isinstance(stages, list) else []
    )
    standard_count = _resolve_standard_stage_key_count(variant)
    if standard_count is None:
        return normalized, []
    return normalized[:standard_count], normalized[standard_count:]


def _build_stage_template_from_process_variant(
    variant: dict[str, object] | None,
    *,
    key: str,
    fallback_label: str,
) -> list[dict[str, object]]:
    standard_stages, _ = _partition_process_variant_stages(variant)
    if standard_stages:
        return [
            {
                "key": str(stage.get("id") or stage.get("key") or key),
                "label": str(stage.get("label") or fallback_label),
                "required": bool(stage.get("required", True)),
                "enabled": bool(stage.get("enabled", True)),
            }
            for stage in standard_stages
        ]
    return [
        {
            "key": key,
            "label": fallback_label,
            "required": True,
            "enabled": True,
        }
    ]


def _build_process_custom_stages_from_variant(
    variant: dict[str, object] | None,
    *,
    anchor_key: str,
) -> list[dict[str, object]]:
    if not isinstance(variant, dict):
        return []
    result: list[dict[str, object]] = [
        {
            "kind": PROCESS_TEMPLATE_VARIANT_META_KIND,
            "template_variant_id": str(variant.get("id") or ""),
        }
    ]
    _, extra_stages = _partition_process_variant_stages(variant)
    for sort_order, stage in enumerate(extra_stages):
        if not isinstance(stage, dict):
            continue
        label = str(stage.get("label") or "").strip()
        if not label:
            continue
        result.append(
            {
                "id": _normalize_process_custom_stage_id(
                    f"preset_{variant.get('id')}_{stage.get('id')}",
                    index=sort_order,
                ),
                "after_key": anchor_key,
                "label": label[:PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH],
                "date": None,
                "deadline_days": stage.get("deadline_days"),
                "sort_order": sort_order,
            }
        )
        if len(result) > PROCESS_CUSTOM_STAGE_MAX_ITEMS:
            break
    return result


def _extract_process_template_variant_id(raw_items: object | None) -> str | None:
    if not isinstance(raw_items, list):
        return None
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        if raw_item.get("kind") != PROCESS_TEMPLATE_VARIANT_META_KIND:
            continue
        variant_id = str(raw_item.get("template_variant_id") or "").strip()
        if variant_id:
            return variant_id
    return None


def _merge_process_template_variant_meta(
    existing_items: object | None,
    next_items: object | None,
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    if isinstance(existing_items, list):
        result.extend(
            dict(item)
            for item in existing_items
            if isinstance(item, dict) and item.get("kind") == PROCESS_TEMPLATE_VARIANT_META_KIND
        )
    result.extend(_clone_process_custom_stages(next_items))
    return result


def _normalize_stage_template_items(
    *,
    raw_items: object | None,
    default_items: tuple[dict[str, object], ...],
) -> list[dict[str, object]]:
    raw_by_key: dict[str, object] = {}
    if raw_items is not None:
        if not isinstance(raw_items, list):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Некорректная структура шаблона этапов.",
            )
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                raw_item = raw_item.model_dump() if hasattr(raw_item, "model_dump") else None
            if not isinstance(raw_item, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Некорректная структура этапа.",
                )
            key = str(raw_item.get("key") or "").strip()
            if not key:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="У этапа должен быть ключ.",
                )
            if key in raw_by_key:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Ключ этапа не должен повторяться.",
                )
            raw_by_key[key] = raw_item

    is_explicit_template = raw_items is not None
    normalized: list[dict[str, object]] = []
    for default_item in default_items:
        key = str(default_item["key"])
        raw_item = raw_by_key.pop(key, None)
        required = bool(default_item["required"])
        if raw_item is None:
            label = str(default_item["label"])
            enabled = False if is_explicit_template else bool(default_item["enabled"])
        else:
            label = _normalize_required_text(
                raw_item.get("label"),
                field_label=f"Stage label {key}",
            )
            enabled = bool(raw_item.get("enabled") if "enabled" in raw_item else True)
        normalized.append(
            {
                "key": key,
                "label": label,
                "required": required,
                "enabled": enabled,
            }
        )

    if raw_by_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Шаблон этапов содержит неизвестные ключи.",
        )
    return normalized


def _normalize_repair_stage_templates(
    raw_payload: object | None,
) -> dict[str, list[dict[str, object]]]:
    raw_dict = raw_payload
    if raw_dict is not None and not isinstance(raw_dict, dict):
        raw_dict = raw_dict.model_dump() if hasattr(raw_dict, "model_dump") else None
    if raw_dict is not None and not isinstance(raw_dict, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура шаблонов ремонта.",
        )
    return {
        key: _normalize_stage_template_items(
            raw_items=raw_dict.get(key) if isinstance(raw_dict, dict) else None,
            default_items=default_items,
        )
        for key, default_items in DEFAULT_REPAIR_STAGE_TEMPLATES.items()
    }


def _normalize_verification_stage_templates(
    raw_payload: object | None,
) -> dict[str, list[dict[str, object]]]:
    raw_dict = raw_payload
    if raw_dict is not None and not isinstance(raw_dict, dict):
        raw_dict = raw_dict.model_dump() if hasattr(raw_dict, "model_dump") else None
    if raw_dict is not None and not isinstance(raw_dict, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура шаблонов поверки.",
        )
    return {
        key: _normalize_stage_template_items(
            raw_items=_extract_verification_stage_template_items(
                raw_dict,
                template_key=key,
            ),
            default_items=default_items,
        )
        for key, default_items in DEFAULT_VERIFICATION_STAGE_TEMPLATES.items()
    }


def _extract_verification_stage_template_items(
    raw_dict: dict | None,
    *,
    template_key: str,
) -> object | None:
    if not isinstance(raw_dict, dict):
        return None
    if template_key in raw_dict:
        return raw_dict.get(template_key)
    legacy_key = LEGACY_VERIFICATION_STAGE_TEMPLATE_KEY_BY_TEMPLATE_KEY.get(template_key)
    if legacy_key is None:
        return None
    return raw_dict.get(legacy_key)


def _coerce_repair_stage_templates(
    payload: object | None,
) -> dict[str, list[dict[str, object]]] | None:
    if payload is None:
        return None
    try:
        return _normalize_repair_stage_templates(payload)
    except HTTPException:
        return None


def _coerce_verification_stage_templates(
    payload: object | None,
) -> dict[str, list[dict[str, object]]] | None:
    if payload is None:
        return None
    try:
        return _normalize_verification_stage_templates(payload)
    except HTTPException:
        return None


def _get_enabled_stage_template_items(
    items: list[dict[str, object]],
) -> list[dict[str, object]]:
    return [item for item in items if bool(item.get("enabled"))]


def _normalize_process_custom_stage_id(raw_id: str, *, index: int) -> str:
    candidate = PROCESS_CUSTOM_STAGE_ID_SAFE_PATTERN.sub("", raw_id.strip())[:64]
    if candidate:
        return candidate
    return f"cs_{index + 1}_{uuid4().hex[:10]}"


def _coerce_process_custom_stage_date(raw_value: object) -> str | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, date) and not isinstance(raw_value, datetime):
        return raw_value.isoformat()
    if isinstance(raw_value, datetime):
        return raw_value.date().isoformat()
    if isinstance(raw_value, str):
        try:
            return date.fromisoformat(raw_value[:10]).isoformat()
        except ValueError:
            return None
    return None


def _normalize_process_custom_stages_for_read(
    raw_items: object | None,
    *,
    stage_template: list[dict[str, object]],
) -> list[dict[str, object]]:
    if not isinstance(raw_items, list):
        return []

    stage_order_by_key = {str(item["key"]): index for index, item in enumerate(stage_template)}
    if not stage_order_by_key:
        return []

    normalized_with_index: list[tuple[int, dict[str, object]]] = []
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            continue
        after_key = str(raw_item.get("after_key") or "").strip()
        if after_key not in stage_order_by_key:
            continue
        label = str(raw_item.get("label") or "").strip()
        if not label:
            continue
        normalized_with_index.append(
            (
                index,
                {
                    "id": _normalize_process_custom_stage_id(
                        str(raw_item.get("id") or ""),
                        index=index,
                    ),
                    "after_key": after_key,
                    "label": label[:PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH],
                    "date": _coerce_process_custom_stage_date(raw_item.get("date")),
                    "deadline_days": _normalize_optional_deadline_days(
                        raw_item.get("deadline_days"),
                        field_label=f"Custom stage deadline {index + 1}",
                    ),
                    "sort_order": int(raw_item.get("sort_order") or 0),
                },
            )
        )
        if len(normalized_with_index) >= PROCESS_CUSTOM_STAGE_MAX_ITEMS:
            break

    normalized_with_index.sort(
        key=lambda item: (
            stage_order_by_key[str(item[1]["after_key"])],
            int(item[1]["sort_order"]),
            item[0],
        )
    )

    result: list[dict[str, object]] = []
    next_sort_order_by_after_key: dict[str, int] = {}
    seen_ids: set[str] = set()
    for _, item in normalized_with_index:
        stage_id = str(item["id"])
        if stage_id in seen_ids:
            stage_id = _normalize_process_custom_stage_id("", index=len(result))
            item["id"] = stage_id
        seen_ids.add(stage_id)

        after_key = str(item["after_key"])
        sort_order = next_sort_order_by_after_key.get(after_key, 0)
        next_sort_order_by_after_key[after_key] = sort_order + 1
        result.append(
            {
                "id": stage_id,
                "after_key": after_key,
                "label": str(item["label"]),
                "date": item["date"],
                "deadline_days": item["deadline_days"],
                "sort_order": sort_order,
            }
        )
    return result


def _normalize_process_custom_stages_for_write(
    raw_items: object | None,
    *,
    stage_template: list[dict[str, object]],
) -> list[dict[str, object]]:
    if raw_items is None:
        return []
    if not isinstance(raw_items, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура дополнительных этапов.",
        )
    if len(raw_items) > PROCESS_CUSTOM_STAGE_MAX_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Слишком много дополнительных этапов. Максимум: {PROCESS_CUSTOM_STAGE_MAX_ITEMS}."
            ),
        )

    stage_order_by_key = {str(item["key"]): index for index, item in enumerate(stage_template)}
    if not stage_order_by_key:
        return []

    normalized_input: list[tuple[int, dict[str, object]]] = []
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            raw_item = raw_item.model_dump() if hasattr(raw_item, "model_dump") else None
        if not isinstance(raw_item, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Некорректная структура дополнительного этапа.",
            )

        after_key = _normalize_required_text(
            raw_item.get("after_key"),
            field_label=f"Custom stage after key {index + 1}",
        )
        if after_key not in stage_order_by_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Дополнительный этап привязан к неизвестному пункту.",
            )

        label = _normalize_required_text(
            raw_item.get("label"),
            field_label=f"Custom stage label {index + 1}",
        )
        if len(label) > PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Слишком длинное название дополнительного этапа. "
                    f"Максимум: {PROCESS_CUSTOM_STAGE_MAX_LABEL_LENGTH} символов."
                ),
            )

        sort_order_raw = raw_item.get("sort_order", index)
        try:
            sort_order = int(sort_order_raw)
        except (TypeError, ValueError):
            sort_order = index

        parsed_date = _coerce_process_custom_stage_date(raw_item.get("date"))
        if raw_item.get("date") is not None and parsed_date is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Некорректная дата дополнительного этапа.",
            )

        normalized_input.append(
            (
                index,
                {
                    "id": _normalize_process_custom_stage_id(
                        str(raw_item.get("id") or ""),
                        index=index,
                    ),
                    "after_key": after_key,
                    "label": label,
                    "date": parsed_date,
                    "deadline_days": _normalize_optional_deadline_days(
                        raw_item.get("deadline_days"),
                        field_label=f"Custom stage deadline {index + 1}",
                    ),
                    "sort_order": sort_order,
                },
            )
        )

    normalized_input.sort(
        key=lambda item: (
            stage_order_by_key[str(item[1]["after_key"])],
            int(item[1]["sort_order"]),
            item[0],
        )
    )

    result: list[dict[str, object]] = []
    next_sort_order_by_after_key: dict[str, int] = {}
    seen_ids: set[str] = set()
    for _, item in normalized_input:
        stage_id = str(item["id"])
        if stage_id in seen_ids:
            stage_id = _normalize_process_custom_stage_id("", index=len(result))
            item["id"] = stage_id
        seen_ids.add(stage_id)

        after_key = str(item["after_key"])
        sort_order = next_sort_order_by_after_key.get(after_key, 0)
        next_sort_order_by_after_key[after_key] = sort_order + 1
        result.append(
            {
                "id": stage_id,
                "after_key": after_key,
                "label": str(item["label"]),
                "date": item["date"],
                "deadline_days": item["deadline_days"],
                "sort_order": sort_order,
            }
        )
    return result


def _clone_process_custom_stages(raw_items: object | None) -> list[dict[str, object]]:
    if not isinstance(raw_items, list):
        return []
    return [dict(item) for item in raw_items if isinstance(item, dict)]


def _get_verification_stage_template_key(flow_mode: VerificationFlowMode) -> str:
    return VERIFICATION_STAGE_TEMPLATE_KEY_BY_FLOW_MODE[flow_mode]


def _normalize_required_text(value: str | None, *, field_label: str) -> str:
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} must not be empty.",
        )
    normalized = value.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} must not be empty.",
        )
    if len(normalized) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} is too long. Maximum length is 255 characters.",
        )
    return normalized


def _get_stage_template_labels(
    stage_template: list[dict[str, object]],
) -> tuple[tuple[str, str], ...]:
    return tuple((str(item["key"]), str(item["label"])) for item in stage_template[1:])
