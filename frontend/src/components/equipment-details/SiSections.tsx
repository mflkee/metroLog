import type { ReactNode } from "react";

import { formatSIListItem } from "@/pages/EquipmentDetailsPage";

// SI presentation sections for the equipment card.

export function SISection({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string | null]>;
}) {
  const visibleRows = rows.filter((row): row is [string, string] => Boolean(row[1] && row[1].trim()));
  if (!visibleRows.length) {
    return null;
  }

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <dl>
        {visibleRows.map(([label, value], index) => (
          <div
            key={label}
            className={[
              "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-4",
              index > 0 ? "border-t border-line" : "",
            ].join(" ")}
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{label}</dt>
            <dd className="min-w-0 break-words font-medium leading-6 text-ink">
              {renderTechnicalText(value, `${title}-${label}-${index}`)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SIListSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-ink">
        {items.map((item, index) => (
          <article key={`${title}-${index}`} className="tone-child rounded-2xl border border-line px-4 py-3">
            <FormattedSIListItem item={item} itemKey={`${title}-${index}`} />
          </article>
        ))}
      </div>
    </section>
  );
}

export type SIReferenceTableRow = {
  source: string | null;
  registryNumber: string | null;
  typeNumber: string | null;
  title: string | null;
  notation: string | null;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: string | null;
  rank: string | null;
  documentTitle: string | null;
};

export function SIReferenceTableSection({
  title,
  rows,
  showSource,
}: {
  title: string;
  rows: SIReferenceTableRow[];
  showSource?: boolean;
}) {
  if (!rows.length) {
    return null;
  }

  const hasSource = Boolean(showSource && rows.some((row) => row.source));

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <div className="max-h-[440px] overflow-auto">
        <table className="min-w-[1120px] table-auto border-collapse text-left text-sm">
          <thead className="tone-child sticky top-0 z-10 text-[11px] uppercase tracking-[0.12em] text-steel">
            <tr>
              {hasSource ? <th className="border-b border-line px-3 py-2 font-semibold">Раздел</th> : null}
              <th className="border-b border-line px-3 py-2 font-semibold">Номер</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Рег. № типа</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Наименование</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Обозначение</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Модификация</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Заводской номер</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Год</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Разряд</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Схема / документ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="align-top">
                {hasSource ? (
                  <td className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-steel">
                    {row.source ?? "—"}
                  </td>
                ) : null}
                <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                  {renderTechnicalText(row.registryNumber ?? "—", `${title}-${index}-number`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  {renderTechnicalText(row.typeNumber ?? "—", `${title}-${index}-type-number`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.title ?? "—", `${title}-${index}-title`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.notation ?? "—", `${title}-${index}-notation`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.modification ?? "—", `${title}-${index}-modification`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  {renderTechnicalText(row.serialNumber ?? "—", `${title}-${index}-serial`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.manufactureYear ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.rank ?? "—", `${title}-${index}-rank`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.documentTitle ?? "—", `${title}-${index}-document`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FormattedSIListItem({
  item,
  itemKey,
}: {
  item: string;
  itemKey: string;
}) {
  const formattedItem = formatSIListItem(item);

  return (
    <div className="space-y-2">
      {formattedItem.code ? (
        <div className="inline-flex max-w-full rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
          <span className="min-w-0 break-all font-mono normal-case tracking-normal">
            {renderTechnicalText(formattedItem.code, `${itemKey}-code`)}
          </span>
        </div>
      ) : null}
      <div className="space-y-1.5">
        {formattedItem.lines.map((line, lineIndex) => (
          <p
            key={`${itemKey}-line-${lineIndex}`}
            className={[
              "break-words leading-6 text-ink",
              !formattedItem.code && lineIndex === 0 ? "font-medium" : "",
            ].join(" ")}
          >
            {renderTechnicalText(line, `${itemKey}-line-${lineIndex}`)}
          </p>
        ))}
      </div>
    </div>
  );
}

export function renderTechnicalText(value: string, keyPrefix: string): ReactNode {
  const matches = Array.from(value.matchAll(/\[\^([^\]]+)\]/g));
  if (!matches.length) {
    return value;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const [matchIndex, match] of matches.entries()) {
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) {
      parts.push(value.slice(lastIndex, startIndex));
    }
    parts.push(
      <sup key={`${keyPrefix}-sup-${matchIndex}`} className="text-[0.7em] leading-none">
        {match[1]}
      </sup>,
    );
    lastIndex = startIndex + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }
  return parts;
}
