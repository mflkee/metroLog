import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchArshinVriDetail,
  searchArshinByCertificate,
  type ArshinSearchResult,
} from "@/api/arshin";
import {
  buildSIVerificationPayloadFromArshin,
  createEquipment,
  equipmentStatusLabels,
  fetchEquipmentFolders,
  type CreateEquipmentPayload,
  type EquipmentFolder,
  type EquipmentStatus,
} from "@/api/equipment";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

type AddToFolderFormState = {
  folderId: string;
  objectName: string;
  status: EquipmentStatus;
  currentLocationManual: string;
};

type AddedItem = {
  equipmentId: number;
  equipmentName: string;
  vriId: string;
};

type AddToFolderResult = {
  created: AddedItem[];
  errors: Array<{ vriId: string; message: string }>;
};

const defaultAddToFolderForm: AddToFolderFormState = {
  folderId: "",
  objectName: "",
  status: "IN_WORK",
  currentLocationManual: "",
};

export function ArshinPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";

  const [certificateNumber, setCertificateNumber] = useState("");
  const [searchResults, setSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddToFolderFormState>(defaultAddToFolderForm);
  const [addSummary, setAddSummary] = useState<AddToFolderResult | null>(null);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const searchMutation = useMutation({
    mutationFn: (value: string) => searchArshinByCertificate(token ?? "", { certificateNumber: value }),
    onSuccess: (results) => {
      setSearchResults(results);
      setSelectedResultIds([]);
    },
  });

  const addToFolderMutation = useMutation<AddToFolderResult, Error, void>({
    mutationFn: async () => {
      const selectedFolderId = Number(addForm.folderId);
      const selectedItems = searchResults.filter((item) => selectedResultIds.includes(item.vriId));
      const created: AddedItem[] = [];
      const errors: Array<{ vriId: string; message: string }> = [];

      for (const result of selectedItems) {
        try {
          const detail = await fetchArshinVriDetail(token ?? "", result.vriId);
          const payload: CreateEquipmentPayload = {
            folderId: selectedFolderId,
            groupId: null,
            objectName: addForm.objectName.trim(),
            equipmentType: "SI",
            name: detail.typeName ?? result.mitTitle ?? "СИ из Аршина",
            modification: detail.modification ?? result.miModification ?? "",
            serialNumber: detail.serialNumber ?? result.miNumber ?? "",
            manufactureYear: detail.manufactureYear,
            status: addForm.status,
            currentLocationManual: addForm.currentLocationManual.trim(),
            complianceDate: null,
            complianceIntervalMonths: null,
            siVerification: buildSIVerificationPayloadFromArshin(result, detail),
          };
          const equipmentItem = await createEquipment(token ?? "", payload);
          created.push({
            equipmentId: equipmentItem.id,
            equipmentName: equipmentItem.name,
            vriId: result.vriId,
          });
        } catch (error) {
          errors.push({
            vriId: result.vriId,
            message: error instanceof Error ? error.message : "Не удалось добавить запись в папку.",
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      return { created, errors };
    },
    onSuccess: (result) => {
      setAddSummary(result);
      setSelectedResultIds([]);
      if (result.created.length > 0) {
        setAddModalOpen(false);
      }
    },
  });

  const selectedFolder = useMemo(
    () => foldersQuery.data?.find((folder) => String(folder.id) === addForm.folderId) ?? null,
    [addForm.folderId, foldersQuery.data],
  );

  const selectableFolderOptions = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);

  const selectedResults = useMemo(
    () => searchResults.filter((item) => selectedResultIds.includes(item.vriId)),
    [searchResults, selectedResultIds],
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCertificateNumber = certificateNumber.trim();
    if (!normalizedCertificateNumber) {
      setSearchResults([]);
      setSelectedResultIds([]);
      return;
    }
    setAddSummary(null);
    void searchMutation.mutateAsync(normalizedCertificateNumber);
  }

  function openAddModal() {
    if (!selectedResults.length) {
      return;
    }

    const firstFolder = selectableFolderOptions[0] ?? null;
    setAddForm({
      folderId: firstFolder ? String(firstFolder.id) : "",
      objectName: firstFolder?.name ?? "",
      status: "IN_WORK",
      currentLocationManual: "",
    });
    setAddModalOpen(true);
  }

  function closeAddModal() {
    setAddModalOpen(false);
    addToFolderMutation.reset();
  }

  function toggleResultSelection(vriId: string) {
    setSelectedResultIds((current) =>
      current.includes(vriId) ? current.filter((item) => item !== vriId) : [...current, vriId],
    );
  }

  function toggleSelectAll() {
    if (selectedResultIds.length === searchResults.length) {
      setSelectedResultIds([]);
      return;
    }
    setSelectedResultIds(searchResults.map((item) => item.vriId));
  }

  function handleFolderChange(folderId: string) {
    const folder = selectableFolderOptions.find((item) => String(item.id) === folderId) ?? null;
    setAddForm((current) => ({
      ...current,
      folderId,
      objectName: current.objectName.trim() ? current.objectName : folder?.name ?? "",
    }));
  }

  async function handleAddToFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addToFolderMutation.mutateAsync();
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Аршин"
        description="Отдельная вкладка для поиска СИ по API Аршина. Найденные записи можно отметить в таблице и сразу добавить в выбранную папку как новые приборы категории SI."
      />

      <div className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={handleSearchSubmit}>
          <label className="block text-sm text-steel">
            Номер свидетельства
            <AutocompleteInput
              className="form-input"
              placeholder="Например С-АСГ/07-03-2026/509468383"
              suggestions={[]}
              value={certificateNumber}
              onChange={setCertificateNumber}
            />
          </label>
          <div className="flex items-end">
            <button className="btn-primary disabled:opacity-60" disabled={searchMutation.isPending} type="submit">
              {searchMutation.isPending ? "Ищем..." : "Найти в Аршине"}
            </button>
          </div>
          <div className="flex items-end justify-end">
            <button
              className="btn-accent disabled:opacity-60"
              disabled={!canManage || selectedResults.length === 0 || foldersQuery.isLoading || !foldersQuery.data?.length}
              type="button"
              onClick={openAddModal}
            >
              Добавить в папку
            </button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-steel">
          <span className="rounded-full border border-line px-3 py-1">
            Найдено: {searchResults.length}
          </span>
          <span className="rounded-full border border-line px-3 py-1">
            Отмечено: {selectedResults.length}
          </span>
          {!canManage ? (
            <span className="rounded-full border border-line px-3 py-1 text-[#8c6a2b]">
              Добавление в папку доступно ролям ADMINISTRATOR и MKAIR
            </span>
          ) : null}
        </div>

        {searchMutation.isError ? (
          <p className="mt-4 text-sm text-[#b04c43]">
            {searchMutation.error instanceof Error
              ? searchMutation.error.message
              : "Не удалось выполнить поиск в Аршине."}
          </p>
        ) : null}

        {searchMutation.isSuccess && searchResults.length === 0 ? (
          <p className="mt-4 text-sm text-steel">По этому свидетельству ничего не найдено.</p>
        ) : null}
      </div>

      {addSummary ? (
        <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Результат добавления</h2>
            <div className="flex gap-2 text-xs text-steel">
              <span className="rounded-full border border-line px-3 py-1">Создано: {addSummary.created.length}</span>
              <span className="rounded-full border border-line px-3 py-1">Ошибок: {addSummary.errors.length}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              {addSummary.created.length ? (
                addSummary.created.map((item) => (
                  <Link
                    key={item.vriId}
                    className="block rounded-2xl border border-line px-4 py-3 text-sm text-ink transition hover:border-signal-info"
                    to={`/equipment/${item.equipmentId}`}
                  >
                    <div className="font-semibold">{item.equipmentName}</div>
                    <div className="mt-1 text-xs text-steel">vri_id: {item.vriId}</div>
                  </Link>
                ))
              ) : (
                <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                  Новые приборы не были созданы.
                </div>
              )}
            </div>
            <div className="space-y-2">
              {addSummary.errors.length ? (
                addSummary.errors.map((item) => (
                  <div key={`${item.vriId}-${item.message}`} className="rounded-2xl border border-[#ead2cf] bg-[#fff7f6] px-4 py-3 text-sm text-[#8f443d]">
                    <div className="font-semibold">vri_id: {item.vriId}</div>
                    <div className="mt-1">{item.message}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                  Ошибок при добавлении не было.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="tone-parent overflow-hidden rounded-3xl border border-line shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="tone-child text-left text-xs uppercase tracking-wide text-steel">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <input
                    aria-label="Выбрать все записи Аршина"
                    checked={searchResults.length > 0 && selectedResultIds.length === searchResults.length}
                    disabled={!searchResults.length}
                    type="checkbox"
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Наименование</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Модификация</th>
                <th className="px-4 py-3 font-medium">Серийный номер</th>
                <th className="px-4 py-3 font-medium">Свидетельство</th>
                <th className="px-4 py-3 font-medium">Организация</th>
                <th className="px-4 py-3 font-medium">Дата поверки</th>
                <th className="px-4 py-3 font-medium">Действительна до</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80 bg-[color:var(--panel)] text-ink">
              {searchResults.length ? (
                searchResults.map((item) => {
                  const isSelected = selectedResultIds.includes(item.vriId);
                  return (
                    <tr key={item.vriId} className={isSelected ? "bg-[color:var(--accent-soft)]/50" : ""}>
                      <td className="px-4 py-3 align-top">
                        <input
                          aria-label={`Выбрать ${item.mitTitle ?? item.vriId}`}
                          checked={isSelected}
                          type="checkbox"
                          onChange={() => toggleResultSelection(item.vriId)}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-ink">{item.mitTitle ?? "СИ без наименования"}</div>
                        <div className="mt-1 text-xs text-steel">vri_id: {item.vriId}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-steel">{item.mitNotation ?? "—"}</td>
                      <td className="px-4 py-3 align-top text-steel">{item.miModification ?? "—"}</td>
                      <td className="px-4 py-3 align-top text-steel">{item.miNumber ?? "—"}</td>
                      <td className="px-4 py-3 align-top text-steel">{item.resultDocnum ?? "—"}</td>
                      <td className="px-4 py-3 align-top text-steel">{item.orgTitle ?? "—"}</td>
                      <td className="px-4 py-3 align-top text-steel">{formatDate(item.verificationDate)}</td>
                      <td className="px-4 py-3 align-top text-steel">{formatDate(item.validDate)}</td>
                      <td className="px-4 py-3 align-top">
                        {item.arshinUrl ? (
                          <a
                            className="text-xs font-semibold text-signal-info hover:underline"
                            href={item.arshinUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Открыть в Аршине
                          </a>
                        ) : (
                          <span className="text-xs text-steel">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-steel" colSpan={10}>
                    Выполни поиск по номеру свидетельства, чтобы получить список записей Аршина.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        description={
          selectedResults.length
            ? `Выбрано ${selectedResults.length} ${getRecordsLabel(selectedResults.length)}. После подтверждения записи будут созданы в выбранной папке как SI.`
            : "Сначала отметь записи из таблицы."
        }
        open={addModalOpen}
        title="Добавить СИ в папку"
        onClose={closeAddModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleAddToFolderSubmit(event)}>
          <label className="block text-sm text-steel">
            Папка
            <select
              className="form-input"
              value={addForm.folderId}
              onChange={(event) => handleFolderChange(event.target.value)}
            >
              <option value="">Выбери папку</option>
              {selectableFolderOptions.map((folder: EquipmentFolder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Объект
              <input
                className="form-input"
                type="text"
                value={addForm.objectName}
                onChange={(event) =>
                  setAddForm((current) => ({ ...current, objectName: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Статус
              <select
                className="form-input"
                value={addForm.status}
                onChange={(event) =>
                  setAddForm((current) => ({
                    ...current,
                    status: event.target.value as EquipmentStatus,
                  }))
                }
              >
                {(Object.keys(equipmentStatusLabels) as EquipmentStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {equipmentStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm text-steel">
            Текущее местоположение
            <input
              className="form-input"
              type="text"
              value={addForm.currentLocationManual}
              onChange={(event) =>
                setAddForm((current) => ({
                  ...current,
                  currentLocationManual: event.target.value,
                }))
              }
            />
          </label>

          {selectedFolder ? (
            <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              Записи будут добавлены в папку <span className="font-semibold text-ink">{selectedFolder.name}</span>.
            </div>
          ) : null}

          {addToFolderMutation.isError ? (
            <p className="text-sm text-[#b04c43]">{addToFolderMutation.error.message}</p>
          ) : null}

          <div className="flex justify-end">
            <button
              className="btn-primary disabled:opacity-60"
              disabled={
                addToFolderMutation.isPending
                || !addForm.folderId
                || !addForm.objectName.trim()
                || selectedResults.length === 0
              }
              type="submit"
            >
              {addToFolderMutation.isPending ? "Добавляем..." : "Подтвердить"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function getRecordsLabel(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;

  if (remainder100 >= 11 && remainder100 <= 14) {
    return "записей";
  }

  if (remainder10 === 1) {
    return "запись";
  }

  if (remainder10 >= 2 && remainder10 <= 4) {
    return "записи";
  }

  return "записей";
}
