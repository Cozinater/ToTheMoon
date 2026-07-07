import { describe, expect, it } from "vitest";
import {
  amendInputSchema, draftInputSchema, emptyDraft, holdingSchema,
} from "./schema.ts";

const entry = (name: string) => ({
  id: crypto.randomUUID(), name, balanceSgd: 100, asOf: "2026-07-01",
});
const holding = () => ({
  id: crypto.randomUUID(), ticker: "VOO", type: "etf" as const,
  quantity: 25, priceUsd: 603.79, valueUsd: 15094.75, asOf: "2026-07-01",
});

describe("draftInputSchema", () => {
  it("accepts a valid draft and strips unknown keys", () => {
    const parsed = draftInputSchema.parse({
      ...emptyDraft(), holdings: [holding()], fxRate: 1.328,
      updatedAt: "2026-07-01T00:00:00Z", // unknown on input → stripped
    });
    expect(parsed.holdings).toHaveLength(1);
    expect("updatedAt" in parsed).toBe(false);
  });

  it.each([
    ["bankSavings", 6], ["cpf", 5], ["property", 2],
  ] as const)("rejects %s over its limit", (key, count) => {
    const draft = emptyDraft();
    draft.assets[key] = Array.from({ length: count }, (_, i) => entry(`a${i}`));
    expect(draftInputSchema.safeParse(draft).success).toBe(false);
  });

  it("rejects a 6th credit card but allows 6 loans", () => {
    const six = Array.from({ length: 6 }, (_, i) => entry(`x${i}`));
    const bad = { ...emptyDraft(), liabilities: { creditCards: six, loans: [] } };
    const ok = { ...emptyDraft(), liabilities: { creditCards: [], loans: six } };
    expect(draftInputSchema.safeParse(bad).success).toBe(false);
    expect(draftInputSchema.safeParse(ok).success).toBe(true);
  });
});

describe("holdingSchema", () => {
  it("rejects non-uuid id, bad date, zero quantity", () => {
    expect(holdingSchema.safeParse({ ...holding(), id: "nope" }).success).toBe(false);
    expect(holdingSchema.safeParse({ ...holding(), asOf: "01/07/2026" }).success).toBe(false);
    expect(holdingSchema.safeParse({ ...holding(), quantity: 0 }).success).toBe(false);
  });
});

describe("amendInputSchema", () => {
  it("requires snapshotDate and fxRate, refuses totals", () => {
    const base = { ...emptyDraft(), snapshotDate: "2026-06-26", fxRate: 1.328 };
    expect(amendInputSchema.safeParse(base).success).toBe(true);
    expect(amendInputSchema.safeParse({ ...base, fxRate: undefined }).success).toBe(false);
    const withTotals = amendInputSchema.parse({ ...base, totals: { netWorthSgd: 1 } });
    expect("totals" in withTotals).toBe(false); // stripped, recomputed server-side
  });
});
