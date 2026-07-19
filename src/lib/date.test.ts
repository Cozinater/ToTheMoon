import { describe, expect, it } from "vitest";
import { formatDisplayDate, parseYmd, toYmd } from "./date";
import { currentYm, formatDisplayMonth, parseYm, toYm } from "./date";

describe("parseYmd", () => {
  it("parses a valid date as local time", () => {
    const d = parseYmd("2026-07-11")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(11);
  });

  it("returns undefined for empty and malformed strings", () => {
    expect(parseYmd("")).toBeUndefined();
    expect(parseYmd("11/07/2026")).toBeUndefined();
    expect(parseYmd("2026-7-1")).toBeUndefined();
  });

  it("rejects out-of-range dates like Feb 31", () => {
    expect(parseYmd("2026-02-31")).toBeUndefined();
  });
});

describe("toYmd", () => {
  it("round-trips with parseYmd", () => {
    expect(toYmd(parseYmd("2026-07-11")!)).toBe("2026-07-11");
  });

  it("pads month and day", () => {
    expect(toYmd(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("formatDisplayDate", () => {
  it("formats as d MMM yyyy", () => {
    expect(formatDisplayDate("2026-07-11")).toBe("11 Jul 2026");
  });

  it("returns empty string for empty or invalid input", () => {
    expect(formatDisplayDate("")).toBe("");
    expect(formatDisplayDate("nope")).toBe("");
  });
});

describe("parseYm", () => {
  it("parses a valid yyyy-mm into 1-based year/month", () => {
    expect(parseYm("2026-07")).toEqual({ year: 2026, month: 7 });
  });

  it("returns undefined for empty, malformed, or out-of-range month", () => {
    expect(parseYm("")).toBeUndefined();
    expect(parseYm("2026-7")).toBeUndefined();
    expect(parseYm("2026-07-11")).toBeUndefined();
    expect(parseYm("2026-00")).toBeUndefined();
    expect(parseYm("2026-13")).toBeUndefined();
  });
});

describe("toYm", () => {
  it("zero-pads the month and round-trips with parseYm", () => {
    expect(toYm(2026, 1)).toBe("2026-01");
    expect(parseYm(toYm(2026, 7))).toEqual({ year: 2026, month: 7 });
  });
});

describe("formatDisplayMonth", () => {
  it("formats as MMM yyyy", () => {
    expect(formatDisplayMonth("2026-07")).toBe("Jul 2026");
    expect(formatDisplayMonth("2026-01")).toBe("Jan 2026");
  });

  it("returns empty string for empty or invalid input", () => {
    expect(formatDisplayMonth("")).toBe("");
    expect(formatDisplayMonth("nope")).toBe("");
  });
});

describe("currentYm", () => {
  it("returns a yyyy-mm string", () => {
    expect(currentYm()).toMatch(/^\d{4}-\d{2}$/);
  });
});
