import { useRef, useState } from "react";

import type { DragMoveEvent, DragStartEvent } from "@dnd-kit/core";

import { measureDragRects, moveItemToSlot, resolveInsertionSlot, type DragRect } from "@/lib/sortableOrder";
import { useFlipAnimation } from "@/lib/useFlipAnimation";

type DragReorderOptions<T extends string | number> = {
  /** The order as rendered right now. */
  order: T[];
  containerRef: React.RefObject<HTMLElement | null>;
  /** Live order while dragging: render it, do not save it yet. */
  onChange: (next: T[]) => void;
  /** Once, on drop, and only when the order really changed. */
  onCommit: (next: T[]) => void;
  /**
   * Restricts the reorder to the items this returns for the dragged key — for example the cards of
   * one board column. Only those rects are measured, and `onChange`/`onCommit` then receive the new
   * order of that subset, which the caller merges back with `applySubsetOrder`.
   */
  subsetOf?: (activeKey: T, order: T[]) => T[];
};

type DragReorderResult<T extends string | number> = {
  activeKey: T | null;
  /** Size of the dragged element when the drag started, for the placeholder. */
  activeRect: DragRect | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragMove: (event: DragMoveEvent) => void;
  handleDragEnd: () => void;
  handleDragCancel: () => void;
  /** Moves an item by a number of positions, for the keyboard. */
  moveKeyBy: (key: T, delta: number) => void;
  /**
   * True once, for the item that was just dragged: a click that follows a drop must not also
   * activate the item (a card that navigates, a folder that opens).
   */
  shouldSuppressClick: (key: T) => boolean;
};

function keysOf<T extends string | number>(values: T[]): string[] {
  return values.map((value) => String(value));
}

/** Maps string keys back to the caller's key type (folder ids are numbers, widget keys are not). */
function restoreKeys<T extends string | number>(keys: string[], reference: T[]): T[] {
  const byString = new Map(reference.map((key) => [String(key), key]));
  return keys.map((key) => byString.get(key) ?? (key as unknown as T));
}

function pointerFromEvent(event: DragMoveEvent) {
  const activator = event.activatorEvent as PointerEvent | undefined;
  if (
    activator
    && typeof activator.clientX === "number"
    && typeof activator.clientY === "number"
  ) {
    return { x: activator.clientX + event.delta.x, y: activator.clientY + event.delta.y };
  }
  const translated = event.active.rect.current.translated;
  if (translated) {
    return {
      x: translated.left + translated.width / 2,
      y: translated.top + translated.height / 2,
    };
  }
  return null;
}

/**
 * Drag-to-reorder that changes the rendered order while the user drags, so the items make room for
 * real instead of being moved by a transform that has to guess at slot sizes. The dragged element is
 * expected to be rendered outside the flow (an overlay) with a placeholder left in its place.
 *
 * The positions used to decide where the item goes are measured once, when the drag starts: the
 * answer then depends only on the pointer, and cannot oscillate while the items move underneath.
 */
export function useDragReorder<T extends string | number>({
  order,
  containerRef,
  onChange,
  onCommit,
  subsetOf,
}: DragReorderOptions<T>): DragReorderResult<T> {
  const [activeKey, setActiveKey] = useState<T | null>(null);
  const [activeRect, setActiveRect] = useState<DragRect | null>(null);
  const rectsRef = useRef<DragRect[]>([]);
  const startSubsetRef = useRef<T[]>(order);
  const subsetRef = useRef<T[]>(order);
  const startScrollRef = useRef({ x: 0, y: 0 });
  const latestRef = useRef<T[]>(order);
  const activeKeyRef = useRef<T | null>(null);
  const justDraggedRef = useRef<T | null>(null);
  latestRef.current = order;

  useFlipAnimation(containerRef, keysOf(order).join("|"));

  function handleDragStart(event: DragStartEvent) {
    const key = event.active.id as T;
    const subset = subsetOf ? subsetOf(key, latestRef.current) : latestRef.current;
    subsetRef.current = subset;
    startSubsetRef.current = subset;
    rectsRef.current = measureDragRects(containerRef.current, subset);
    startScrollRef.current = { x: window.scrollX, y: window.scrollY };
    setActiveRect(rectsRef.current.find((rect) => rect.key === String(key)) ?? null);
    activeKeyRef.current = key;
    setActiveKey(key);
  }

  function handleDragMove(event: DragMoveEvent) {
    const pointer = pointerFromEvent(event);
    if (!pointer || !rectsRef.current.length) {
      return;
    }
    // The rects were measured in the viewport frame of the drag start; the auto-scroll that may
    // have happened since is added back so the mapping stays true.
    const scrolled = {
      x: pointer.x + (window.scrollX - startScrollRef.current.x),
      y: pointer.y + (window.scrollY - startScrollRef.current.y),
    };
    const current = keysOf(subsetRef.current);
    const slot = resolveInsertionSlot(scrolled, rectsRef.current);
    const next = moveItemToSlot(current, String(event.active.id), slot);
    if (next.join("|") === current.join("|")) {
      return;
    }
    const restored = restoreKeys(next, subsetRef.current);
    subsetRef.current = restored;
    onChange(restored);
  }

  function handleDragEnd() {
    justDraggedRef.current = activeKeyRef.current;
    setActiveKey(null);
    setActiveRect(null);
    if (keysOf(startSubsetRef.current).join("|") !== keysOf(subsetRef.current).join("|")) {
      onCommit(subsetRef.current);
    }
  }

  function handleDragCancel() {
    justDraggedRef.current = activeKeyRef.current;
    setActiveKey(null);
    setActiveRect(null);
    onChange(startSubsetRef.current);
  }

  function shouldSuppressClick(key: T): boolean {
    if (justDraggedRef.current !== key) {
      return false;
    }
    justDraggedRef.current = null;
    return true;
  }

  function moveKeyBy(key: T, delta: number) {
    const current = keysOf(subsetRef.current);
    const from = current.indexOf(String(key));
    if (from < 0) {
      return;
    }
    const to = Math.max(0, Math.min(current.length - 1, from + delta));
    if (to === from) {
      return;
    }
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const restored = restoreKeys(next, subsetRef.current);
    subsetRef.current = restored;
    startSubsetRef.current = restored;
    onChange(restored);
    onCommit(restored);
  }

  return {
    activeKey,
    activeRect,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    moveKeyBy,
    shouldSuppressClick,
  };
}
