import { describe, expect, it } from "vitest";
import type { Entry, Holding } from "@shared/schema";
import { computeTotals } from "@shared/totals";
import {
  parseHiddenSeries,
  serializeHiddenSeries,
  SERIES,
  toggleSeries,
  visibleTotal,
  type SeriesKey,
} from "./chart-series";

describe("SERIES", () => {
  it("lists the six chart categories in stack order", () => {
    expect(SERIES.map((s) => s.key)).toEqual([
      "portfolio", "savings", "cpf", "property", "creditCards", "loans",
    ]);
  });

  it("puts assets on the positive stack and liabilities on the negative one", () => {
    expect(SERIES.filter((s) => s.stack === "neg").map((s) => s.key)).toEqual(["creditCards", "loans"]);
  });
});

describe("parseHiddenSeries", () => {
  it("treats a missing value as nothing hidden", () => expect(parseHiddenSeries(null)).toEqual([]));
  it("treats an empty string as nothing hidden", () => expect(parseHiddenSeries("")).toEqual([]));
  it("treats malformed JSON as nothing hidden", () => expect(parseHiddenSeries("{oops")).toEqual([]));
  it("treats a non-array value as nothing hidden", () => expect(parseHiddenSeries('{"cpf":true}')).toEqual([]));

  it("keeps a valid subset", () => {
    expect(parseHiddenSeries('["cpf","creditCards"]')).toEqual(["cpf", "creditCards"]);
  });

  it("drops keys that are not chart categories", () => {
    expect(parseHiddenSeries('["cpf","bogus","netWorth"]')).toEqual(["cpf"]);
  });

  it("drops entries that are not strings", () => {
    expect(parseHiddenSeries('["cpf",7,null,{"key":"loans"}]')).toEqual(["cpf"]);
  });

  it("collapses duplicates", () => {
    expect(parseHiddenSeries('["cpf","cpf","loans"]')).toEqual(["cpf", "loans"]);
  });

  it("accepts all six keys — hiding everything is a deliberate state", () => {
    const all: SeriesKey[] = ["portfolio", "savings", "cpf", "property", "creditCards", "loans"];
    expect(parseHiddenSeries(JSON.stringify(all))).toEqual(all);
  });
});

describe("serializeHiddenSeries", () => {
  it("round-trips through parseHiddenSeries", () => {
    const hidden: SeriesKey[] = ["savings", "loans"];
    expect(parseHiddenSeries(serializeHiddenSeries(hidden))).toEqual(hidden);
  });

  it("round-trips the empty list", () => {
    expect(parseHiddenSeries(serializeHiddenSeries([]))).toEqual([]);
  });
});

describe("toggleSeries", () => {
  it("hides a visible category", () => expect(toggleSeries([], "cpf")).toEqual(["cpf"]));

  it("shows a hidden category again", () => {
    expect(toggleSeries(["cpf", "loans"], "cpf")).toEqual(["loans"]);
  });

  it("does not mutate the input", () => {
    const hidden: SeriesKey[] = ["cpf"];
    toggleSeries(hidden, "loans");
    expect(hidden).toEqual(["cpf"]);
  });
});

describe("visibleTotal", () => {
  // Liabilities are stored negated on ChartPoint, so the total is a plain sum.
  const point = {
    portfolio: 80_000, savings: 30_000, cpf: 50_000, property: 600_000,
    creditCards: -2_000, loans: -400_000,
  };
  const netWorth = 358_000;

  it("equals net worth when nothing is hidden", () => {
    expect(visibleTotal(point, [])).toBe(netWorth);
  });

  it("falls by the hidden amount when an asset is hidden", () => {
    expect(visibleTotal(point, ["cpf"])).toBe(netWorth - 50_000);
  });

  it("rises when a liability is hidden", () => {
    expect(visibleTotal(point, ["loans"])).toBe(netWorth + 400_000);
  });

  it("is zero when everything is hidden", () => {
    expect(visibleTotal(point, ["portfolio", "savings", "cpf", "property", "creditCards", "loans"])).toBe(0);
  });
});

describe("visibleTotal vs computeTotals", () => {
  // Pins the invariant the tooltip footer relies on: visibleTotal(point, []) is a
  // recomputed sum over SERIES, not a read of Totals.netWorthSgd. The two only agree
  // because SERIES enumerates exactly the six terms computeTotals folds into
  // netWorthSgd. If a seventh component were ever added to netWorthSgd without a
  // matching SERIES row (and ChartPoint field), this test — not the tooltip — would
  // be the thing that notices the drift.
  const entry = (name: string, balanceSgd: number): Entry => ({
    id: crypto.randomUUID(),
    name,
    balanceSgd,
    asOf: "2026-07-01",
  });

  const holding = (valueUsd: number): Holding => ({
    id: crypto.randomUUID(),
    ticker: "AAA",
    type: "stock",
    quantity: 1,
    priceUsd: valueUsd,
    valueUsd,
    asOf: "2026-07-01",
  });

  it("matches computeTotals' netWorthSgd for a fully populated portfolio", () => {
    const fxRate = 1.35;
    const doc = {
      holdings: [holding(1_000)],
      assets: {
        bankSavings: [entry("Savings", 20_000)],
        cpf: [entry("CPF", 30_000)],
        property: [entry("Condo", 500_000)],
      },
      liabilities: {
        creditCards: [entry("Card", 4_000)],
        loans: [entry("Mortgage", 300_000)],
      },
    };
    const totals = computeTotals(doc, fxRate);

    // Mirrors toPoint in use-dashboard-data.ts: creditCards and loans are negated.
    const point = {
      portfolio: totals.portfolioSgd,
      savings: totals.savingsSgd,
      cpf: totals.cpfSgd,
      property: totals.propertySgd,
      creditCards: -totals.creditCardsSgd,
      loans: -totals.loansSgd,
    };

    expect(visibleTotal(point, [])).toBe(totals.netWorthSgd);
  });
});
