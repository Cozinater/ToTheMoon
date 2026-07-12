import { describe, expect, it } from "vitest";
import { addMonths, filterChartPoints, type ChartRange } from "./chart-range";

describe("addMonths", () => {
  it("subtracts within a year", () => expect(addMonths("2026-07", -5)).toBe("2026-02"));
  it("rolls back across a year boundary", () => expect(addMonths("2026-03", -11)).toBe("2025-04"));
  it("rolls back from January", () => expect(addMonths("2026-01", -1)).toBe("2025-12"));
  it("rolls forward across a year boundary", () => expect(addMonths("2025-12", 1)).toBe("2026-01"));
});

describe("filterChartPoints", () => {
  // Ascending snapshot points plus the live "Now" point (month: null), as the chart receives them.
  const points = ["2024-11", "2025-06", "2025-08", "2026-01", "2026-06", null]
    .map((month) => ({ month }));
  const CURRENT = "2026-07";
  const months = (range: ChartRange) =>
    filterChartPoints(points, range, CURRENT).map((p) => p.month);

  it("all keeps every point", () => {
    expect(months({ preset: "all" })).toEqual(["2024-11", "2025-06", "2025-08", "2026-01", "2026-06", null]);
  });

  it("6m keeps the 6 calendar months up to now, plus Now", () => {
    expect(months({ preset: "6m" })).toEqual(["2026-06", null]);   // cutoff 2026-02
  });

  it("1y keeps the 12 calendar months up to now, inclusive boundary, plus Now", () => {
    expect(months({ preset: "1y" })).toEqual(["2025-08", "2026-01", "2026-06", null]);  // cutoff 2025-08
  });

  it("ytd keeps January of the current year onward, plus Now", () => {
    expect(months({ preset: "ytd" })).toEqual(["2026-01", "2026-06", null]);  // cutoff 2026-01
  });

  it("custom is inclusive on both ends and drops Now when end is in the past", () => {
    expect(months({ start: "2025-06", end: "2026-01" })).toEqual(["2025-06", "2025-08", "2026-01"]);
  });

  it("custom keeps Now when end is the current month", () => {
    expect(months({ start: "2026-06", end: "2026-07" })).toEqual(["2026-06", null]);
  });

  it("custom with only an end is unbounded at the start", () => {
    expect(months({ end: "2025-06" })).toEqual(["2024-11", "2025-06"]);
  });

  it("custom with only a start runs through now", () => {
    expect(months({ start: "2026-06" })).toEqual(["2026-06", null]);
  });

  it("custom with no bounds keeps everything", () => {
    expect(months({})).toEqual(["2024-11", "2025-06", "2025-08", "2026-01", "2026-06", null]);
  });

  it("start after end yields an empty window", () => {
    expect(months({ start: "2026-03", end: "2025-01" })).toEqual([]);
  });

  it("a window with no snapshots yields an empty result", () => {
    expect(months({ start: "2020-01", end: "2020-12" })).toEqual([]);
  });
});
