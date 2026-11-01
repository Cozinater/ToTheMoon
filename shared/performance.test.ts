import { describe, expect, it } from "vitest";
import { historyStart, oneYearBefore, periodChange, pickBaselines, type PricePoint } from "./performance.ts";

const bar = (date: string, close: number): PricePoint => ({ date, close });

describe("pickBaselines", () => {
  const history = [
    bar("2026-10-30", 150),
    bar("2025-10-29", 90),
    bar("2025-10-31", 100), // a year before the latest bar falls on a weekend: use the Friday before it
    bar("2025-12-31", 120),
    bar("2026-01-02", 125),
  ];

  it("measures YTD from the previous year's last close and YoY from the same day a year earlier", () => {
    expect(pickBaselines(history)).toEqual({
      last: bar("2026-10-30", 150),
      ytd: bar("2025-12-31", 120),
      yoy: bar("2025-10-29", 90),
    });
  });

  it("takes the last close on or before the target when the target is not a trading day", () => {
    const res = pickBaselines([bar("2025-12-30", 118), bar("2026-01-05", 125), bar("2026-03-02", 130)]);
    expect(res?.ytd).toEqual(bar("2025-12-30", 118));
  });

  it("accepts an oldest bar a few days after the target (CoinGecko's 365-day cap)", () => {
    const res = pickBaselines([bar("2025-11-02", 70), bar("2025-12-31", 80), bar("2026-11-01", 100)]);
    expect(res?.yoy).toEqual(bar("2025-11-02", 70));
  });

  it("returns null baselines when the history is too short", () => {
    expect(pickBaselines([bar("2026-06-01", 10), bar("2026-10-30", 12)])).toEqual({
      last: bar("2026-10-30", 12), ytd: null, yoy: null,
    });
  });

  it("never uses the latest bar as its own baseline", () => {
    expect(pickBaselines([bar("2026-01-03", 10)])).toEqual({ last: bar("2026-01-03", 10), ytd: null, yoy: null });
  });

  it("returns null for an empty history", () => {
    expect(pickBaselines([])).toBeNull();
  });
});

describe("periodChange", () => {
  const p = { last: bar("2026-10-30", 150), ytd: bar("2025-12-31", 120), yoy: null };
  it("is the fractional change from the baseline", () => {
    expect(periodChange(p, "ytd")).toBeCloseTo(0.25);
  });
  it("is null without a baseline", () => {
    expect(periodChange(p, "yoy")).toBeNull();
  });
});

describe("date helpers", () => {
  it("steps back one calendar year, folding 29 Feb to 28 Feb", () => {
    expect(oneYearBefore("2026-11-01")).toBe("2025-11-01");
    expect(oneYearBefore("2028-02-29")).toBe("2027-02-28");
  });

  it("starts the history ten days before the year-on-year target", () => {
    expect(historyStart("2026-11-01")).toBe("2025-10-22");
  });

  it("still reaches the YTD baseline when the latest bar sits in the old year", () => {
    // Opened on Sun 3 Jan 2027: the latest bar is 31 Dec 2026, so YTD measures from 31 Dec 2025.
    expect(historyStart("2027-01-03") <= "2025-12-31").toBe(true);
  });
});
