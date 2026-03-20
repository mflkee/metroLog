import type { CSSProperties } from "react";

export type ProcessTimelineStripItem = {
  key?: string;
  label: string;
  value?: string | null;
  status?: "done" | "current" | "pending" | "danger";
  position?: number;
};

export type ProcessTimelineStripMarker = {
  key?: string;
  position: number;
  tone?: "default" | "danger" | "success";
  label: string;
  value?: string | null;
};

export type ProcessTimelineStripSegment = {
  key?: string;
  start: number;
  end: number;
  tone?: "accent" | "danger" | "success";
  label?: string;
  value?: string | null;
};

type ProcessTimelineStripProps = {
  items: ProcessTimelineStripItem[];
  markers?: ProcessTimelineStripMarker[];
  segments?: ProcessTimelineStripSegment[];
  progress?: number;
  className?: string;
};

export function ProcessTimelineStrip({
  items,
  markers = [],
  segments = [],
  progress,
  className,
}: ProcessTimelineStripProps) {
  const insetPx = 18;
  const visibleItems = items
    .map((item, index) => ({
      ...item,
      position: normalizePosition(item.position ?? defaultPosition(index, items.length)),
    }))
    .filter((item) => item.status !== "pending");
  const visibleMarkers = markers.map((marker) => ({
    ...marker,
    position: normalizePosition(marker.position),
  }));
  const visibleSegments = segments.map((segment) => ({
    ...segment,
    start: normalizePosition(segment.start),
    end: normalizePosition(segment.end),
  }));
  const fillProgress = normalizePosition(progress ?? deriveProgress(items));

  return (
    <div className={["process-strip", className ?? ""].filter(Boolean).join(" ")}>
      <div
        className="process-strip__canvas"
        style={
          {
            "--process-strip-inset": `${insetPx}px`,
          } as CSSProperties
        }
      >
        <div className="process-strip__rail">
          <div className="process-strip__track" aria-hidden="true">
            <span className="process-strip__track-cap process-strip__track-cap--start">{">"}</span>
            <div className="process-strip__track-base" />
            <div className="process-strip__track-fill" style={{ width: `${fillProgress * 100}%` }} />
            {visibleSegments.map((segment, index) => (
              <button
                className={[
                  "process-strip__segment",
                  segment.tone === "danger" ? "process-strip__segment--danger" : "",
                  segment.tone === "success" ? "process-strip__segment--success" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={segment.key ?? `${segment.start}-${segment.end}-${index}`}
                style={{
                  left: `${segment.start * 100}%`,
                  width: `${Math.max(0, segment.end - segment.start) * 100}%`,
                }}
                type="button"
              >
                <span
                  className={[
                    "process-strip__track-segment",
                    segment.tone === "danger" ? "process-strip__track-segment--danger" : "",
                    segment.tone === "success" ? "process-strip__track-segment--success" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                {segment.label || segment.value ? (
                  <TooltipCard label={segment.label ?? "Интервал"} value={segment.value} />
                ) : null}
              </button>
            ))}
            <span className="process-strip__track-cap process-strip__track-cap--end">{">"}</span>
          </div>

          {visibleMarkers.map((marker, index) => (
            <button
              className={[
                "process-strip__marker-wrap",
                marker.tone === "danger" ? "process-strip__marker-wrap--danger" : "",
                marker.tone === "success" ? "process-strip__marker-wrap--success" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={marker.key ?? `${marker.position}-${index}`}
              style={buildLeftStyle(marker.position)}
              type="button"
            >
              <span className="process-strip__marker" />
              <TooltipCard label={marker.label} value={marker.value} />
            </button>
          ))}

          {visibleItems.map((item, index) => (
            <button
              className={[
                "process-strip__point",
                item.status === "done" ? "process-strip__point--done" : "",
                item.status === "current" ? "process-strip__point--current" : "",
                item.status === "danger" ? "process-strip__point--danger" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={item.key ?? `${item.label}-${item.value}-${index}`}
              style={buildLeftStyle(item.position ?? defaultPosition(index, visibleItems.length))}
              type="button"
            >
              <span className="process-strip__dot" aria-hidden="true" />
              <TooltipCard label={item.label} value={item.value} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TooltipCard({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="process-strip__tooltip">
      <span className="process-strip__label">{label}</span>
      {value ? <span className="process-strip__value">{value}</span> : null}
    </div>
  );
}

function buildLeftStyle(position: number): CSSProperties {
  const pct = (normalizePosition(position) * 100).toFixed(4);
  return {
    left: `calc(var(--process-strip-inset) + (${pct} * (100% - (var(--process-strip-inset) * 2)) / 100))`,
  };
}

function defaultPosition(index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }
  return index / (count - 1);
}

function deriveProgress(items: ProcessTimelineStripItem[]): number {
  const ordered = items
    .map((item, index) => ({
      ...item,
      position: normalizePosition(item.position ?? defaultPosition(index, items.length)),
    }))
    .sort((left, right) => left.position - right.position);

  const lastDone = [...ordered].reverse().find((item) => item.status === "done");
  if (lastDone) {
    return lastDone.position;
  }

  const current = ordered.find((item) => item.status === "current" || item.status === "danger");
  if (current) {
    return current.position;
  }

  return 0;
}

function normalizePosition(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
