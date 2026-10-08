import { APP_STAGE, APP_VERSION } from "@/lib/appVersion";

type AppVersionBadgeProps = {
  className?: string;
  onClick?: () => void;
};

export function AppVersionBadge({ className, onClick }: AppVersionBadgeProps) {
  return (
    <button
      className={[
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-steel",
        onClick ? "transition hover:border-signal-info" : "",
        className ?? "",
      ].join(" ")}
      onClick={onClick}
      title={`metroLog ${APP_VERSION} (${APP_STAGE}) — что нового`}
      type="button"
    >
      <span className="whitespace-nowrap normal-case">v{APP_VERSION}</span>
      <span
        className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] leading-none text-ink"
        data-testid="app-stage"
      >
        {APP_STAGE}
      </span>
    </button>
  );
}
