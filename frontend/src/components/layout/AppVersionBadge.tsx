import { APP_STAGE, APP_VERSION } from "@/lib/appVersion";

type AppVersionBadgeProps = {
  className?: string;
  onClick?: () => void;
};

/**
 * The version and the release channel, set next to the wordmark and on its baseline rather than in
 * a chip of their own.
 */
export function AppVersionBadge({ className, onClick }: AppVersionBadgeProps) {
  return (
    <button
      className={[
        "shrink-0 whitespace-nowrap text-[10px] font-semibold tracking-[0.08em] text-steel",
        onClick ? "transition hover:text-ink" : "",
        className ?? "",
      ].join(" ")}
      onClick={onClick}
      title={`metroLog ${APP_VERSION} (${APP_STAGE}) — что нового`}
      type="button"
    >
      <span className="whitespace-nowrap">v{APP_VERSION}</span>
      <span
        className="ml-1.5 text-[9px] uppercase tracking-[0.16em] text-steel/70"
        data-testid="app-stage"
      >
        {APP_STAGE}
      </span>
    </button>
  );
}
