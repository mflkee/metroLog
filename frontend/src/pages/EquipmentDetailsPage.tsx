import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteEquipment,
  equipmentStatusLabels,
  equipmentTypeLabels,
  fetchEquipment,
  fetchEquipmentById,
  fetchEquipmentFolders,
  fetchEquipmentGroups,
  type EquipmentStatus,
  type EquipmentType,
  updateEquipment,
} from "@/api/equipment";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

type EquipmentFormState = {
  folderId: string;
  groupId: string;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: string;
  status: EquipmentStatus;
  currentLocationManual: string;
};

const equipmentTypeOptions: EquipmentType[] = ["SI", "IO", "VO", "OTHER"];
const equipmentStatusOptions: EquipmentStatus[] = ["ACTIVE", "IN_REPAIR", "ARCHIVED"];

export function EquipmentDetailsPage() {
  const { equipmentId } = useParams();
  const parsedEquipmentId = Number(equipmentId);
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EquipmentFormState | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";

  const equipmentQuery = useQuery({
    queryKey: ["equipment-item", parsedEquipmentId],
    queryFn: () => fetchEquipmentById(token ?? "", parsedEquipmentId),
    enabled: Boolean(token) && Number.isInteger(parsedEquipmentId) && parsedEquipmentId > 0,
  });

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["equipment-groups", "all"],
    queryFn: () => fetchEquipmentGroups(token ?? ""),
    enabled: Boolean(token),
  });

  const relatedEquipmentQuery = useQuery({
    queryKey: ["equipment-related", parsedEquipmentId, equipmentQuery.data?.folderId ?? "none"],
    queryFn: () =>
      fetchEquipment(token ?? "", {
        folderId: equipmentQuery.data?.folderId ?? undefined,
      }),
    enabled: Boolean(token) && Boolean(equipmentQuery.data?.folderId),
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: () => {
      if (!form) {
        throw new Error("Форма не инициализирована.");
      }
      if (!form.folderId) {
        throw new Error("Папка обязательна для прибора.");
      }
      return updateEquipment(token ?? "", parsedEquipmentId, {
        folderId: Number(form.folderId),
        groupId: form.groupId ? Number(form.groupId) : null,
        objectName: form.objectName,
        equipmentType: form.equipmentType,
        name: form.name,
        modification: form.modification,
        serialNumber: form.serialNumber,
        manufactureYear: form.manufactureYear ? Number(form.manufactureYear) : null,
        status: form.status,
        currentLocationManual: form.currentLocationManual,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-related"] });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: () => deleteEquipment(token ?? "", parsedEquipmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      navigate("/equipment");
    },
  });

  useEffect(() => {
    if (!equipmentQuery.data) {
      return;
    }

    setForm({
      folderId: equipmentQuery.data.folderId ? String(equipmentQuery.data.folderId) : "",
      groupId: equipmentQuery.data.groupId ? String(equipmentQuery.data.groupId) : "",
      objectName: equipmentQuery.data.objectName,
      equipmentType: equipmentQuery.data.equipmentType,
      name: equipmentQuery.data.name,
      modification: equipmentQuery.data.modification ?? "",
      serialNumber: equipmentQuery.data.serialNumber ?? "",
      manufactureYear: equipmentQuery.data.manufactureYear ? String(equipmentQuery.data.manufactureYear) : "",
      status: equipmentQuery.data.status,
      currentLocationManual: equipmentQuery.data.currentLocationManual ?? "",
    });
  }, [equipmentQuery.data]);

  const folders = foldersQuery.data ?? [];
  const groups = groupsQuery.data ?? [];
  const selectedFolderGroups = useMemo(
    () => groups.filter((group) => group.folderId === Number(form?.folderId ?? equipmentQuery.data?.folderId ?? 0)),
    [equipmentQuery.data?.folderId, form?.folderId, groups],
  );
  const currentGroup = groups.find((group) => group.id === equipmentQuery.data?.groupId) ?? null;
  const currentFolder = folders.find((folder) => folder.id === equipmentQuery.data?.folderId) ?? null;
  const relatedEquipment = useMemo(
    () =>
      (relatedEquipmentQuery.data ?? [])
        .filter((item) => item.id !== equipmentQuery.data?.id)
        .slice(0, 6),
    [equipmentQuery.data?.id, relatedEquipmentQuery.data],
  );

  useEffect(() => {
    if (!form?.groupId) {
      return;
    }

    if (!selectedFolderGroups.some((group) => group.id === Number(form.groupId))) {
      setForm((current) => (current ? { ...current, groupId: "" } : current));
    }
  }, [form?.groupId, selectedFolderGroups]);

  if (!token) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateEquipmentMutation.mutateAsync();
  }

  return (
    <section>
      <PageHeader
        title={equipmentQuery.data ? equipmentQuery.data.name : `Карточка прибора ${equipmentId ?? ""}`.trim()}
        description="Карточка прибора с общей эксплуатационной информацией. SI-специфичные данные будут расширяться отдельно."
      />

      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info"
            to="/equipment"
          >
            Назад к оборудованию
          </Link>
          {currentFolder ? (
            <span className="rounded-full bg-[#edf2f5] px-4 py-2 text-sm text-steel">
              Папка: {currentFolder.name}
            </span>
          ) : null}
          {currentGroup ? (
            <span className="rounded-full bg-[#edf2f5] px-4 py-2 text-sm text-steel">
              Группа: {currentGroup.name}
            </span>
          ) : null}
        </div>

        {equipmentQuery.isLoading ? (
          <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
            <p className="text-sm text-steel">Загружаем карточку прибора...</p>
          </div>
        ) : null}

        {equipmentQuery.isError ? (
          <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
            <p className="text-sm text-[#b04c43]">
              {equipmentQuery.error instanceof Error
                ? equipmentQuery.error.message
                : "Не удалось загрузить карточку прибора."}
            </p>
          </div>
        ) : null}

        {equipmentQuery.data && form ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_380px]">
            <div className="space-y-4">
              <dl className="overflow-hidden rounded-3xl border border-line bg-white shadow-panel">
                {[
                  ["Категория", equipmentTypeLabels[equipmentQuery.data.equipmentType]],
                  ["Статус", equipmentStatusLabels[equipmentQuery.data.status]],
                  ["Объект", equipmentQuery.data.objectName],
                  ["Модификация", equipmentQuery.data.modification || "Не указана"],
                  ["Серийный номер", equipmentQuery.data.serialNumber || "Не указан"],
                  [
                    "Год выпуска",
                    equipmentQuery.data.manufactureYear ? String(equipmentQuery.data.manufactureYear) : "Не указан",
                  ],
                  ["Текущее местоположение", equipmentQuery.data.currentLocationManual || "Не указано"],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={[
                      "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4",
                      index > 0 ? "border-t border-line" : "",
                    ].join(" ")}
                  >
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                      {label}
                    </dt>
                    <dd className="min-w-0 break-words font-medium text-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              {equipmentQuery.data.equipmentType === "SI" ? (
                <section className="rounded-3xl border border-line bg-white p-5 shadow-panel">
                  <h3 className="text-lg font-semibold text-ink">Блок СИ</h3>
                  <p className="mt-1 text-sm text-steel">
                    Для средств измерения здесь появятся данные Аршина, сроки поверки и расчетные показатели.
                  </p>
                </section>
              ) : null}

              {canManage ? (
                <form
                  className="space-y-4 rounded-3xl border border-line bg-white p-5 shadow-panel"
                  onSubmit={(event) => void handleSubmit(event)}
                >
                  <div>
                    <h3 className="text-lg font-semibold text-ink">Редактирование</h3>
                    <p className="mt-1 text-sm text-steel">
                      Общая карточка редактирует только базовые поля. SI-специфика будет жить отдельным слоем.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm text-steel">
                      Папка
                      <select
                        className="form-input"
                        value={form.folderId}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, folderId: event.target.value, groupId: "" } : current,
                          )
                        }
                      >
                        <option value="">Выбери папку</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-steel">
                      Группа
                      <select
                        className="form-input"
                        value={form.groupId}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, groupId: event.target.value } : current,
                          )
                        }
                      >
                        <option value="">Без группы</option>
                        {selectedFolderGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-steel">
                      Категория
                      <select
                        className="form-input"
                        value={form.equipmentType}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? { ...current, equipmentType: event.target.value as EquipmentType }
                              : current,
                          )
                        }
                      >
                        {equipmentTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {equipmentTypeLabels[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-steel">
                      Статус
                      <select
                        className="form-input"
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? { ...current, status: event.target.value as EquipmentStatus }
                              : current,
                          )
                        }
                      >
                        {equipmentStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {equipmentStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-steel">
                      Объект
                      <input
                        className="form-input"
                        type="text"
                        value={form.objectName}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, objectName: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                    <label className="block text-sm text-steel">
                      Наименование
                      <input
                        className="form-input"
                        type="text"
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, name: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                    <label className="block text-sm text-steel">
                      Модификация
                      <input
                        className="form-input"
                        type="text"
                        value={form.modification}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, modification: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                    <label className="block text-sm text-steel">
                      Серийный номер
                      <input
                        className="form-input"
                        type="text"
                        value={form.serialNumber}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, serialNumber: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                    <label className="block text-sm text-steel">
                      Год выпуска
                      <input
                        className="form-input"
                        type="number"
                        value={form.manufactureYear}
                        onChange={(event) =>
                          setForm((current) =>
                            current ? { ...current, manufactureYear: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="block text-sm text-steel">
                    Текущее местоположение
                    <input
                      className="form-input"
                      type="text"
                      value={form.currentLocationManual}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, currentLocationManual: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  {updateEquipmentMutation.isError ? (
                    <p className="text-sm text-[#b04c43]">
                      {updateEquipmentMutation.error instanceof Error
                        ? updateEquipmentMutation.error.message
                        : "Не удалось сохранить изменения."}
                    </p>
                  ) : null}
                  <button
                    className="btn-primary disabled:opacity-60"
                    disabled={updateEquipmentMutation.isPending}
                    type="submit"
                  >
                    {updateEquipmentMutation.isPending ? "Сохраняем..." : "Сохранить изменения"}
                  </button>
                  <div className="pt-2">
                    <button
                      aria-label="Удалить прибор"
                      className="icon-action-button"
                      title="Удалить прибор"
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                    >
                      <span className="nf-icon text-base leading-none">󰅖</span>
                    </button>
                  </div>
                </form>
              ) : null}
            </div>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-line bg-white p-5 shadow-panel">
                <h3 className="text-lg font-semibold text-ink">Соседние приборы</h3>
                <p className="mt-1 text-sm text-steel">
                  Быстрый переход к другим карточкам из той же папки.
                </p>
                <div className="mt-4 space-y-2">
                  {relatedEquipmentQuery.isLoading ? (
                    <p className="text-sm text-steel">Подбираем соседние приборы...</p>
                  ) : null}
                  {!relatedEquipmentQuery.isLoading && !relatedEquipment.length ? (
                    <p className="text-sm text-steel">
                      В этой папке пока нет других приборов или текущий прибор не привязан к папке.
                    </p>
                  ) : null}
                  {relatedEquipment.map((item) => (
                    <Link
                      key={item.id}
                      className="block rounded-2xl border border-line bg-white/85 px-4 py-3 text-sm text-ink transition hover:border-signal-info"
                      to={`/equipment/${item.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{item.name}</span>
                        <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                          {equipmentTypeLabels[item.equipmentType]}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-steel">
                        {item.serialNumber || "Без серийного"} · {item.currentLocationManual || "Локация не указана"}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </div>

      <Modal
        description="Удалить этот прибор из реестра? Действие потребует подтверждения."
        open={confirmDeleteOpen}
        title="Удалить прибор"
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <div className="space-y-4">
          {deleteEquipmentMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {deleteEquipmentMutation.error instanceof Error
                ? deleteEquipmentMutation.error.message
                : "Не удалось удалить прибор."}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              className="rounded-full border border-line px-4 py-2 text-sm text-steel transition hover:border-signal-info hover:text-ink"
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Отмена
            </button>
            <button
              className="btn-primary disabled:opacity-60"
              disabled={deleteEquipmentMutation.isPending}
              type="button"
              onClick={() => void deleteEquipmentMutation.mutateAsync()}
            >
              {deleteEquipmentMutation.isPending ? "Удаляем..." : "Подтвердить удаление"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
