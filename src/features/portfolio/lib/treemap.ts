export type Rect = { x: number; y: number; w: number; h: number };
export type Tile<T> = Rect & { data: T };

const sum = (xs: number[]) => xs.reduce((acc, x) => acc + x, 0);

/** Worst (largest) aspect ratio in a row of tile areas laid along a side of length `side`. */
function worst(row: number[], side: number): number {
  const s = sum(row);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

/**
 * Squarified treemap (Bruls, Huizing & van Wijk): tiles each item into `rect` with area
 * proportional to its value, keeping tiles as close to square as possible. Largest items
 * land top-left. Items with a non-positive value are dropped.
 */
export function squarify<T>(nodes: { value: number; data: T }[], rect: Rect): Tile<T>[] {
  const items = nodes.filter((n) => n.value > 0).sort((a, b) => b.value - a.value);
  const total = sum(items.map((n) => n.value));
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];

  const scale = (rect.w * rect.h) / total;
  const areas = items.map((n) => n.value * scale);
  const out: Tile<T>[] = [];
  let { x, y, w, h } = rect;
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const row = [areas[i]!];
    let j = i + 1;
    while (j < items.length && worst([...row, areas[j]!], side) <= worst(row, side)) {
      row.push(areas[j]!);
      j++;
    }
    const rowArea = sum(row);
    if (w >= h) {
      // Wider than tall: lay the row as a column down the left edge.
      const colW = rowArea / h;
      let cy = y;
      row.forEach((a, k) => {
        out.push({ x, y: cy, w: colW, h: a / colW, data: items[i + k]!.data });
        cy += a / colW;
      });
      x += colW;
      w -= colW;
    } else {
      const rowH = rowArea / w;
      let cx = x;
      row.forEach((a, k) => {
        out.push({ x: cx, y, w: a / rowH, h: rowH, data: items[i + k]!.data });
        cx += a / rowH;
      });
      y += rowH;
      h -= rowH;
    }
    i = j;
  }
  return out;
}

export type Group<T> = { label: string; items: { value: number; data: T }[] };
export type GroupTile<T> = Rect & { label: string; showHeader: boolean; tiles: Tile<T>[] };

/** Height of a group's name strip; groups too small to spare it go without a header. */
export const HEADER_H = 20;

/**
 * Two-level treemap: groups are squarified by their total value, then each group's items
 * fill the group rectangle below an optional name strip.
 */
export function groupedTreemap<T>(groups: Group<T>[], rect: Rect): GroupTile<T>[] {
  const outer = squarify(
    groups.map((g) => ({ value: sum(g.items.map((i) => i.value)), data: g })),
    rect,
  );
  return outer.map(({ data: g, ...r }) => {
    const showHeader = r.h >= HEADER_H * 2.5 && r.w >= 56;
    const inner = showHeader ? { x: r.x, y: r.y + HEADER_H, w: r.w, h: r.h - HEADER_H } : r;
    return { ...r, label: g.label, showHeader, tiles: squarify(g.items, inner) };
  });
}
