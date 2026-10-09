import { useLayoutEffect, useRef } from "react";

/**
 * FLIP: when the order changes, glide every marked element from where it was to where it is now.
 *
 * A layout change (an item moving to another grid slot) cannot be animated by CSS, so the movement
 * is applied as a transform and released on the next frame. This works for items of any size and
 * never scales them, unlike a sorting strategy that has to fit an item into a slot's rect.
 *
 * Elements opt in with `data-flip-key` and must carry a `transform` transition in CSS; the dragged
 * copy lives outside the container and is not touched.
 */
export function useFlipAnimation(
  containerRef: React.RefObject<HTMLElement | null>,
  orderKey: string,
): void {
  const previous = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-flip-key]"));
    if (!nodes.length) {
      previous.current = new Map();
      return;
    }

    // Read the new positions with our own transforms cleared, so the measurement is the layout.
    for (const node of nodes) {
      node.style.transition = "none";
      node.style.transform = "";
    }

    const next = new Map<string, DOMRect>();
    for (const node of nodes) {
      const key = node.dataset.flipKey;
      if (!key) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      next.set(key, rect);

      const before = previous.current.get(key);
      if (!before) {
        continue;
      }
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        continue;
      }
      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    previous.current = next;

    const frame = requestAnimationFrame(() => {
      for (const node of nodes) {
        if (!node.style.transform) {
          continue;
        }
        // Release the transform; the item's own CSS transition animates it back to zero.
        node.style.transition = "";
        node.style.transform = "";
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [containerRef, orderKey]);
}
