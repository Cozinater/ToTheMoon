import { describe, expect, it } from "vitest";
import { formatDisplayDate, parseYmd, toYmd } from "./date";

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
