import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketError, createMarketClient } from "./market.ts";
import { tdSymbolSearch } from "./twelve-data.ts";
import { cgSearch } from "./coingecko.ts";

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
afterEach(() => vi.unstubAllGlobals());

const client = () => createMarketClient({ twelveDataKey: "test-key" });

describe("stock/etf quotes (Twelve Data)", () => {
  it("returns a USD quote", async () => {
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
    const { quotes, failed } = await client().quoteBatch([
      { symbol: "VOO", type: "etf" }, { symbol: "XXX", type: "stock" }, { symbol: "BTC", type: "crypto" },
    ]);
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["BTC", "VOO"]);
    expect(failed).toEqual(["XXX"]);
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

  it("caps results at 8", async () => {
    stubFetch({ "/search?query=co": { coins: Array.from({ length: 12 }, (_, i) => (
      { id: `coin-${i}`, symbol: `co${i}`, name: `Coin ${i}` })) } });
    expect(await cgSearch("co")).toHaveLength(8);
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
