export type ChartRangePreset = "6m" | "1y" | "ytd" | "all";
export type ChartRange = { preset: ChartRangePreset } | { start?: string; end?: string };

// Months are "YYYY-MM" strings; lexicographic comparison is chronological.
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function presetStart(preset: ChartRangePreset, currentMonth: string): string | undefined {
  switch (preset) {
    case "6m": return addMonths(currentMonth, -5);
    case "1y": return addMonths(currentMonth, -11);
    case "ytd": return `${currentMonth.slice(0, 4)}-01`;
    case "all": return undefined;
  }
}

export function filterChartPoints<T extends { month: string | null }>(
  points: T[],
  range: ChartRange,
  currentMonth: string,
): T[] {
  const start = "preset" in range ? presetStart(range.preset, currentMonth) : range.start;
  const end = "preset" in range ? undefined : range.end;
  const includeNow = end == null || end >= currentMonth;
  return points.filter((p) =>
    p.month == null
      ? includeNow
      : (start == null || p.month >= start) && (end == null || p.month <= end),
  );
}
