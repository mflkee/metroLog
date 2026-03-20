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
  repair: "border-transparent bg-[color:rgba(192,92,74,0.16)] text-ink",
  verification: "border-transparent bg-[color:rgba(82,129,164,0.18)] text-ink",
  archive: "border border-line text-steel",
  muted: "border border-line text-steel",
  accent: "border border-signal-info/40 bg-[color:var(--accent-soft)] text-ink",
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
