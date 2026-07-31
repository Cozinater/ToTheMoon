import { describe, expect, it } from "vitest";
import type { Holding, QuotableType } from "@shared/schema";
import { isCash, isInstrument, splitCash } from "./cash";

const stock = (valueUsd: number): Holding => ({
  id: crypto.randomUUID(),
  ticker: "AAA",
  type: "stock",
  quantity: 1,
  priceUsd: valueUsd,
  valueUsd,
  asOf: "2026-07-01",
});

const cashLine = (valueUsd: number, ticker = "IBKR USD"): Holding => ({
  id: crypto.randomUUID(),
  ticker,
  type: "cash",
  quantity: valueUsd,
  priceUsd: 1,
  valueUsd,
  asOf: "2026-07-01",
});

describe("isCash", () => {
  it("distinguishes cash lines from instruments", () => {
    expect(isCash(cashLine(1))).toBe(true);
    expect(isCash(stock(1))).toBe(false);
  });
});

describe("isInstrument", () => {
  it("accepts instruments and rejects cash", () => {
    expect(isInstrument(stock(1))).toBe(true);
    expect(isInstrument(cashLine(1))).toBe(false);
  });
});

describe("splitCash", () => {
  it("partitions holdings and totals each side", () => {
    const split = splitCash([stock(700), cashLine(200), stock(100)]);
    expect(split.invested.map((h) => h.valueUsd)).toEqual([700, 100]);
    expect(split.cash.map((h) => h.valueUsd)).toEqual([200]);
    expect(split.investedUsd).toBe(800);
    expect(split.cashUsd).toBe(200);
  });

  it("keeps cash off the invested side", () => {
    const split = splitCash([cashLine(200), stock(700), cashLine(50)]);
    expect(split.invested.some(isCash)).toBe(false);
    expect(split.invested.every(isInstrument)).toBe(true);
    // The compile-time half of the same guarantee: `invested` is InstrumentHolding[],
    // so the `${ticker}:${type}` symbols the Refresh button builds from it can never
    // carry a cash line to /api/quote. This annotation is what `tsc` checks.
    const quotableTypes: QuotableType[] = split.invested.map((h) => h.type);
    expect(quotableTypes).toEqual(["stock"]);
  });

  it("preserves input order within each side", () => {
    const split = splitCash([cashLine(1, "A"), cashLine(2, "B"), cashLine(3, "C")]);
    expect(split.cash.map((h) => h.ticker)).toEqual(["A", "B", "C"]);
  });

  it("returns zeroed totals for no holdings", () => {
    expect(splitCash([])).toEqual({ invested: [], cash: [], investedUsd: 0, cashUsd: 0 });
  });

  it("handles a cash-only portfolio", () => {
    const split = splitCash([cashLine(5000)]);
    expect(split.invested).toEqual([]);
    expect(split.investedUsd).toBe(0);
    expect(split.cashUsd).toBe(5000);
  });

  it("rounds each side to cents, like computeTotals", () => {
    const split = splitCash([stock(0.005), stock(0.005), cashLine(0.004)]);
    expect(split.investedUsd).toBe(0.01);
    expect(split.cashUsd).toBe(0);
  });
});
