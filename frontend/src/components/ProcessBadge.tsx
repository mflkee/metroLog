type ProcessBadgeVariant =
  | "repair"
  | "verification"
  | "archive"
  | "muted"
  | "accent";

type ProcessBadgeProps = {
  label: string;
  variant?: ProcessBadgeVariant;
  className?: string;
};

const variantClassMap: Record<ProcessBadgeVariant, string> = {
  repair: "process-badge process-badge--repair border-transparent text-ink",
  verification: "process-badge process-badge--verification border-transparent text-ink",
  archive: "border border-line text-steel",
  muted: "border border-line text-steel",
  accent: "process-badge process-badge--accent border text-ink",
};

export function ProcessBadge({
  label,
  variant = "muted",
  className,
}: ProcessBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        variantClassMap[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}
