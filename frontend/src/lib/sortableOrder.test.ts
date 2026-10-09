import {
  applySubsetOrder,
  moveItemToSlot,
  resolveInsertionSlot,
  type DragRect,
} from "@/lib/sortableOrder";

const grid: DragRect[] = [
  // Row 1: two halves.
  { key: "a", left: 0, top: 0, right: 300, bottom: 200 },
  { key: "b", left: 300, top: 0, right: 600, bottom: 200 },
  // Row 2: one full-width.
  { key: "x", left: 0, top: 200, right: 600, bottom: 400 },
  // Row 3: two halves.
  { key: "c", left: 0, top: 400, right: 300, bottom: 600 },
  { key: "d", left: 300, top: 400, right: 600, bottom: 600 },
];

describe("resolveInsertionSlot", () => {
  it("is 0 before the first item and length after the last", () => {
    expect(resolveInsertionSlot({ x: 10, y: 5 }, grid)).toBe(0);
    // Lower half of the last card of the last row.
    expect(resolveInsertionSlot({ x: 400, y: 595 }, grid)).toBe(5);
  });

  it("picks the boundary the pointer is nearest to in a wrapping grid", () => {
    // Upper half of the first half-width card: before it.
    expect(resolveInsertionSlot({ x: 100, y: 40 }, grid)).toBe(0);
    // Lower half of the first card: between the two halves of row 1.
    expect(resolveInsertionSlot({ x: 100, y: 180 }, grid)).toBe(1);
    // Upper half of the full-width card of row 2: between row 1 and the full-width card.
    expect(resolveInsertionSlot({ x: 300, y: 220 }, grid)).toBe(2);
    // Lower half of the full-width card: between it and row 3.
    expect(resolveInsertionSlot({ x: 300, y: 390 }, grid)).toBe(3);
  });

  it("works for a single column too", () => {
    const column: DragRect[] = [
      { key: "one", left: 0, top: 0, right: 200, bottom: 100 },
      { key: "two", left: 0, top: 100, right: 200, bottom: 200 },
    ];
    expect(resolveInsertionSlot({ x: 50, y: 20 }, column)).toBe(0);
    expect(resolveInsertionSlot({ x: 50, y: 80 }, column)).toBe(1);
    expect(resolveInsertionSlot({ x: 50, y: 180 }, column)).toBe(2);
  });

  it("returns 0 when nothing was measured", () => {
    expect(resolveInsertionSlot({ x: 0, y: 0 }, [])).toBe(0);
  });
});

describe("moveItemToSlot", () => {
  const order = ["a", "b", "x", "c", "d"];

  it("drops a full-width item between two rows of halves", () => {
    // Slots count the dragged item: 1 is the boundary between "a" and "b", so the full-width card
    // goes up between them.
    expect(moveItemToSlot(order, "x", 1)).toEqual(["a", "x", "b", "c", "d"]);
    // 4 is the boundary between "c" and "d".
    expect(moveItemToSlot(order, "x", 4)).toEqual(["a", "b", "c", "x", "d"]);
    // 5 is after the last card.
    expect(moveItemToSlot(order, "x", 5)).toEqual(["a", "b", "c", "d", "x"]);
  });

  it("keeps the order when the slot is the item's own place", () => {
    expect(moveItemToSlot(["a", "x", "b"], "x", 1)).toEqual(["a", "x", "b"]);
    expect(moveItemToSlot(["a", "x", "b"], "x", 2)).toEqual(["a", "x", "b"]);
  });

  it("moves an item to the front", () => {
    expect(moveItemToSlot(order, "d", 0)).toEqual(["d", "a", "b", "x", "c"]);
  });

  it("ignores an item that is not in the order", () => {
    expect(moveItemToSlot(order, "nope", 2)).toBe(order);
  });
});

describe("applySubsetOrder", () => {
  it("reorders a subset in place and leaves everything else alone", () => {
    expect(applySubsetOrder([1, 2, 3, 4, 5], [4, 2], (id) => id)).toEqual([1, 4, 3, 2, 5]);
  });

  it("keeps the list when the subset order names an unknown key", () => {
    expect(applySubsetOrder(["a", "b"], ["b", "zzz"], (key) => key)).toEqual(["a", "b"]);
  });
});
