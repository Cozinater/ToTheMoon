import { describe, expect, it } from "vitest";
import type { Holding } from "@shared/schema";
import { strategyMix, UNASSIGNED } from "./strategy-mix";

const holding = (valueUsd: number, strategy?: string): Holding => ({
  id: crypto.randomUUID(),
  ticker: "AAA",
  type: "stock",
  quantity: 1,
  priceUsd: valueUsd,
  valueUsd,
  asOf: "2026-07-01",
  ...(strategy ? { strategy } : {}),
});

const STRATEGIES = ["China", "Turn Around", "Speculative", "Long Term"];

describe("strategyMix", () => {
  it("sums holdings per strategy and returns shares of the total", () => {
    const mix = strategyMix(
      [holding(400, "Long Term"), holding(100, "China"), holding(500, "Long Term")],
      STRATEGIES,
    );
    expect(mix).toEqual([
      { label: "Long Term", valueUsd: 900, share: 0.9, colorIndex: 3 },
      { label: "China", valueUsd: 100, share: 0.1, colorIndex: 0 },
    ]);
  });

  it("orders heaviest first, then alphabetically on ties", () => {
    const mix = strategyMix(
      [holding(50, "Speculative"), holding(100, "China"), holding(50, "Long Term")],
      STRATEGIES,
    );
    expect(mix.map((s) => s.label)).toEqual(["China", "Long Term", "Speculative"]);
  });

  it("collapses strategy-less holdings into Unassigned with no colour", () => {
    const mix = strategyMix([holding(300), holding(100, "China")], STRATEGIES);
    expect(mix[0]).toEqual({ label: UNASSIGNED, valueUsd: 300, share: 0.75, colorIndex: -1 });
  });

  it("marks a strategy missing from Settings as uncoloured", () => {
    const [slice] = strategyMix([holding(100, "Retired Idea")], STRATEGIES);
    expect(slice.colorIndex).toBe(-1);
  });

  it("shares add up to 1", () => {
    const mix = strategyMix(
      [holding(33.33, "China"), holding(66.67, "Long Term"), holding(10)],
      STRATEGIES,
    );
    expect(mix.reduce((acc, s) => acc + s.share, 0)).toBeCloseTo(1, 10);
  });

  it("returns nothing when there is no value to split", () => {
    expect(strategyMix([])).toEqual([]);
    expect(strategyMix([holding(0, "China")], STRATEGIES)).toEqual([]);
  });
});
