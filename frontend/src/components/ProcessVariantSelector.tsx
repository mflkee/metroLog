import { type ProcessStageTemplateVariant } from "@/api/equipment";

type ProcessVariantSelectorProps = {
  emptyMessage?: string;
  selectedVariantId: string;
  variants: ProcessStageTemplateVariant[];
  onSelect: (variant: ProcessStageTemplateVariant) => void;
};

export function ProcessVariantSelector({
  emptyMessage,
  selectedVariantId,
  variants,
  onSelect,
}: ProcessVariantSelectorProps) {
  if (!variants.length) {
    return emptyMessage ? (
      <div className="space-y-2">
        <span className="block text-sm text-steel">Формат</span>
        <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
          {emptyMessage}
        </div>
      </div>
    ) : null;
  }

  const hasSelectedVariant = Boolean(
    selectedVariantId && variants.some((item) => item.id === selectedVariantId),
  );

  return (
    <div className="space-y-2">
      <span className="block text-sm text-steel">Формат</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {variants.map((variant, index) => {
          const selected = hasSelectedVariant
            ? variant.id === selectedVariantId
            : index === 0;
          return (
            <button
              key={variant.id}
              className={getProcessChoiceCardClass(selected)}
              onClick={() => onSelect(variant)}
              type="button"
            >
              <span className="font-semibold text-ink">
                {variant.name || "Без названия"}
              </span>
              <span className="text-xs text-steel">
                {getProcessVariantRouteLabel(variant)} · {formatStageCount(variant.stages.length)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getProcessChoiceCardClass(selected: boolean): string {
  return [
    "flex min-h-[58px] flex-col justify-center gap-1 rounded-2xl border px-3 py-2 text-left transition",
    selected
      ? "border-[color:var(--accent)] bg-[var(--accent-soft)]"
      : "border-line bg-[color:var(--tone-grandchild-bg)] hover:border-[color:var(--accent)] hover:bg-[var(--accent-soft)]",
  ].join(" ");
}

function getProcessVariantRouteLabel(variant: ProcessStageTemplateVariant): string {
  if (variant.routeKind === "offsite") {
    return variant.flowMode === "OFFSITE_WITH_DEMOLITION"
      ? "С отправкой / демонтаж"
      : "С отправкой";
  }
  const normalizedName = variant.name.toLowerCase().replace("ё", "е");
  if (
    variant.flowMode === "ONSITE_WITHOUT_DEMOLITION"
    || (normalizedName.includes("без") && normalizedName.includes("демонтаж"))
  ) {
    return "На месте без демонтажа";
  }
  if (variant.flowMode === "ONSITE_WITH_DEMOLITION") {
    return "На месте + демонтаж";
  }
  return variant.routeKind === "on_site" ? "На месте" : "С отправкой";
}

function formatStageCount(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} этапов`;
  }
  if (lastDigit === 1) {
    return `${count} этап`;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} этапа`;
  }
  return `${count} этапов`;
}
