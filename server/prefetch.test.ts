import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyDraft, type Holding } from "../shared/schema.ts";
import { createMarketClient } from "./market.ts";
import { MemoryDayCache } from "./quote-cache.ts";
import { MemoryStore } from "./store.ts";
import { prefetchQuotes } from "./prefetch.ts";

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});
afterEach(() => vi.unstubAllGlobals());

const holding = (ticker: string): Holding => ({
  id: crypto.randomUUID(), ticker, type: "stock",
  quantity: 1, priceUsd: 0, valueUsd: 0, asOf: "2026-07-01",
});

describe("prefetchQuotes", () => {
  it("warms the day cache for every holding, pacing across per-minute rounds", async () => {
    const store = new MemoryStore();
    const tickers = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
    await store.putDraft({ ...emptyDraft(), holdings: tickers.map(holding), updatedAt: "2026-07-01T00:00:00Z" });

    let eodCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/eod")) {
        eodCalls++;
        const syms = new URL(u).searchParams.get("symbol")!.split(",");
        return json(Object.fromEntries(syms.map((s) => [s, { symbol: s, currency: "USD", datetime: "2026-07-03", close: "10" }])));
      }
      if (u.includes("/exchange_rate")) return json({ symbol: "USD/SGD", rate: 1.3, timestamp: 1782115200 });
      throw new Error(`unexpected fetch: ${u}`);
    }));

    const cache = new MemoryDayCache();
    const market = createMarketClient({ twelveDataKey: "k", cache });
    const waits: number[] = [];
    const result = await prefetchQuotes(store, market, { wait: async (ms) => { waits.push(ms); } });

    expect(result.rounds).toBe(2);        // 10 stocks ÷ cap 7 → two rounds
    expect(waits).toHaveLength(1);        // paced once, between the rounds
    expect(eodCalls).toBe(2);

    // The cache is now warm: a full refresh resolves everything with no new fetch.
    const after = await market.quoteBatch(tickers.map((t) => ({ symbol: t, type: "stock" as const })));
    expect(after.quotes).toHaveLength(10);
    expect(after.rateLimited).toEqual([]);
    expect(eodCalls).toBe(2);             // unchanged → served from cache
  });

  it("warms only FX (no equity fetches) when there are no holdings", async () => {
    const store = new MemoryStore();
    let eodCalls = 0, fxCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/eod")) { eodCalls++; return json({}); }
      if (u.includes("/exchange_rate")) { fxCalls++; return json({ symbol: "USD/SGD", rate: 1.3, timestamp: 1782115200 }); }
      throw new Error(`unexpected fetch: ${u}`);
    }));
    const market = createMarketClient({ twelveDataKey: "k", cache: new MemoryDayCache() });
    const result = await prefetchQuotes(store, market, { wait: async () => {} });
    expect(result.rounds).toBe(0);
    expect(eodCalls).toBe(0);
    expect(fxCalls).toBe(1);
  });

  it("filters cash holdings out before they reach the market client", async () => {
    const store = new MemoryStore();
    const cash: Holding = {
      id: crypto.randomUUID(), ticker: "IBKR", type: "cash",
      quantity: 500, priceUsd: 1, valueUsd: 500, asOf: "2026-07-01",
    };
    await store.putDraft({ ...emptyDraft(), holdings: [holding("AAPL"), cash], updatedAt: "2026-07-01T00:00:00Z" });

    let eodSymbols: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/eod")) {
        eodSymbols = new URL(u).searchParams.get("symbol")!.split(",");
        return json(Object.fromEntries(eodSymbols.map((s) => [s, { symbol: s, currency: "USD", datetime: "2026-07-03", close: "10" }])));
      }
      if (u.includes("/exchange_rate")) return json({ symbol: "USD/SGD", rate: 1.3, timestamp: 1782115200 });
      throw new Error(`unexpected fetch: ${u}`);
    }));

    const market = createMarketClient({ twelveDataKey: "k", cache: new MemoryDayCache() });
    const result = await prefetchQuotes(store, market, { wait: async () => {} });

    expect(result.resolved).toBe(1); // only the stock counted — cash was never a candidate
    expect(result.pending).toBe(0);
    expect(eodSymbols).toEqual(["AAPL"]); // cash never reached quoteBatch / the market client
  });
});
