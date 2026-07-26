import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketError, createMarketClient } from "./market.ts";
import { tdSymbolSearch } from "./twelve-data.ts";
import { cgSearch } from "./coingecko.ts";
import { MemoryDayCache } from "./quote-cache.ts";

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});

/** Routes fetch calls by URL substring; throws on anything unmatched. */
function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const u = String(url);
    for (const [needle, body] of Object.entries(routes)) {
      if (u.includes(needle)) return json(body);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const client = (cache = new MemoryDayCache()) =>
  createMarketClient({ twelveDataKey: "test-key", cache });

describe("stock/etf quotes (Twelve Data)", () => {
  it("returns the end-of-day close stamped with the bar's date", async () => {
    stubFetch({ "/eod?symbol=AAPL": { symbol: "AAPL", currency: "USD", datetime: "2026-07-03", close: "255.75" } });
    expect(await client().quote("AAPL", "stock")).toEqual(
      { symbol: "AAPL", type: "stock", priceUsd: 255.75, asOf: "2026-07-03" });
  });

  it("maps upstream 404 payload to TICKER_NOT_FOUND", async () => {
    stubFetch({ "/eod?symbol=VOOO": { code: 404, status: "error", message: "symbol not found" } });
    await expect(client().quote("VOOO", "etf")).rejects.toMatchObject(
      { code: "TICKER_NOT_FOUND" } satisfies Partial<MarketError>);
  });

  it("rejects non-USD listings", async () => {
    stubFetch({ "/eod?symbol=D05": { symbol: "D05", currency: "SGD", datetime: "2026-07-03", close: "35.10" } });
    await expect(client().quote("D05", "stock")).rejects.toMatchObject({ code: "TICKER_NOT_FOUND" });
  });
});

describe("quoteBatch caching & rate-limit handling", () => {
  const stock = (symbol: string) => ({ symbol, type: "stock" as const });
  const eodBody = (symbols: string[]) =>
    Object.fromEntries(symbols.map((s) => [s, { symbol: s, currency: "USD", datetime: "2026-07-03", close: "10" }]));

  it("caps equity fetches at the per-minute budget and rate-limits the overflow", async () => {
    let requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      requested = new URL(String(url)).searchParams.get("symbol")!.split(",");
      return json(eodBody(requested));
    }));
    const symbols = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
    const { quotes, rateLimited, failed } = await client().quoteBatch(symbols.map(stock));
    expect(requested).toHaveLength(7);                       // only 7 sent to Twelve Data
    expect(quotes).toHaveLength(7);
    expect(failed).toEqual([]);
    expect(rateLimited.sort()).toEqual(["S10", "S8", "S9"]); // the 3 over the cap
  });

  it("rate-limits (does not throw) when Twelve Data returns HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).includes("/eod")) return new Response("limit", { status: 429 });
      throw new Error(`unexpected fetch: ${url}`);
    }));
    const { quotes, rateLimited, failed } = await client().quoteBatch([stock("AAPL"), stock("MSFT")]);
    expect(quotes).toEqual([]);
    expect(failed).toEqual([]);
    expect(rateLimited.sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("still returns crypto when the equity fetch is rate-limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/eod")) return new Response("limit", { status: 429 });
      if (u.includes("/search?query=BTC")) return json({ coins: [{ id: "bitcoin", symbol: "btc" }] });
      if (u.includes("/simple/price?ids=bitcoin")) return json({ bitcoin: { usd: 106535 } });
      throw new Error(`unexpected fetch: ${u}`);
    }));
    const { quotes, rateLimited } = await client().quoteBatch([stock("AAPL"), { symbol: "BTC", type: "crypto" }]);
    expect(quotes.map((q) => q.symbol)).toEqual(["BTC"]);
    expect(rateLimited).toEqual(["AAPL"]);
  });

  it("serves a repeat refresh from cache without re-hitting Twelve Data", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/eod")) {
        return json({ symbol: "AAPL", currency: "USD", datetime: "2026-07-03", close: "255.75" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const c = client();
    const first = await c.quoteBatch([stock("AAPL")]);
    const second = await c.quoteBatch([stock("AAPL")]);
    expect(first.quotes[0]!.priceUsd).toBe(255.75);
    expect(second.quotes[0]!.priceUsd).toBe(255.75);
    expect(fetchMock).toHaveBeenCalledTimes(1); // second refresh is a cache hit
  });

  it("caches the FX rate for the day", async () => {
    const fetchMock = vi.fn(async () => json({ symbol: "USD/SGD", rate: 1.328, timestamp: 1782115200 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = client();
    await c.fx();
    await c.fx();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("crypto quotes (CoinGecko)", () => {
  it("resolves symbol via search then prices it", async () => {
    stubFetch({
      "/search?query=BTC": { coins: [{ id: "bitcoin", symbol: "btc" }] },
      "/simple/price?ids=bitcoin": { bitcoin: { usd: 106535 } },
    });
    const q = await client().quote("BTC", "crypto");
    expect(q.priceUsd).toBe(106535);
    expect(q.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("unknown symbol → TICKER_NOT_FOUND", async () => {
    stubFetch({ "/search?query=NOPE": { coins: [] } });
    await expect(client().quote("NOPE", "crypto")).rejects.toMatchObject({ code: "TICKER_NOT_FOUND" });
  });
});

describe("fx", () => {
  it("returns USD/SGD with asOf date", async () => {
    stubFetch({ "/exchange_rate?symbol=USD%2FSGD": { symbol: "USD/SGD", rate: 1.328, timestamp: 1782115200 } });
    expect(await client().fx()).toEqual({ pair: "USD/SGD", rate: 1.328, asOf: "2026-06-22" });
  });
});

describe("quoteBatch", () => {
  it("mixes types, one call per provider, collects failures", async () => {
    stubFetch({
      "/eod?symbol=VOO%2CXXX": {
        VOO: { symbol: "VOO", currency: "USD", datetime: "2026-07-03", close: "603.79" },
        XXX: { code: 404, status: "error", message: "not found" },
      },
      "/search?query=BTC": { coins: [{ id: "bitcoin", symbol: "btc" }] },
      "/simple/price?ids=bitcoin": { bitcoin: { usd: 106535 } },
    });
    const { quotes, failed, rateLimited } = await client().quoteBatch([
      { symbol: "VOO", type: "etf" }, { symbol: "XXX", type: "stock" }, { symbol: "BTC", type: "crypto" },
    ]);
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["BTC", "VOO"]);
    expect(failed).toEqual(["XXX"]);
    expect(rateLimited).toEqual([]);
  });
});

describe("symbol search (Twelve Data)", () => {
  it("maps instrument types and keeps non-USD currency", async () => {
    stubFetch({
      "/symbol_search?symbol=VO": { status: "ok", data: [
        { symbol: "VOO", instrument_name: "Vanguard S&P 500 ETF", instrument_type: "ETF", exchange: "NYSE", currency: "USD" },
        { symbol: "VOD", instrument_name: "Vodafone Group Plc", instrument_type: "Common Stock", exchange: "LSE", currency: "GBp" },
      ] },
    });
    expect(await tdSymbolSearch("test-key", "VO")).toEqual([
      { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "etf", exchange: "NYSE", currency: "USD" },
      { symbol: "VOD", name: "Vodafone Group Plc", type: "stock", exchange: "LSE", currency: "GBp" },
    ]);
  });

  it("returns [] when the payload has no data array", async () => {
    stubFetch({ "/symbol_search?symbol=ZZZZ": { status: "ok" } });
    expect(await tdSymbolSearch("test-key", "ZZZZ")).toEqual([]);
  });
});

describe("crypto search (CoinGecko)", () => {
  it("maps coins to upper-case symbol and name", async () => {
    stubFetch({ "/search?query=bitc": { coins: [
      { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
      { id: "bitcoin-cash", symbol: "bch", name: "Bitcoin Cash" },
    ] } });
    expect(await cgSearch("bitc")).toEqual([
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "BCH", name: "Bitcoin Cash" },
    ]);
  });

  it("caps results at 12", async () => {
    stubFetch({ "/search?query=co": { coins: Array.from({ length: 15 }, (_, i) => (
      { id: `coin-${i}`, symbol: `co${i}`, name: `Coin ${i}` })) } });
    expect(await cgSearch("co")).toHaveLength(12);
  });

  it("returns [] when the payload has no coins array", async () => {
    stubFetch({ "/search?query=weird": {} });
    expect(await cgSearch("weird")).toEqual([]);
  });
});

describe("search", () => {
  it("merges equities and crypto, exact symbol matches first", async () => {
    stubFetch({
      "/symbol_search?symbol=UNI": { status: "ok", data: [
        { symbol: "UNIT", instrument_name: "Uniti Group", instrument_type: "Common Stock", exchange: "NASDAQ", currency: "USD" },
        { symbol: "UNI", instrument_name: "Universal Corp", instrument_type: "Common Stock", exchange: "NYSE", currency: "USD" },
      ] },
      "/search?query=UNI": { coins: [{ id: "uniswap", symbol: "uni", name: "Uniswap" }] },
    });
    const results = await client().search("UNI");
    expect(results.map((r) => `${r.symbol}:${r.type}`)).toEqual(
      ["UNI:stock", "UNI:crypto", "UNIT:stock"]);
  });

  it("keeps the exact crypto match, USD-priced, even when equities fill every slot", async () => {
    stubFetch({
      "/symbol_search?symbol=BTC": { status: "ok", data: Array.from({ length: 12 }, (_, i) => ({
        symbol: "BTC", instrument_name: `BTC Equity ${i}`, instrument_type: "Common Stock",
        exchange: `EX${i}`, currency: "THB",
      })) },
      "/search?query=BTC": { coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] },
    });
    const results = await client().search("BTC");
    // Crypto survives the merge, and is priced in USD so the dropdown keeps it selectable.
    expect(results).toContainEqual({ symbol: "BTC", name: "Bitcoin", type: "crypto", currency: "USD" });
  });

  it("returns partial results when one source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/symbol_search")) throw new Error("network down");
      if (u.includes("/search?query=BTC")) return json({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] });
      throw new Error(`unexpected fetch: ${u}`);
    }));
    expect(await client().search("BTC")).toEqual(
      [{ symbol: "BTC", name: "Bitcoin", type: "crypto", currency: "USD" }]);
  });

  it("throws UPSTREAM when both sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(client().search("BTC")).rejects.toMatchObject({
      code: "UPSTREAM",
      message: "Search unavailable — try again",
    });
  });
});
