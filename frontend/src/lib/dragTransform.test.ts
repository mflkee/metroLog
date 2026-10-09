import { dragTransformStyle } from "@/lib/dragTransform";

describe("dragTransformStyle", () => {
  it("moves the dragged item without resizing it", () => {
    // `rectSortingStrategy` hands out a scale to fit the target slot; it must not reach the style.
    expect(dragTransformStyle({ x: 12, y: -8, scaleX: 3, scaleY: 0.5 })).toEqual({
      transform: "translate3d(12px, -8px, 0)",
    });
  });

  it("is empty while nothing is dragged", () => {
    expect(dragTransformStyle(null)).toEqual({ transform: undefined });
  });
});
