import { describe, expect, it } from "vitest";
import type { Holding } from "@shared/schema";
import { isCash, isInstrument } from "./cash";

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
  it("is the inverse of isCash", () => {
    expect(isInstrument(stock(1))).toBe(true);
    expect(isInstrument(cashLine(1))).toBe(false);
  });
});
