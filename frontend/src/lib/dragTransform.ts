import { CSS, type Transform } from "@dnd-kit/utilities";

/**
 * The style for an item being sorted by drag and drop: position only.
 *
 * `@dnd-kit/sortable`'s `rectSortingStrategy` returns `scaleX = newRect.width / oldRect.width` (and
 * the same for the height), and `CSS.Transform.toString` applies it — a dragged item was then
 * stretched or squeezed to the size of the slot it was heading into (a dashboard module changed
 * width while passing a module of another width, a short folder card grew to the height of a taller
 * one). `CSS.Translate` keeps the neighbours' "make room" movement and drops the scale, so the
 * dragged item keeps its own size. Do not swap this back to `CSS.Transform`.
 */
export function dragTransformStyle(transform: Transform | null): { transform: string | undefined } {
  return { transform: CSS.Translate.toString(transform) };
}
