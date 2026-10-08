import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchEquipmentFolders, fetchEquipmentFolderSuggestions, fetchEquipmentPage } from "@/api/equipment";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  createTask,
  fetchTasks,
  updateTask,
  type TaskListItem,
  type TaskListFilters,
  type TaskPriority,
  type TaskStatus,
} from "@/api/tasks";
import { fetchMentionUsers } from "@/api/users";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { AppDialog } from "@/components/ui/app-dialog";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildMentionSuggestionOptions } from "@/lib/autocomplete";
import { useSearchHistory } from "@/lib/searchHistory";
import { resolveBoardDrop } from "@/lib/taskBoard";
import { TASK_STATUS_TONES } from "@/lib/taskStatusTone";
import { resizeTextareaToContent } from "@/lib/textarea";
import { useAuthStore } from "@/store/auth";

const BOARD_STATUSES: TaskStatus[] = ["NEW", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"];

const PRIORITY_TONE: Record<TaskPriority, string> = {
  LOW: "text-steel",
  NORMAL: "text-ink",
  HIGH: "text-[color:var(--warning)]",
  CRITICAL: "text-[color:var(--danger)]",
};

function formatDate(value: string | null): string {
  if (!value) {
    return "без срока";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function TaskCard({ task }: { task: TaskListItem }) {
  return (
    <div className="w-full cursor-pointer rounded-2xl border border-line p-3 text-left transition hover:border-[color:var(--accent)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{task.title}</span>
        <span className={`shrink-0 text-[11px] font-semibold uppercase ${PRIORITY_TONE[task.priority]}`}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      </div>
      <p className="mt-1 text-xs text-steel">{task.folderName ?? "Без папки"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-steel">
        <span className={task.isOverdue ? "text-[color:var(--danger)]" : ""}>
          Срок: {formatDate(task.dueDate)}
        </span>
        {task.responsibleDisplayName ? <span>Отв.: {task.responsibleDisplayName}</span> : null}
        {task.equipmentCount > 0 ? <span>Приборов: {task.equipmentCount}</span> : null}
        {task.checklistTotal > 0 ? (
          <span>
            Чек-лист: {task.checklistDone}/{task.checklistTotal}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraggableTaskCard({ task }: { task: TaskListItem }) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      className={["touch-pan-y", isDragging ? "relative z-50" : ""].filter(Boolean).join(" ")}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <Link className="block" draggable={false} to={`/tasks/${task.id}`}>
        <TaskCard task={task} />
      </Link>
    </div>
  );
}

function BoardColumn({
  count,
  dragging,
  status,
  tasks,
}: {
  count: number;
  dragging: boolean;
  status: TaskStatus;
  tasks: TaskListItem[];
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      className="flex min-h-[120px] flex-col gap-2 rounded-2xl"
      ref={setNodeRef}
    >
      <StatusBadge
        className="w-full justify-between rounded-t-2xl rounded-b-md px-3 py-2 text-sm"
        tone={TASK_STATUS_TONES[status]}
      >
        <span>{TASK_STATUS_LABELS[status]}</span>
        <span className="text-xs font-semibold opacity-70">{count}</span>
      </StatusBadge>
      <div className="space-y-2 px-1">
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} />
        ))}
        {isOver && dragging ? (
          <div className="h-24 rounded-2xl border border-dashed border-line" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}

export function TasksPage() {
  const token = useAuthStore((state) => state.token) ?? "";
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [view, setView] = useState<"board" | "list">("board");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<number, TaskStatus>>({});

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token),
    enabled: Boolean(token),
  });
  const filters: TaskListFilters = useMemo(
    () => ({
      folderId,
      statuses,
      priorities: priority ? [priority] : [],
      assigneeUserId: mine && currentUser ? currentUser.id : null,
      overdueOnly,
      query: query.trim() || null,
      sort: "due",
      limit: 200,
    }),
    [folderId, statuses, priority, mine, currentUser, overdueOnly, query],
  );

  const tasksQuery = useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => fetchTasks(token, filters),
    enabled: Boolean(token),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) =>
      updateTask(token, id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const tasks = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data?.items]);
  // A drop lands the card immediately; the optimistic status is dropped once the server agrees.
  function taskStatusOf(task: TaskListItem): TaskStatus {
    const optimistic = optimisticStatus[task.id];
    return optimistic && optimistic !== task.status ? optimistic : task.status;
  }

  useEffect(() => {
    setOptimisticStatus((current) => {
      const next: Record<number, TaskStatus> = {};
      let changed = false;
      for (const [id, status] of Object.entries(current)) {
        const task = tasks.find((item) => item.id === Number(id));
        if (task && task.status !== status) {
          next[Number(id)] = status;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tasks]);
  const sensors = useSensors(
    // A small distance keeps a plain click on the card navigating to it.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const drop = resolveBoardDrop(event.active.id, event.over?.id, tasks);
    if (!drop) {
      return;
    }
    setOptimisticStatus((current) => ({ ...current, [drop.id]: drop.status }));
    statusMutation.mutate(drop);
  }

  function toggleStatus(status: TaskStatus) {
    setStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Задачи"
        description="Постановка задач, ответственные и исполнители, сроки, доска и чек-листы."
        actions={
          <button
            className="btn-primary btn-sm"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            Новая задача
          </button>
        }
      />

      <div className="space-y-3 rounded-2xl border border-line p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm text-steel">
            Поиск
            <input
              className="form-input"
              placeholder="Название задачи"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="block text-sm text-steel">
            Папка
            <select
              className="form-input"
              value={folderId ?? ""}
              onChange={(event) => setFolderId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Все папки</option>
              {(foldersQuery.data ?? []).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-steel">
            Приоритет
            <select
              className="form-input"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority | "")}
            >
              <option value="">Любой приоритет</option>
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {TASK_STATUSES.map((status) => (
              <button
                key={status}
                className={`rounded-full border px-3 py-1 text-xs ${statuses.includes(status) ? "border-[color:var(--accent)] bg-[var(--accent-soft)] text-ink" : "border-line text-steel"}`}
                onClick={() => toggleStatus(status)}
                type="button"
              >
                {TASK_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-steel" htmlFor="tasks-overdue-only">
            <Switch checked={overdueOnly} id="tasks-overdue-only" onCheckedChange={setOverdueOnly} />
            Просроченные
          </label>
          <label className="flex items-center gap-2 text-sm text-steel" htmlFor="tasks-mine">
            <Switch checked={mine} id="tasks-mine" onCheckedChange={setMine} />
            Где я исполнитель
          </label>
          <div className="ml-auto flex gap-1 rounded-xl border border-line p-1">
            {(["board", "list"] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded-lg px-3 py-1 text-sm ${view === mode ? "bg-[var(--accent-soft)] text-ink" : "text-steel"}`}
                onClick={() => setView(mode)}
                type="button"
              >
                {mode === "board" ? "Доска" : "Список"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tasksQuery.isLoading ? <p className="text-sm text-steel">Загрузка…</p> : null}
      {tasksQuery.isError ? <p className="text-sm text-[color:var(--danger)]">Не удалось загрузить задачи.</p> : null}
      {!tasksQuery.isLoading && tasks.length === 0 ? (
        <p className="text-sm text-steel">Задач не найдено. Создай первую задачу.</p>
      ) : null}

      {view === "board" ? (
        <DndContext
          collisionDetection={closestCorners}
          sensors={sensors}
          onDragCancel={() => setActiveTaskId(null)}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
        >
          <div className="grid gap-3 lg:grid-cols-5">
            {BOARD_STATUSES.map((status) => {
              const columnTasks = tasks.filter((task) => taskStatusOf(task) === status);
              return (
                <BoardColumn
                  count={columnTasks.length}
                  dragging={activeTaskId !== null}
                  key={status}
                  status={status}
                  tasks={columnTasks}
                />
              );
            })}
          </div>
        </DndContext>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-[var(--accent-soft)] text-left text-xs uppercase tracking-wide text-steel">
              <tr>
                <th className="px-3 py-2">Задача</th>
                <th className="px-3 py-2">Папка</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Приоритет</th>
                <th className="px-3 py-2">Ответственный</th>
                <th className="px-3 py-2">Срок</th>
                <th className="px-3 py-2">Приборы</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <Link className="font-medium text-ink hover:underline" to={`/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-steel">{task.folderName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={TASK_STATUS_TONES[task.status]}>
                      {TASK_STATUS_LABELS[task.status]}
                    </StatusBadge>
                  </td>
                  <td className={`px-3 py-2 ${PRIORITY_TONE[task.priority]}`}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </td>
                  <td className="px-3 py-2 text-steel">{task.responsibleDisplayName ?? "—"}</td>
                  <td className={`px-3 py-2 ${task.isOverdue ? "text-[color:var(--danger)]" : "text-steel"}`}>
                    {formatDate(task.dueDate)}
                  </td>
                  <td className="px-3 py-2 text-steel">{task.equipmentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTaskModal
        token={token}
        open={createOpen}
        defaultFolderId={folderId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </section>
  );
}

function CreateTaskModal({
  token,
  open,
  defaultFolderId,
  onClose,
  onCreated,
}: {
  token: string;
  open: boolean;
  defaultFolderId: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token),
    enabled: open && Boolean(token),
  });
  const usersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token),
    enabled: open && Boolean(token),
  });
  const { history: equipmentSearchHistory, remember: rememberEquipmentSearch } =
    useSearchHistory("metroLog.search.task-equipment");
  const [folderId, setFolderId] = useState<string>(defaultFolderId ? String(defaultFolderId) : "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [observerIds, setObserverIds] = useState<number[]>([]);
  const [equipmentIds, setEquipmentIds] = useState<number[]>([]);
  const [objectName, setObjectName] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const deferredEquipmentSearch = useDeferredValue(equipmentSearch);
  const [error, setError] = useState<string | null>(null);

  const suggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", folderId],
    queryFn: () => fetchEquipmentFolderSuggestions(token, Number(folderId)),
    enabled: open && Boolean(token) && Boolean(folderId),
  });
  const equipmentQuery = useQuery({
    queryKey: ["equipment-picker", "create", folderId, objectName, deferredEquipmentSearch],
    queryFn: () =>
      fetchEquipmentPage(token, {
        folderId: Number(folderId),
        objectName: objectName || null,
        query: deferredEquipmentSearch.trim() || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: open && Boolean(token) && Boolean(folderId),
  });

  const mentionSuggestions = useMemo(
    () => buildMentionSuggestionOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  const mutation = useMutation({
    mutationFn: () =>
      createTask(token, {
        folderId: Number(folderId),
        title: title.trim(),
        description: description.trim() || null,
        priority,
        responsibleUserId: Number(responsibleUserId),
        assigneeUserIds: assigneeIds,
        observerUserIds: observerIds,
        equipmentIds,
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setAssigneeIds([]);
      setObserverIds([]);
      setEquipmentIds([]);
      setObjectName("");
      onCreated();
    },
    onError: (mutationError: unknown) => {
      setError(mutationError instanceof Error ? mutationError.message : "Не удалось создать задачу.");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!folderId || !title.trim() || !responsibleUserId) {
      setError("Заполните папку, название и ответственного.");
      return;
    }
    mutation.mutate();
  }

  return (
    <AppDialog title="Новая задача" open={open} onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-steel">Папка</span>
          <SearchableSelect
            onChange={(next) => {
              setFolderId(next === null ? "" : next);
              setObjectName("");
              setEquipmentSearch("");
            }}
            options={(foldersQuery.data ?? []).map((folder) => ({
              value: String(folder.id),
              label: folder.name,
            }))}
            placeholder="— выберите —"
            value={folderId === "" ? null : folderId}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-steel">Название</span>
          <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-steel">Описание</span>
          <AutocompleteTextarea
            className="form-input min-h-[92px] resize-none py-3"
            placeholder="Опиши задачу, можно упомянуть коллег через @"
            rows={3}
            suggestions={mentionSuggestions}
            value={description}
            onChange={setDescription}
            onInput={(event) => resizeTextareaToContent(event.currentTarget, 92)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Ответственный</span>
            <SearchableSelect
              onChange={(next) => setResponsibleUserId(next === null ? "" : String(next))}
              options={(usersQuery.data ?? []).map((user) => ({
                value: user.id,
                label: user.displayName || user.email,
              }))}
              placeholder="— выберите —"
              value={responsibleUserId ? Number(responsibleUserId) : null}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Приоритет</span>
            <SearchableSelect
              onChange={(next) => setPriority((next ?? "NORMAL") as TaskPriority)}
              options={Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              placeholder="— выберите —"
              value={priority}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Исполнители</span>
            <SearchableMultiSelect
              loading={usersQuery.isLoading}
              onChange={setAssigneeIds}
              options={(usersQuery.data ?? []).map((user) => ({
                value: user.id,
                label: user.displayName || user.email,
              }))}
              placeholder="Поиск сотрудника…"
              value={assigneeIds}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Наблюдатели</span>
            <SearchableMultiSelect
              loading={usersQuery.isLoading}
              onChange={setObserverIds}
              options={(usersQuery.data ?? []).map((user) => ({
                value: user.id,
                label: user.displayName || user.email,
              }))}
              placeholder="Поиск сотрудника…"
              value={observerIds}
            />
          </label>
        </div>
        {folderId ? (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-steel">Объект</span>
              <SearchableSelect
                onChange={(next) => setObjectName(next ?? "")}
                options={[
                  { value: "", label: "Все объекты" },
                  ...(suggestionsQuery.data?.objectNames ?? []).map((name) => ({
                    value: name,
                    label: name,
                  })),
                ]}
                placeholder="Все объекты"
                value={objectName}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-steel">Приборы</span>
              <SearchableMultiSelect
                emptyLabel="Ничего не найдено по выбранному объекту."
                filterLocally={false}
                history={equipmentSearchHistory}
                loading={equipmentQuery.isLoading}
                maxResults={5}
                onChange={setEquipmentIds}
                onQueryChange={setEquipmentSearch}
                onQueryCommitted={rememberEquipmentSearch}
                options={(equipmentQuery.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                  hint: item.serialNumber ? `зав. № ${item.serialNumber}` : undefined,
                }))}
                placeholder="Поиск прибора…"
                value={equipmentIds}
              />
            </label>
          </div>
        ) : null}
        {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-sm" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="btn-primary btn-sm" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "Создаём…" : "Создать"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
