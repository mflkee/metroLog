import { useState } from "react";

import { Modal } from "@/components/Modal";
import { EquipmentFolderRefreshRow } from "@/api/equipment/folders";
import { formatDateRu } from "@/lib/dates";
import { subtleButtonClass, subtleButtonWithIconClass } from "@/lib/equipmentRegistry";

type Props = {
  row: EquipmentFolderRefreshRow;
  pending?: boolean;
  onPick: (vriId: string) => void;
};

/**
 * Выбор записи Аршина для строки обновления, у которой заводской номер принадлежит нескольким
 * приборам. Раньше строка просто перечисляла типы этих приборов в примечании и предлагала
 * применить ту запись, которую выбрал поиск; выбор из списка делает решение явным.
 */
export function FolderRefreshCandidatePicker({ row, pending = false, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const candidates = row.candidates;
  const picked = candidates.find((candidate) => candidate.vriId === row.pickedCandidateVriId) ?? null;

  const handlePick = (vriId: string) => {
    onPick(vriId);
    setOpen(false);
  };

  if (candidates.length === 0) {
    return null;
  }

  const describe = (candidate: (typeof candidates)[number]) => {
    const title = [candidate.mitTitle, candidate.miModification].filter(Boolean).join(" · ");
    return title || candidate.mitNotation || "Прибор без наименования";
  };

  return (
    <div className="mt-1.5 space-y-1">
      <button
        type="button"
        className={subtleButtonWithIconClass}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {row.serialAmbiguous ? `Выбрать прибор (${candidates.length})` : "Список записей Аршина"}
      </button>
      {picked ? (
        <div className="text-xs text-ink">
          Выбрано: <span className="font-semibold">{describe(picked)}</span>
          {picked.certificateNumber ? <span className="font-mono"> · {picked.certificateNumber}</span> : null}
        </div>
      ) : null}

      <Modal
        open={open}
        title="Какой прибор в Аршине — этот?"
        description="Заводской номер есть у нескольких приборов. Выберите запись, которая относится к прибору карточки — применится именно она."
        size="xl"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-[color:var(--panel-bg)] px-3 py-2 text-xs text-steel">
            Карточка: <span className="text-ink">{row.equipmentName}</span>
            {row.equipmentModification ? <span> · {row.equipmentModification}</span> : null}
            {row.equipmentSerialNumber ? <span className="font-mono"> · зав. {row.equipmentSerialNumber}</span> : null}
            {row.currentCertificateNumber ? (
              <div className="mt-0.5 font-mono">
                Сейчас в карточке: {row.currentCertificateNumber}
                {row.currentValidDate ? ` (до ${formatDateRu(row.currentValidDate)})` : ""}
              </div>
            ) : null}
          </div>

          <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {candidates.map((candidate) => {
              const isPicked = candidate.vriId === row.pickedCandidateVriId;
              const isMatched = candidate.vriId === row.matchedVriId;
              return (
                <div
                  key={candidate.vriId}
                  className={isPicked ? "bg-[color:var(--panel-hover)] px-3 py-2" : "px-3 py-2"}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm text-ink">
                      {describe(candidate)}
                      {isPicked ? <span className="ml-2 text-xs font-semibold text-[color:var(--accent)]">выбрано</span> : null}
                      {!isPicked && isMatched ? (
                        <span className="ml-2 text-xs text-steel">предложено поиском</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={subtleButtonClass}
                      disabled={pending}
                      onClick={() => handlePick(candidate.vriId)}
                    >
                      Выбрать
                    </button>
                  </div>
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-steel sm:grid-cols-2">
                    <div>
                      Тип: <span className="font-mono">{candidate.mitNumber ?? "—"}</span>
                      {candidate.miNumber ? (
                        <span className="font-mono"> · зав. {candidate.miNumber}</span>
                      ) : null}
                    </div>
                    <div>
                      Лаборатория: <span className="text-ink">{candidate.orgTitle ?? "—"}</span>
                    </div>
                    <div>
                      Свидетельство: <span className="font-mono">{candidate.certificateNumber ?? "—"}</span>
                    </div>
                    <div>
                      Поверен: {candidate.verificationDate ? formatDateRu(candidate.verificationDate) : "—"}
                      {candidate.validDate ? ` · до ${formatDateRu(candidate.validDate)}` : ""}
                    </div>
                  </div>
                  {candidate.arshinUrl ? (
                    <a
                      className="mt-1 inline-block text-xs text-[color:var(--accent)] underline"
                      href={candidate.arshinUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Открыть в Аршине
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
