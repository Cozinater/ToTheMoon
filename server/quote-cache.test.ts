import { describe, expect, it } from "vitest";
import { MemoryDayCache } from "./quote-cache.ts";

describe("MemoryDayCache", () => {
  it("returns a value stored for the requested day", async () => {
    const cache = new MemoryDayCache();
    await cache.put([{ key: "Q:stock:AAPL", value: { priceUsd: 255 } }], "2026-07-26");
    const hits = await cache.get<{ priceUsd: number }>(["Q:stock:AAPL"], "2026-07-26");
    expect(hits.get("Q:stock:AAPL")).toEqual({ priceUsd: 255 });
  });

  it("misses when the entry was stored on a different day", async () => {
    const cache = new MemoryDayCache();
    await cache.put([{ key: "Q:stock:AAPL", value: { priceUsd: 255 } }], "2026-07-25");
    const hits = await cache.get(["Q:stock:AAPL"], "2026-07-26");
    expect(hits.has("Q:stock:AAPL")).toBe(false);
  });

  it("misses for keys never stored", async () => {
    const cache = new MemoryDayCache();
    const hits = await cache.get(["Q:stock:NONE"], "2026-07-26");
    expect(hits.size).toBe(0);
  });

  it("overwrites a key and refreshes its day", async () => {
    const cache = new MemoryDayCache();
    await cache.put([{ key: "FX:USD/SGD", value: 1.30 }], "2026-07-25");
    await cache.put([{ key: "FX:USD/SGD", value: 1.33 }], "2026-07-26");
    const hits = await cache.get<number>(["FX:USD/SGD"], "2026-07-26");
    expect(hits.get("FX:USD/SGD")).toBe(1.33);
  });
});
