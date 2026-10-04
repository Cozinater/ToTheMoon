import { describe, expect, it } from "vitest";
import { readCollapsed, writeCollapsed } from "./sidebar-state";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

const brokenStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

describe("sidebar collapsed state", () => {
  it("defaults to expanded when nothing is saved", () => {
    expect(readCollapsed(memoryStorage())).toBe(false);
  });

  it("round-trips both states", () => {
    const s = memoryStorage();
    writeCollapsed(s, true);
    expect(readCollapsed(s)).toBe(true);
    writeCollapsed(s, false);
    expect(readCollapsed(s)).toBe(false);
  });

  it("falls back to expanded when storage is blocked", () => {
    expect(readCollapsed(brokenStorage)).toBe(false);
    expect(() => writeCollapsed(brokenStorage, true)).not.toThrow();
  });
});
