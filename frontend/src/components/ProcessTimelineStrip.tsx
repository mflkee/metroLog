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

export type ProcessTimelineStripProgressMarker = {
  label: string;
  value?: string | null;
  meta?: string | null;
  position?: number;
};

type ProcessTimelineStripProps = {
  items: ProcessTimelineStripItem[];
  markers?: ProcessTimelineStripMarker[];
  segments?: ProcessTimelineStripSegment[];
  progress?: number;
  progressMarker?: ProcessTimelineStripProgressMarker | null;
  scaleLabel?: string | null;
  className?: string;
};

export function ProcessTimelineStrip({
  items,
  markers = [],
  segments = [],
  progress,
  progressMarker,
  scaleLabel,
  className,
}: ProcessTimelineStripProps) {
  const insetPx = 18;
  const visibleItems = items
    .map((item, index) => ({
      ...item,
      position: nudgeEdgePosition(
        normalizePosition(item.position ?? defaultPosition(index, items.length)),
      ),
    }))
    .filter((item) => item.status !== "pending");
  const visibleMarkers = markers.map((marker) => ({
    ...marker,
    position: nudgeEdgePosition(normalizePosition(marker.position)),
  }));
  const visibleSegments = segments.map((segment) => ({
    ...segment,
    start: normalizePosition(segment.start),
    end: normalizePosition(segment.end),
  }));
  const fillProgress = normalizePosition(progress ?? deriveProgress(items));
  const resolvedProgressMarker = progressMarker
    ? {
        ...progressMarker,
        position: normalizePosition(progressMarker.position ?? fillProgress),
      }
    : null;

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
        {scaleLabel ? <div className="process-strip__meta">{scaleLabel}</div> : null}
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

          {resolvedProgressMarker ? (
            <button
              className="process-strip__progress-wrap"
              style={buildLeftStyle(resolvedProgressMarker.position)}
              type="button"
            >
              <span className="process-strip__progress-dot" aria-hidden="true" />
              <TooltipCard
                label={resolvedProgressMarker.label}
                meta={resolvedProgressMarker.meta}
                value={resolvedProgressMarker.value}
              />
            </button>
          ) : null}

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

function TooltipCard({
  label,
  value,
  meta,
}: {
  label: string;
  value?: string | null;
  meta?: string | null;
}) {
  return (
    <div
      className={[
        "process-strip__tooltip",
        meta ? "process-strip__tooltip--detailed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="process-strip__label">{label}</span>
      {value ? <span className="process-strip__value">{value}</span> : null}
      {meta ? <span className="process-strip__meta-line">{meta}</span> : null}
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

function nudgeEdgePosition(value: number): number {
  const normalized = normalizePosition(value);
  const startEdgePadding = 0.003;
  const endEdgePadding = 0.012;
  if (normalized <= 0) {
    return startEdgePadding;
  }
  if (normalized >= 1) {
    return 1 - endEdgePadding;
  }
  return normalized;
}
