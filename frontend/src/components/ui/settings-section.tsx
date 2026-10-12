import type { ReactNode } from "react"

/**
 * The fleet settings section: a card whose header is a disclosure control.
 *
 * metroLog's settings page is a list of these (folders, the dashboard, presets, themes,
 * notifications) and the other services grew a flat card of their own instead, so the two
 * settings screens read differently. The chevron and the collapsed row are the pattern.
 */
export function SettingsSection({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string
  description: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="tone-child overflow-hidden rounded-3xl border border-line shadow-panel">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-black/5"
        type="button"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="mt-1 max-w-[64ch] text-sm text-steel">{description}</p>
        </div>
        <svg
          className={[
            "h-5 w-5 shrink-0 text-steel transition-transform",
            expanded ? "rotate-180" : "",
          ].join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          viewBox="0 0 24 24"
        >
          <path d="m19.5 9-7.5 7.5L4.5 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded ? <div className="space-y-4 border-t border-line px-5 py-4">{children}</div> : null}
    </section>
  )
}
