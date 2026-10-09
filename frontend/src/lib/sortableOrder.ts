export type DragRect = {
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type DropPointer = { x: number; y: number };

/** How far the pointer is from a rect (0 when it is inside). */
function distanceToRect(pointer: DropPointer, rect: DragRect): number {
  const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
  const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * True when the pointer sits in the leading half of the rect. Row-major order: above the middle
 * counts as "before", below as "after", and exactly on the middle the horizontal half decides — so
 * the same rule works for a wrapping grid and for a single column.
 */
function isBeforeRect(pointer: DropPointer, rect: DragRect): boolean {
  const midY = rect.top + (rect.bottom - rect.top) / 2;
  if (pointer.y < midY) {
    return true;
  }
  if (pointer.y > midY) {
    return false;
  }
  return pointer.x < rect.left + (rect.right - rect.left) / 2;
}

/**
 * The slot the pointer points at, among `rects` in their current order. A slot is a boundary
 * between items: `0` is before the first one, `rects.length` is after the last one.
 *
 * The rects are measured when the drag starts, so the answer is a function of the pointer alone and
 * cannot oscillate while the items move around underneath it.
 */
export function resolveInsertionSlot(pointer: DropPointer, rects: DragRect[]): number {
  if (!rects.length) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < rects.length; index += 1) {
    const distance = distanceToRect(pointer, rects[index]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  const nearest = rects[nearestIndex];
  return isBeforeRect(pointer, nearest) ? nearestIndex : nearestIndex + 1;
}

/**
 * The order after moving `activeKey` into `slot`.
 *
 * The slot counts the dragged item itself, because that is the layout the user saw when the drag
 * started. Removing the item shifts every later slot by one, hence the adjustment.
 */
export function moveItemToSlot(order: string[], activeKey: string, slot: number): string[] {
  const from = order.indexOf(activeKey);
  if (from < 0) {
    return order;
  }

  const target = slot > from ? slot - 1 : slot;
  const clamped = Math.max(0, Math.min(order.length - 1, target));
  if (clamped === from) {
    return order;
  }

  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}

/** Reads the rects of the elements marked with `data-drag-key`, in the given order. */
export function measureDragRects(
  container: HTMLElement | null,
  order: Array<string | number>,
): DragRect[] {
  if (!container) {
    return [];
  }

  const measured = new Map<string, DOMRect>();
  for (const node of Array.from(container.querySelectorAll<HTMLElement>("[data-drag-key]"))) {
    const key = node.dataset.dragKey;
    if (key) {
      measured.set(key, node.getBoundingClientRect());
    }
  }

  const rects: DragRect[] = [];
  for (const key of order) {
    const rect = measured.get(String(key));
    if (!rect) {
      continue;
    }
    rects.push({
      key: String(key),
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  }
  return rects;
}
