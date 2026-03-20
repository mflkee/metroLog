import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery } from "@tanstack/react-query";

import { AutocompleteInput } from "@/components/AutocompleteInput";
import { DateInput } from "@/components/DateInput";
import { EquipmentReferenceLink } from "@/components/EquipmentReferenceLink";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { ProcessBadge } from "@/components/ProcessBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  exportEventsXlsx,
  fetchEvents,
  type EventCategory,
  type EventLogItem,
} from "@/api/events";
import { useAuthStore } from "@/store/auth";

const categoryOptions: Array<{ value: EventCategory | "ALL"; label: string }> = [
  { value: "ALL", label: "Все события" },
  { value: "EQUIPMENT", label: "Оборудование" },
  { value: "REPAIR", label: "Ремонт" },
  { value: "VERIFICATION", label: "Поверка" },
];

const emptyEvents: EventLogItem[] = [];

export function EventsPage() {
  const token = useAuthStore((state) => state.token);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<EventCategory | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState(() => getDateDaysAgoDisplay(30));
  const [dateTo, setDateTo] = useState(() => getTodayDisplayDate());
  const [exportError, setExportError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const eventsQuery = useQuery({
    queryKey: ["events", deferredSearchQuery, category, dateFrom, dateTo],
    queryFn: () =>
      fetchEvents(token ?? "", {
        query: deferredSearchQuery,
        category: category === "ALL" ? null : category,
        dateFrom,
        dateTo,
      }),
    enabled: Boolean(token),
  });

  const exportEventsMutation = useMutation({
    mutationFn: () =>
      exportEventsXlsx(token ?? "", {
        query: deferredSearchQuery,
        category: category === "ALL" ? null : category,
        dateFrom,
        dateTo,
      }),
  });

  const items = eventsQuery.data ?? emptyEvents;
  const searchSuggestions = useMemo(() => buildEventSuggestions(items), [items]);

  async function handleExportEvents() {
    setExportError(null);
    try {
      const { blob, fileName } = await exportEventsMutation.mutateAsync();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Не удалось выгрузить Excel-файл журнала.",
      );
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Журнал событий"
        description="Глобальный аудит-лог по оборудованию, ремонтам и поверкам."
      />

      <div className="tone-parent flex flex-wrap items-center gap-3 rounded-3xl border border-line p-4 shadow-panel">
        <label className="tone-child flex min-w-[280px] flex-1 items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-steel shadow-panel">
          <span className="sr-only">Поиск по журналу событий</span>
          <svg
            className="h-4 w-4 text-steel"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
            />
          </svg>
          <AutocompleteInput
            className="w-full bg-transparent text-ink outline-none placeholder:text-steel"
            placeholder="Поиск по прибору, папке, пользователю, описанию"
            suggestions={searchSuggestions}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </label>

        <label className="tone-child inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-steel shadow-panel">
          <span className="sr-only">Категория события</span>
          <Icon className="h-4 w-4" name="events" />
          <select
            className="bg-transparent text-ink outline-none"
            value={category}
            onChange={(event) => setCategory(event.target.value as EventCategory | "ALL")}
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <DateInput
            className="form-input form-input--compact w-[7.75rem]"
            placeholder="с даты"
            value={dateFrom}
            onChange={setDateFrom}
          />
          <DateInput
            className="form-input form-input--compact w-[7.75rem]"
            placeholder="по дату"
            value={dateTo}
            onChange={setDateTo}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setDateFrom(getDateDaysAgoDisplay(30));
              setDateTo(getTodayDisplayDate());
            }}
            type="button"
          >
            30 дней
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            type="button"
          >
            За все время
          </button>
          <IconActionButton
            className="h-9 w-9 shrink-0"
            icon={
              exportEventsMutation.isPending ? (
                <span className="text-sm leading-none">…</span>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                </svg>
              )
            }
            label="Экспортировать журнал событий в Excel"
            onClick={() => void handleExportEvents()}
          />
        </div>
      </div>

      {exportError ? <p className="text-sm text-[#b04c43]">{exportError}</p> : null}

      <div className="flex justify-end">
        <div className="rounded-full border border-line px-3 py-1 text-xs text-steel">
          {items.length} событий
        </div>
      </div>

      {eventsQuery.isLoading ? (
        <p className="text-sm text-steel">Загружаем журнал событий...</p>
      ) : null}

      {eventsQuery.isError ? (
        <p className="text-sm text-[#b04c43]">
          {eventsQuery.error instanceof Error
            ? eventsQuery.error.message
            : "Не удалось загрузить журнал событий."}
        </p>
      ) : null}

      {!eventsQuery.isLoading && !eventsQuery.isError && !items.length ? (
        <div className="tone-parent rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
          События по текущему фильтру не найдены.
        </div>
      ) : null}

      {!eventsQuery.isLoading && !eventsQuery.isError && items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <EventRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EventRow({ item }: { item: EventLogItem }) {
  const target = buildEventTarget(item);
  const description = getEventDescription(item);

  return (
    <article className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ProcessBadge
              label={getCategoryLabel(item.category)}
              variant={getCategoryVariant(item.category)}
            />
            <ProcessBadge label={getActionLabel(item.action)} variant="muted" />
            <h2 className="min-w-0 text-sm font-semibold text-ink">{item.title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-steel">
            {description ? <span className="truncate">{description}</span> : null}
          </div>
        </div>

        <div className="shrink-0 text-right text-xs text-steel">
          <p>{formatEventDateTime(item.createdAt)}</p>
          <p className="mt-1">{item.userDisplayName}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-steel">
        {item.folderName ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5">
            <Icon className="h-3.5 w-3.5" name="equipment" />
            {item.folderName}
          </span>
        ) : null}
        {item.batchKey && target ? (
          <Link
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink transition hover:border-signal-info"
            to={target}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" name={item.category === "REPAIR" ? "repairs" : "verification"} />
            Открыть группу
          </Link>
        ) : null}
        {!item.batchKey && item.equipmentName ? (
          <EquipmentReferenceLink
            modification={item.equipmentModification}
            name={item.equipmentName}
            serialNumber={item.equipmentSerialNumber}
            to={target}
          />
        ) : null}
      </div>
    </article>
  );
}

function getCategoryLabel(category: EventCategory): string {
  switch (category) {
    case "EQUIPMENT":
      return "Оборудование";
    case "REPAIR":
      return "Ремонт";
    case "VERIFICATION":
      return "Поверка";
    default:
      return category;
  }
}

function getCategoryVariant(category: EventCategory): "repair" | "verification" | "accent" {
  switch (category) {
    case "REPAIR":
      return "repair";
    case "VERIFICATION":
      return "verification";
    default:
      return "accent";
  }
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    folder_created: "Папка создана",
    folder_updated: "Папка обновлена",
    folder_deleted: "Папка удалена",
    equipment_created: "Создание",
    equipment_updated: "Обновление",
    equipment_deleted: "Удаление",
    si_refreshed: "Аршин",
    si_imported: "Импорт",
    attachment_created: "Вложение",
    attachment_deleted: "Вложение",
    comment_created: "Комментарий",
    comment_updated: "Комментарий",
    comment_deleted: "Комментарий",
    repair_created: "Отправка",
    repair_batch_items_added: "Группа",
    repair_batch_items_removed: "Группа",
    repair_milestones_updated: "Этапы",
    repair_batch_milestones_updated: "Этапы",
    repair_message_created: "Сообщение",
    repair_message_deleted: "Сообщение",
    repair_closed: "Завершение",
    repair_batch_closed: "Завершение",
    verification_created: "Отправка",
    verification_batch_items_added: "Группа",
    verification_batch_items_removed: "Группа",
    verification_milestones_updated: "Этапы",
    verification_batch_milestones_updated: "Этапы",
    verification_message_created: "Сообщение",
    verification_message_deleted: "Сообщение",
    verification_closed: "Завершение",
    verification_batch_closed: "Завершение",
  };
  return labels[action] ?? action;
}

function buildEventSuggestions(items: EventLogItem[]): string[] {
  const values = new Set<string>();
  for (const item of items) {
    addSuggestion(values, item.title);
    addSuggestion(values, item.userDisplayName);
    addSuggestion(values, item.equipmentName);
    addSuggestion(values, item.equipmentModification);
    addSuggestion(values, item.equipmentSerialNumber);
    addSuggestion(values, item.folderName);
    addSuggestion(values, item.description);
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right, "ru"));
}

