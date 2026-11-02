import { describe, expect, it } from "vitest";
import type { Performance } from "@shared/performance";
import type { InstrumentHolding } from "./cash";
import { HEAT_NEUTRAL, heatColor, heatmapGroups, signedPct } from "./heatmap";

const holding = (ticker: string, valueUsd: number, strategy?: string): InstrumentHolding => ({
  id: crypto.randomUUID(), ticker, type: "stock", quantity: 1, priceUsd: valueUsd, valueUsd, asOf: "2026-10-30", strategy,
});

const perf = (symbol: string, last: number, ytd: number | null): Performance => ({
  symbol, type: "stock", last: { date: "2026-10-30", close: last },
  ytd: ytd === null ? null : { date: "2025-12-31", close: ytd }, yoy: null,
});

describe("heatColor", () => {
  it("is neutral gray at zero and without data", () => {
    expect(heatColor(0)).toBe(HEAT_NEUTRAL);
    expect(heatColor(null)).toBe(HEAT_NEUTRAL);
  });
  it("saturates at the clamp in both directions", () => {
    expect(heatColor(-0.3)).toBe("#b93a32");
    expect(heatColor(-0.9)).toBe("#b93a32");
    expect(heatColor(0.5)).toBe("#1f7a46");
  });
  it("fades a small move toward gray", () => {
    expect(heatColor(0.15)).not.toBe(heatColor(0.3));
    expect(heatColor(0.15)).not.toBe(HEAT_NEUTRAL);
  });
});

describe("heatmapGroups", () => {
  it("groups by strategy, sizes by value and attaches the period change", () => {
    const groups = heatmapGroups(
      [holding("AAPL", 500, "Long Term"), holding("tsla", 200), holding("NVDA", 300, "Long Term")],
      [perf("AAPL", 150, 120), perf("TSLA", 90, 100)],
      "ytd",
    );
    expect(groups.map((g) => g.label)).toEqual(["Long Term", "Unassigned"]);
    const [longTerm, unassigned] = groups;
    expect(longTerm!.items.map((i) => [i.data.holding.ticker, i.value])).toEqual([["AAPL", 500], ["NVDA", 300]]);
    expect(longTerm!.items[0]!.data.change).toBeCloseTo(0.25);
    expect(longTerm!.items[1]!.data.change).toBeNull(); // no history yet
    expect(unassigned!.items[0]!.data.change).toBeCloseTo(-0.1); // lowercase ticker still matches
  });
});

describe("signedPct", () => {
  it("signs gains and losses and dashes a missing figure", () => {
    expect(signedPct(0.1234)).toBe("+12.34%");
    expect(signedPct(-0.031)).toBe("−3.10%");
    expect(signedPct(null)).toBe("—");
  });
});
