import { buildRelatedEsiVerificationRows } from "@/lib/equipmentDetails";
import { renderTechnicalText } from "./SiSections";
import { ArshinVriDetail } from "@/api/arshin";
import { ESIModuleKind } from "@/api/equipment/esi";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { IconActionLink } from "@/components/IconActionLink";
import { getFirstString } from "@/lib/esiModules";
import { formatBooleanLabel, formatSIReferenceRank } from "@/pages/EquipmentDetailsPage";

// ESI composition sections for the equipment card.

export type ESIRelatedProfileRow = {
  entryId: number | null;
  moduleKind: ESIModuleKind;
  selected: boolean;
  vriId: string | null;
  rawPayloadJson: Record<string, unknown> | null;
  registryNumber: string | null;
  measurementLimit: string | null;
  rank: string | null;
  title: string | null;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
  arshinUrl: string | null;
  canDelete: boolean;
};

export type ESIRelatedVerificationRow = {
  selected: boolean;
  certificateNumber: string | null;
  registryNumber: string | null;
  modification: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  documentTitle: string | null;
  applicability: string | null;
  arshinUrl: string | null;
};

export function ESICompositionSection({
  rows,
  previewLoadingId,
  onPreview,
  onEdit,
  onDelete,
}: {
  rows: ESIRelatedProfileRow[];
  previewLoadingId: string | null;
  onPreview: (row: ESIRelatedProfileRow) => void;
  onEdit?: (row: ESIRelatedProfileRow) => void;
  onDelete?: (row: ESIRelatedProfileRow) => void;
}) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
        <table className="min-w-[1120px] w-full table-auto border-collapse text-left text-sm">
          <thead className="tone-child sticky top-0 z-10 text-[11px] uppercase tracking-[0.12em] text-steel">
            <tr>
              <th className="border-b border-line px-3 py-2 font-semibold">Номер в перечне</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Предел измерения</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Разряд</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Наименование</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Модификация</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Заводской номер</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Год</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Дата поверки</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Действительно до</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.vriId ?? row.registryNumber ?? `esi-profile-${index}`}
                className={["align-top", row.selected ? "bg-[color:var(--accent-soft)]/35" : ""].join(" ")}
              >
                <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                  {renderTechnicalText(row.registryNumber ?? "—", `esi-profile-${index}-number`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(
                    row.measurementLimit ?? "Не указан",
                    `esi-profile-${index}-measurement-limit`,
                  )}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.rank ?? "—", `esi-profile-${index}-rank`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.title ?? "—", `esi-profile-${index}-title`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.modification ?? "—", `esi-profile-${index}-modification`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  {renderTechnicalText(row.serialNumber ?? "—", `esi-profile-${index}-serial`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.manufactureYear ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.verificationDate ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.validUntil ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  <div className="icon-action-row">
                    <IconActionButton
                      disabled={!row.certificateNumber || previewLoadingId === row.registryNumber}
                      icon={
                        previewLoadingId === row.registryNumber ? (
                          <span className="text-sm leading-none">…</span>
                        ) : (
                          <Icon className="h-4 w-4" name="details" />
                        )
                      }
                      label="Подробнее"
                      size="tiny"
                      onClick={() => onPreview(row)}
                    />
                    {onEdit && row.entryId ? (
                      <IconActionButton
                        icon={<Icon className="h-4 w-4" name="edit" />}
                        label="Редактировать"
                        size="tiny"
                        onClick={() => onEdit(row)}
                      />
                    ) : null}
                    {onDelete && row.entryId && row.canDelete ? (
                      <IconActionButton
                        className="icon-action-button--danger"
                        icon={<Icon className="h-4 w-4" name="delete" />}
                        label="Удалить"
                        size="tiny"
                        onClick={() => onDelete(row)}
                      />
                    ) : null}
                    {row.arshinUrl ? (
                      <IconActionLink
                        href={row.arshinUrl}
                        icon={<Icon className="h-4 w-4" name="arshin" />}
                        label="Аршин"
                        rel="noreferrer"
                        size="tiny"
                        target="_blank"
                      />
                    ) : (
                      <span className="text-xs text-steel">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ESICompositionDetailCard({
  row,
  detail,
}: {
  row: ESIRelatedProfileRow;
  detail: ArshinVriDetail;
}) {
  const raw = (detail.rawPayloadJson ?? {}) as Record<string, unknown>;
  const verificationRows = buildRelatedEsiVerificationRows(raw).filter(
    (item) => !row.registryNumber || item.registryNumber === row.registryNumber,
  );
  const summaryRows: Array<[string, string]> = [
    ["Номер в перечне", row.registryNumber ?? "—"],
    ["Номер свидетельства", row.certificateNumber ?? detail.certificateNumber ?? "—"],
    ["Регистрационный номер типа СИ", detail.regNumber ?? "—"],
    ["Наименование типа СИ", detail.typeName ?? row.title ?? "—"],
    ["Обозначение типа СИ", detail.typeDesignation ?? "—"],
    ["Модификация СИ", detail.modification ?? row.modification ?? "—"],
    ["Заводской номер СИ", detail.serialNumber ?? row.serialNumber ?? "—"],
    ["Год выпуска СИ", detail.manufactureYear ? String(detail.manufactureYear) : row.manufactureYear ?? "—"],
    [
      "Поверочная схема",
      [getFirstString(raw.schematype), getFirstString(raw.schematitle)].filter(Boolean).join(" · ") || "—",
    ],
    ["ГПЭ, к которому прослеживается СИ", getFirstString(raw.npenumber) ?? "—"],
    [
      "Разряд эталона",
      formatSIReferenceRank(getFirstString(raw.rankcode), getFirstString(raw.rankclass)) ?? "—",
    ],
    ["Пригодность", formatBooleanLabel(detail.isUsable) ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {summaryRows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-steel">{label}</div>
            <div className="mt-2 text-sm text-ink">{value}</div>
          </div>
        ))}
      </div>

      <section className="tone-parent overflow-hidden rounded-3xl border border-line">
        <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
          Сведения о поверках
        </div>
        {verificationRows.length ? (
          <div className="max-h-[320px] overflow-auto">
            <table className="min-w-[880px] table-auto border-collapse text-left text-sm">
              <thead className="tone-child sticky top-0 z-10 text-[11px] uppercase tracking-[0.12em] text-steel">
                <tr>
                  <th className="border-b border-line px-3 py-2 font-semibold">Организация-поверитель</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Дата поверки</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Действительна до</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Номер свидетельства</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Пригодность</th>
                </tr>
              </thead>
              <tbody>
                {verificationRows.map((verificationRow, index) => (
                  <tr
                    key={`esi-verification-${verificationRow.certificateNumber ?? index}`}
                    className={verificationRow.selected ? "bg-[color:var(--accent-soft)]/35" : ""}
                  >
                    <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                      {detail.organization ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {verificationRow.verificationDate ?? detail.verificationDate ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {verificationRow.validUntil ?? detail.validUntil ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                      {renderTechnicalText(
                        verificationRow.certificateNumber ?? detail.certificateNumber ?? "—",
                        `esi-verification-certificate-${index}`,
                      )}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {verificationRow.applicability ?? formatBooleanLabel(detail.isUsable) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-4 text-sm text-steel">
            Сведения о поверках для этого профиля пока не загружены.
          </div>
        )}
      </section>
    </div>
  );
}