function addSuggestion(store: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  store.add(normalized);
}

function formatEventDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildEventTarget(item: EventLogItem): string | undefined {
  const lifecycleTab = item.action.includes("closed") ? "archived" : "active";

  if (item.batchKey && (item.category === "REPAIR" || item.category === "VERIFICATION")) {
    const basePath = item.category === "REPAIR" ? "/repairs" : "/verification/si";
    return `${basePath}?tab=${lifecycleTab}&batchKey=${encodeURIComponent(item.batchKey)}`;
  }

  if (item.equipmentId && item.category === "REPAIR") {
    return `/repairs?tab=${lifecycleTab}&equipmentId=${item.equipmentId}`;
  }

  if (item.equipmentId && item.category === "VERIFICATION") {
    return `/verification/si?tab=${lifecycleTab}&equipmentId=${item.equipmentId}`;
  }

  if (item.equipmentId) {
    return `/equipment/${item.equipmentId}`;
  }

  return undefined;
}

function getEventDescription(item: EventLogItem): string | null {
  if (!item.description) {
    return null;
  }

  if (item.batchKey && item.action.endsWith("_batch_items_added")) {
    return summarizeBatchMemberDescription(
      item.description,
      item.category === "VERIFICATION" ? "Добавлено СИ" : "Добавлено приборов",
    );
  }

  if (item.batchKey && item.action.endsWith("_batch_items_removed")) {
    return summarizeBatchMemberDescription(
      item.description,
      item.category === "VERIFICATION" ? "Удалено СИ" : "Удалено приборов",
    );
  }

  return item.description;
}

function summarizeBatchMemberDescription(description: string, label: string): string {
  if (description.includes(":")) {
    return description;
  }
  const parts = description
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? `${label}: ${parts.length}.` : label;
}

function getTodayDisplayDate(): string {
  return formatDisplayDate(new Date());
}

function getDateDaysAgoDisplay(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return formatDisplayDate(value);
}

function formatDisplayDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  return `${day}.${month}.${year}`;
}
