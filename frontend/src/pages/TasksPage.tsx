import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchEquipmentFolders } from "@/api/equipment";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  createTask,
  fetchTasks,
  reorderTaskBoard,
  updateTask,
  type TaskListItem,
  type TaskListFilters,
  type TaskPriority,
  type TaskStatus,
} from "@/api/tasks";
import { fetchMentionUsers } from "@/api/users";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/DateInput";
import { EquipmentPicker, type PickedEquipment } from "@/components/EquipmentPicker";
import { AppDialog } from "@/components/ui/app-dialog";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildMentionSuggestionOptions } from "@/lib/autocomplete";
import { resolveBoardDrop } from "@/lib/taskBoard";
import { hasOperatorAccess } from "@/lib/roles";
import { applySubsetOrder } from "@/lib/sortableOrder";
import { useDragReorder } from "@/lib/useDragReorder";
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

function DraggableTaskCard({
  dragging,
  placeholderHeight,
  task,
  onMoveBy,
  shouldSuppressClick,
}: {
  dragging: boolean;
  placeholderHeight: number | null;
  task: TaskListItem;
  onMoveBy: (taskId: number, delta: number) => void;
  shouldSuppressClick: (taskId: number) => boolean;
}) {
  // Dragging changes the status, so it stays disabled on cards the API marks read-only.
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    disabled: !task.canMutate,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  if (dragging) {
    // The card keeps its slot as a dashed placeholder; the copy that follows the pointer is drawn
    // by the board's overlay.
    return (
      <div
        ref={setNodeRef}
        className="rounded-2xl border border-dashed border-line"
        data-drag-key={task.id}
        data-flip-key={task.id}
        style={placeholderHeight ? { height: placeholderHeight } : { height: 84 }}
      />
    );
  }

  return (
    <div
      className={[
        "touch-pan-y transition-transform duration-200",
        isDragging ? "relative z-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={setNodeRef}
      style={style}
      data-drag-key={task.id}
      data-flip-key={task.id}
      {...attributes}
      {...listeners}
      onClickCapture={(event) => {
        // Dropping a card must not also open it: the click that follows a drag is swallowed.
        if (shouldSuppressClick(task.id)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDown={(event) => {
        if (!event.altKey) {
          return;
        }
        const delta =
          event.key === "ArrowDown" || event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowUp" || event.key === "ArrowLeft"
              ? -1
              : 0;
        if (!delta) {
          return;
        }
        event.preventDefault();
        onMoveBy(task.id, delta);
      }}
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
  draggingTaskId,
  placeholderHeight,
  shouldSuppressClick,
  status,
  tasks,
  onMoveBy,
}: {
  count: number;
  dragging: boolean;
  draggingTaskId: number | null;
  placeholderHeight: number | null;
  shouldSuppressClick: (taskId: number) => boolean;
  status: TaskStatus;
  tasks: TaskListItem[];
  onMoveBy: (taskId: number, delta: number) => void;
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
          <DraggableTaskCard
            key={task.id}
            dragging={task.id === draggingTaskId}
            placeholderHeight={placeholderHeight}
            task={task}
            onMoveBy={onMoveBy}
            shouldSuppressClick={shouldSuppressClick}
          />
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
  const justDraggedTaskRef = useRef<number | null>(null);
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
      sort: view === "board" ? "board" : "due",
      limit: 200,
    }),
    [folderId, statuses, priority, mine, currentUser, overdueOnly, query, view],
  );

  const tasksQuery = useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => fetchTasks(token, filters),
    enabled: Boolean(token),
  });

  const [boardError, setBoardError] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) =>
      updateTask(token, id, { status }),
    onError: (error, variables) => {
      // The card has to return to its column: the server never accepted the new status.
      setOptimisticStatus((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      setBoardError(
        error instanceof Error && error.message
          ? error.message
          : "Не удалось изменить статус задачи.",
      );
    },
    onSuccess: () => {
      setBoardError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const tasks = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data?.items]);
  // A drop lands the card immediately; the optimistic status is dropped once the server agrees.
  function taskStatusOf(task: TaskListItem): TaskStatus {
    const optimistic = optimisticStatus[task.id];
    return optimistic && optimistic !== task.status ? optimistic : task.status;
  }

  const reorderEnabled = hasOperatorAccess(currentUser?.role);
  const [boardOrderOverride, setBoardOrderOverride] = useState<{
    ids: number[];
    stamp: number;
  } | null>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const statusById = useMemo(
    () => new Map(tasks.map((task) => [task.id, taskStatusOf(task)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, optimisticStatus],
  );
  const orderedTasks = useMemo(() => {
    if (!boardOrderOverride || boardOrderOverride.stamp !== tasksQuery.dataUpdatedAt) {
      return tasks;
    }
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ordered = boardOrderOverride.ids.flatMap((id) => byId.get(id) ?? []);
    const rest = tasks.filter((task) => !boardOrderOverride.ids.includes(task.id));
    return [...ordered, ...rest];
  }, [boardOrderOverride, tasks, tasksQuery.dataUpdatedAt]);
  const activeTask = activeTaskId === null
    ? null
    : orderedTasks.find((task) => task.id === activeTaskId) ?? null;

  const reorderBoardMutation = useMutation({
    mutationFn: (taskIds: number[]) => reorderTaskBoard(token, taskIds),
    onError: (error) => {
      setBoardOrderOverride(null);
      setBoardError(
        error instanceof Error && error.message
          ? error.message
          : "Не удалось сохранить порядок задач.",
      );
    },
    onSuccess: () => {
      setBoardError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const boardDrag = useDragReorder<number>({
    order: orderedTasks.map((task) => task.id),
    containerRef: boardContainerRef,
    // Only operators may reorder the shared queue; for everybody else the subset is just the
    // dragged card, so nothing can move.
    subsetOf: (key, order) =>
      reorderEnabled ? order.filter((id) => statusById.get(id) === statusById.get(key)) : [key],
    onChange: (subsetOrder) => {
      setBoardOrderOverride({
        ids: applySubsetOrder(
          orderedTasks.map((task) => task.id),
          subsetOrder,
          (id) => id,
        ),
        stamp: tasksQuery.dataUpdatedAt,
      });
    },
    onCommit: (subsetOrder) => reorderBoardMutation.mutate(subsetOrder),
  });

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
    boardDrag.handleDragStart(event);
  }

  function handleDragMove(event: DragMoveEvent) {
    boardDrag.handleDragMove(event);
  }

  function handleDragEnd(event: DragEndEvent) {
    justDraggedTaskRef.current = Number(event.active.id);
    setActiveTaskId(null);

    const drop = resolveBoardDrop(event.active.id, event.over?.id, orderedTasks);
    if (drop) {
      // The card leaves its column: the column it came from keeps the order it had.
      boardDrag.handleDragCancel();
      setOptimisticStatus((current) => ({ ...current, [drop.id]: drop.status }));
      statusMutation.mutate(drop);
      return;
    }
    // The card stays in its column: the order it was dragged to is what to save.
    boardDrag.handleDragEnd();
  }

  function handleDragCancel() {
    justDraggedTaskRef.current = activeTaskId;
    setActiveTaskId(null);
    boardDrag.handleDragCancel();
  }

  /** True once, for the card that was just dragged: a drop must not also open it. */
  function shouldSuppressTaskClick(taskId: number): boolean {
    if (justDraggedTaskRef.current !== taskId) {
      return false;
    }
    justDraggedTaskRef.current = null;
    return true;
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
            <Select
              onChange={(next) => setFolderId(next ? Number(next) : null)}
              options={[
                { value: "", label: "Все папки" },
                ...(foldersQuery.data ?? []).map((folder) => ({
                  value: String(folder.id),
                  label: folder.name,
                })),
              ]}
              value={folderId === null ? "" : String(folderId)}
            />
          </label>
          <label className="block text-sm text-steel">
            Приоритет
            <Select<TaskPriority | "">
              onChange={(next) => setPriority(next)}
              options={[
                { value: "", label: "Любой приоритет" },
                ...Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
                  value: value as TaskPriority,
                  label,
                })),
              ]}
              value={priority}
            />
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

      {boardError ? <p className="text-sm text-[color:var(--danger)]">{boardError}</p> : null}
      {tasksQuery.isLoading ? <p className="text-sm text-steel">Загрузка…</p> : null}
      {tasksQuery.isError ? <p className="text-sm text-[color:var(--danger)]">Не удалось загрузить задачи.</p> : null}
      {!tasksQuery.isLoading && tasks.length === 0 ? (
        <p className="text-sm text-steel">Задач не найдено. Создай первую задачу.</p>
      ) : null}

      {view === "board" ? (
        <DndContext
          collisionDetection={closestCorners}
          sensors={sensors}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
          onDragMove={handleDragMove}
          onDragStart={handleDragStart}
        >
          <div className="grid gap-3 lg:grid-cols-5" ref={boardContainerRef}>
            {BOARD_STATUSES.map((status) => {
              const columnTasks = orderedTasks.filter((task) => taskStatusOf(task) === status);
              return (
                <BoardColumn
                  count={columnTasks.length}
                  dragging={activeTaskId !== null}
                  draggingTaskId={activeTaskId}
                  key={status}
                  placeholderHeight={
                    boardDrag.activeRect
                      ? Math.round(boardDrag.activeRect.bottom - boardDrag.activeRect.top)
                      : null
                  }
                  shouldSuppressClick={shouldSuppressTaskClick}
                  status={status}
                  tasks={columnTasks}
                  onMoveBy={boardDrag.moveKeyBy}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
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
  const usersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token),
    enabled: open && Boolean(token),
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [observerIds, setObserverIds] = useState<number[]>([]);
  const [equipmentIds, setEquipmentIds] = useState<number[]>([]);
  const [pickedEquipment, setPickedEquipment] = useState<PickedEquipment[]>([]);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mentionSuggestions = useMemo(
    () => buildMentionSuggestionOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  const mutation = useMutation({
    mutationFn: () =>
      createTask(token, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        responsibleUserId: Number(responsibleUserId),
        assigneeUserIds: assigneeIds,
        observerUserIds: observerIds,
        equipmentIds,
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setDueDate("");
      setAssigneeIds([]);
      setObserverIds([]);
      setEquipmentIds([]);
      setPickedEquipment([]);
      onCreated();
    },
    onError: (mutationError: unknown) => {
      setError(mutationError instanceof Error ? mutationError.message : "Не удалось создать задачу.");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!title.trim() || !responsibleUserId) {
      setError("Заполните название и ответственного.");
      return;
    }
    mutation.mutate();
  }

  return (
    <AppDialog
      description={
        equipmentOpen ? "Выбери папку, найди приборы и отметь нужные галочками." : undefined
      }
      title={equipmentOpen ? "Выбор приборов" : "Новая задача"}
      open={open}
      onClose={onClose}
    >
      {equipmentOpen ? (
        <EquipmentPicker
          cancelLabel="Назад"
          defaultFolderId={defaultFolderId}
          initialSelection={pickedEquipment}
          token={token}
          onCancel={() => setEquipmentOpen(false)}
          onConfirm={(items) => {
            setEquipmentIds(items.map((item) => item.id));
            setPickedEquipment(items);
            setEquipmentOpen(false);
          }}
        />
      ) : (
      <form className="space-y-3" onSubmit={handleSubmit}>
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
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Срок</span>
            <DateInput
              className="form-input"
              value={dueDate}
              onChange={setDueDate}
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
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-steel">Приборы</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={() => setEquipmentOpen(true)}
              type="button"
            >
              {equipmentIds.length > 0 ? `Изменить выбор (${equipmentIds.length})` : "Выбрать приборы"}
            </button>
            {pickedEquipment.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {pickedEquipment.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink"
                  >
                    <span className="truncate">{item.label}</span>
                    <button
                      aria-label={`Убрать ${item.label}`}
                      className="text-steel transition hover:text-[color:var(--danger)]"
                      onClick={() => {
                        setPickedEquipment((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        );
                        setEquipmentIds((current) => current.filter((id) => id !== item.id));
                      }}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-steel">
                Без приборов задача будет без папки — её увидят только участники.
              </span>
            )}
          </div>
        </div>
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
      )}
    </AppDialog>
  );
}
