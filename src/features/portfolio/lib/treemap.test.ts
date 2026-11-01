import { describe, expect, it } from "vitest";
import { HEADER_H, groupedTreemap, squarify } from "./treemap";

const area = (t: { w: number; h: number }) => t.w * t.h;

describe("squarify", () => {
  const rect = { x: 0, y: 0, w: 600, h: 400 };
  const tiles = squarify([6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ value, data: i })), rect);

  it("gives every item an area proportional to its value and fills the rectangle", () => {
    const total = 24;
    for (const t of tiles) {
      const value = [6, 6, 4, 3, 2, 2, 1][t.data]!;
      expect(area(t)).toBeCloseTo((value / total) * 600 * 400, 6);
    }
    expect(tiles.reduce((acc, t) => acc + area(t), 0)).toBeCloseTo(600 * 400, 6);
  });

  it("keeps every tile inside the rectangle", () => {
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(600 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(400 + 1e-9);
    }
  });

  it("drops non-positive values and handles an empty input", () => {
    expect(squarify([{ value: 0, data: "a" }, { value: 5, data: "b" }], rect).map((t) => t.data)).toEqual(["b"]);
    expect(squarify([], rect)).toEqual([]);
  });
});

describe("groupedTreemap", () => {
  it("reserves a header strip in groups big enough to label", () => {
    const [big, small] = groupedTreemap([
      { label: "Long Term", items: [{ value: 95, data: "A" }, { value: 4, data: "B" }] },
      { label: "Speculative", items: [{ value: 1, data: "C" }] },
    ], { x: 0, y: 0, w: 800, h: 400 });
    expect(big!.label).toBe("Long Term");
    expect(big!.showHeader).toBe(true);
    expect(Math.min(...big!.tiles.map((t) => t.y))).toBeCloseTo(big!.y + HEADER_H);
    expect(small!.showHeader).toBe(false); // a 1% sliver can't spare the strip
  });
});
