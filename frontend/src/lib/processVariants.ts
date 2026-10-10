import {
  type EquipmentFolder,
  type ProcessStageTemplateVariant,
  type VerificationFlowMode,
} from "@/api/equipment";

export function getRepairPresetVariants(
  folder: EquipmentFolder | null,
): ProcessStageTemplateVariant[] {
  return folder?.deadlinePresetSnapshot?.repairStageTemplates?.variants ?? [];
}

export function getVerificationPresetVariants(
  folder: EquipmentFolder | null,
): ProcessStageTemplateVariant[] {
  return folder?.deadlinePresetSnapshot?.verificationStageTemplates?.variants ?? [];
}

export function getProcessVariantById(
  variants: ProcessStageTemplateVariant[],
  variantId: string,
): ProcessStageTemplateVariant | null {
  if (!variantId) {
    return variants[0] ?? null;
  }
  return variants.find((variant) => variant.id === variantId) ?? variants[0] ?? null;
}

export function getVerificationFlowModeForVariant(
  variant: ProcessStageTemplateVariant | null,
): VerificationFlowMode | null {
  if (!variant) {
    return null;
  }
  if (variant.routeKind === "offsite") {
    return "OFFSITE_WITH_DEMOLITION";
  }
  const normalizedName = variant.name.toLowerCase().replace("ё", "е");
  if (
    variant.flowMode === "ONSITE_WITHOUT_DEMOLITION"
    || (normalizedName.includes("без") && normalizedName.includes("демонтаж"))
  ) {
    return "ONSITE_WITHOUT_DEMOLITION";
  }
  return "ONSITE_WITH_DEMOLITION";
}

export function getProcessFormatButtonClass(active: boolean): string {
  return [
    "rounded-xl border px-3 py-2 text-sm transition",
    active
      ? "border-transparent bg-[var(--accent-soft)] text-ink"
      : "border-transparent text-ink hover:bg-[var(--accent-soft)]",
  ].join(" ");
}
