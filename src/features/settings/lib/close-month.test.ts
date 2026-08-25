import { describe, expect, it } from "vitest";
import { closeMonthOptions, defaultCloseMonth, monthOf } from "./close-month";

describe("monthOf", () => {
  it("takes the YYYY-MM of an ISO date", () => expect(monthOf("2026-08-01")).toBe("2026-08"));
});

describe("closeMonthOptions", () => {
  it("offers the previous month and the date's own month, oldest first", () => {
    expect(closeMonthOptions("2026-08-01")).toEqual(["2026-07", "2026-08"]);
  });

  it("crosses the year boundary", () => {
    expect(closeMonthOptions("2026-01-02")).toEqual(["2025-12", "2026-01"]);
  });
});

describe("defaultCloseMonth", () => {
  it("picks the date's own month when nothing is closed", () => {
    expect(defaultCloseMonth("2026-08-01", [])).toBe("2026-08");
  });

  it("keeps the date's own month when only the previous month is closed", () => {
    expect(defaultCloseMonth("2026-08-31", ["2026-07"])).toBe("2026-08");
  });

  it("falls back to the previous month when the date's own month is already closed", () => {
    expect(defaultCloseMonth("2026-08-01", ["2026-08"])).toBe("2026-07");
  });

  it("stays on the date's own month when both are closed — nothing sensible to offer", () => {
    expect(defaultCloseMonth("2026-08-01", ["2026-07", "2026-08"])).toBe("2026-08");
  });
});
