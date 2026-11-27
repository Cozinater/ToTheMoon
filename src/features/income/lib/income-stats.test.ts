import { describe, expect, it } from "vitest";
import type { IncomeEntry } from "@shared/schema";
import { incomeSummary, withChanges } from "./income-stats";

const row = (date: string, amountSgd: number): IncomeEntry => ({ id: date, date, amountSgd });

describe("withChanges", () => {
  it("sorts oldest first and gives each row its change against the row before", () => {
    const rows = withChanges([row("2022-01-03", 4800), row("2021-07-05", 4600), row("2022-07-04", 4992)]);
    expect(rows.map((r) => r.date)).toEqual(["2021-07-05", "2022-01-03", "2022-07-04"]);
    expect(rows[0].changePct).toBeNull();
    expect(rows[1].changePct).toBeCloseTo(200 / 4600);
    expect(rows[2].changePct).toBeCloseTo(0.04);
  });

  it("reports a pay cut as a negative change", () => {
    const rows = withChanges([row("2021-01-01", 5000), row("2022-01-01", 4500)]);
    expect(rows[1].changePct).toBeCloseTo(-0.1);
  });
});

describe("incomeSummary", () => {
  it("is null with no rows", () => {
    expect(incomeSummary([])).toBeNull();
  });

  it("has no growth figures with a single row", () => {
    const s = incomeSummary([row("2021-07-05", 4600)]);
    expect(s?.latest.amountSgd).toBe(4600);
    expect(s?.totalGrowthPct).toBeNull();
    expect(s?.annualisedPct).toBeNull();
  });

  it("measures total and yearly growth from the first row to the latest", () => {
    // 4,600 on 5 Jul 2021 → 7,640.37 on 12 Apr 2026: 1,742 days ≈ 4.77 years.
    const s = incomeSummary([row("2026-04-12", 7640.37), row("2021-07-05", 4600), row("2023-07-10", 5152)]);
    expect(s?.first.date).toBe("2021-07-05");
    expect(s?.latest.date).toBe("2026-04-12");
    expect(s?.totalGrowthPct).toBeCloseTo(7640.37 / 4600 - 1);
    expect(s?.annualisedPct).toBeCloseTo((7640.37 / 4600) ** (365.25 / 1742) - 1);
  });

  it("skips the yearly rate when the rows span less than a year", () => {
    // Six months of data would otherwise be compounded into a misleading yearly figure.
    const s = incomeSummary([row("2021-07-05", 4600), row("2022-01-03", 4800)]);
    expect(s?.totalGrowthPct).toBeCloseTo(200 / 4600);
    expect(s?.annualisedPct).toBeNull();
  });
});
