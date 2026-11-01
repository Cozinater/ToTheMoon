import { historyStart, pickBaselines, type PerformanceBatch, type Performance, type PricePoint } from "../shared/performance.ts";
import type { QuotableType } from "../shared/schema.ts";
import { cgDailyHistory, cgQuotes, cgSearch } from "./coingecko.ts";
import { MemoryDayCache, type DayCache } from "./quote-cache.ts";
import { tdDailyHistory, tdEodBatch, tdFx, tdSymbolSearch } from "./twelve-data.ts";

/** Max combined search results returned to the client (also the per-source fetch size). */
export const SEARCH_LIMIT = 12;

/**
 * Twelve Data's free tier allows 8 credits/min and charges 1 credit per symbol.
 * A single refresh fetches at most this many uncached equities so the call itself
 * never trips a 429, leaving one credit of headroom for the daily FX rate. Anything
 * beyond it is reported as rate-limited and picked up by the next refresh (or the
 * overnight prefetch), by which point the fetched symbols are cached for the day.
 */
export const EQUITY_PER_MIN_CAP = 7;

const quoteCacheKey = (symbol: string, type: QuotableType) => `Q:${type}:${symbol.toUpperCase()}`;
const performanceCacheKey = (symbol: string, type: QuotableType) => `P:${type}:${symbol.toUpperCase()}`;
const FX_CACHE_KEY = "FX:USD/SGD";

/** Today's date (UTC) as YYYY-MM-DD — the single as-of stamp shared by every quote provider. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type Quote = { symbol: string; type: QuotableType; priceUsd: number; asOf: string };
export type Fx = { pair: "USD/SGD"; rate: number; asOf: string };
export type SearchResult = {
  symbol: string; name: string; type: QuotableType; exchange?: string; currency: string;
};

export class MarketError extends Error {
  constructor(public code: "TICKER_NOT_FOUND" | "UPSTREAM" | "RATE_LIMITED", message: string) { super(message); }
}

/** Round-robin merge of two lists, preserving each list's order (a wins ties). */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

export type QuoteBatchResult = { quotes: Quote[]; failed: string[]; rateLimited: string[] };

type SymbolReq = { symbol: string; type: QuotableType };
type Resolved<V> = { values: V[]; failed: string[]; rateLimited: string[] };

export interface MarketClient {
  quote(symbol: string, type: QuotableType): Promise<Quote>;
  quoteBatch(reqs: { symbol: string; type: QuotableType }[]): Promise<QuoteBatchResult>;
  /** Latest close plus YTD / year-on-year baselines; same caching and rate-limit rules as quoteBatch. */
  performanceBatch(reqs: { symbol: string; type: QuotableType }[]): Promise<PerformanceBatch>;
  fx(): Promise<Fx>;
  search(q: string): Promise<SearchResult[]>;
}

export function createMarketClient(
  { twelveDataKey, cache = new MemoryDayCache() }: { twelveDataKey: string; cache?: DayCache },
): MarketClient {
  /**
   * Resolve one provider's requests cache-first: serve same-day cache hits for free,
   * fetch up to `cap` of the rest, cache what came back, and report anything over the
   * cap — or a rate-limit response — as `rateLimited` (retryable) rather than failing.
   * `fetchFresh` returns the per-symbol payload; `null` means the symbol has no data.
   */
  async function resolve<V extends SymbolReq>(
    reqs: SymbolReq[],
    day: string,
    cap: number,
    cacheKey: (symbol: string, type: QuotableType) => string,
    fetchFresh: (symbols: string[]) => Promise<Map<string, Omit<V, keyof SymbolReq> | null>>,
  ): Promise<Resolved<V>> {
    const values: V[] = [];
    const failed: string[] = [];
    const rateLimited: string[] = [];
    if (reqs.length === 0) return { values, failed, rateLimited };

    const cached = await cache.get<V>(reqs.map((r) => cacheKey(r.symbol, r.type)), day);
    const uncached: SymbolReq[] = [];
    for (const r of reqs) {
      const hit = cached.get(cacheKey(r.symbol, r.type));
      if (hit) values.push(hit);
      else uncached.push(r);
    }

    const toFetch = uncached.slice(0, cap);
    rateLimited.push(...uncached.slice(cap).map((r) => r.symbol.toUpperCase()));
    if (toFetch.length > 0) {
      try {
        const bySymbol = await fetchFresh(toFetch.map((r) => r.symbol));
        const fresh: V[] = [];
        for (const r of toFetch) {
          const hit = bySymbol.get(r.symbol.toUpperCase());
          if (hit) {
            const v = { symbol: r.symbol.toUpperCase(), type: r.type, ...hit } as V;
            values.push(v);
            fresh.push(v);
          } else failed.push(r.symbol.toUpperCase());
        }
        if (fresh.length > 0) {
          await cache.put(fresh.map((v) => ({ key: cacheKey(v.symbol, v.type), value: v })), day);
        }
      } catch (err) {
        if (err instanceof MarketError && err.code === "RATE_LIMITED") {
          rateLimited.push(...toFetch.map((r) => r.symbol.toUpperCase()));
        } else throw err;
      }
    }
    return { values, failed, rateLimited };
  }

  /**
   * Resolve equities and crypto separately. Crypto (CoinGecko) is a separate provider
   * with its own limits, so an equity rate-limit never wipes out the crypto results too.
   */
  async function resolveBoth<V extends SymbolReq>(
    reqs: SymbolReq[],
    cacheKey: (symbol: string, type: QuotableType) => string,
    fetchEquities: (symbols: string[]) => Promise<Map<string, Omit<V, keyof SymbolReq> | null>>,
    fetchCryptos: (symbols: string[]) => Promise<Map<string, Omit<V, keyof SymbolReq> | null>>,
  ): Promise<Resolved<V>> {
    const day = todayIso();
    const equities = await resolve<V>(
      reqs.filter((r) => r.type !== "crypto"), day, EQUITY_PER_MIN_CAP, cacheKey, fetchEquities);
    const cryptos = await resolve<V>(
      reqs.filter((r) => r.type === "crypto"), day, Infinity, cacheKey, fetchCryptos);
    return {
      values: [...equities.values, ...cryptos.values],
      failed: [...equities.failed, ...cryptos.failed],
      rateLimited: [...equities.rateLimited, ...cryptos.rateLimited],
    };
  }

  async function quoteBatch(reqs: SymbolReq[]): Promise<QuoteBatchResult> {
    const { values, failed, rateLimited } = await resolveBoth<Quote>(reqs, quoteCacheKey,
      (symbols) => tdEodBatch(twelveDataKey, symbols),
      (symbols) => cgQuotes(symbols));
    return { quotes: values, failed, rateLimited };
  }

  async function performanceBatch(reqs: SymbolReq[]): Promise<PerformanceBatch> {
    const toBaselines = async (pending: Promise<Map<string, PricePoint[]>>) =>
      new Map([...await pending].map(([symbol, bars]) => [symbol, pickBaselines(bars)]));
    const { values, failed, rateLimited } = await resolveBoth<Performance>(reqs, performanceCacheKey,
      (symbols) => toBaselines(tdDailyHistory(twelveDataKey, symbols, historyStart(todayIso()))),
      (symbols) => toBaselines(cgDailyHistory(symbols)));
    return { performance: values, failed, rateLimited };
  }

  async function fx(): Promise<Fx> {
    const day = todayIso();
    const hit = (await cache.get<Fx>([FX_CACHE_KEY], day)).get(FX_CACHE_KEY);
    if (hit) return hit;
    const rate = await tdFx(twelveDataKey);
    await cache.put([{ key: FX_CACHE_KEY, value: rate }], day);
    return rate;
  }

  async function search(q: string): Promise<SearchResult[]> {
    const upper = q.trim().toUpperCase();
    const [equities, cryptos] = await Promise.allSettled([
      tdSymbolSearch(twelveDataKey, q),
      cgSearch(q),
    ]);
    if (equities.status === "rejected" && cryptos.status === "rejected") {
      throw new MarketError("UPSTREAM", "Search unavailable — try again");
    }
    const eq: SearchResult[] = equities.status === "fulfilled" ? equities.value : [];
    const cg: SearchResult[] = (cryptos.status === "fulfilled" ? cryptos.value : [])
      .map((h) => ({ ...h, type: "crypto" as const, currency: "USD" }));
    const exact = (r: SearchResult) => r.symbol === upper;
    // Interleave the two sources per tier so a fully-populated equity list can't
    // crowd out an exact crypto match (e.g. "BTC" returns a full page of equities).
    return [
      ...interleave(eq.filter(exact), cg.filter(exact)),
      ...interleave(eq.filter((r) => !exact(r)), cg.filter((r) => !exact(r))),
    ].slice(0, SEARCH_LIMIT);
  }

  return {
    quoteBatch,
    performanceBatch,
    search,
    fx,
    async quote(symbol, type) {
      const { quotes, failed, rateLimited } = await quoteBatch([{ symbol, type }]);
      if (rateLimited.length > 0) {
        throw new MarketError("RATE_LIMITED", "Rate limited — try again in a moment");
      }
      if (failed.length > 0 || !quotes[0]) {
        throw new MarketError("TICKER_NOT_FOUND", `No data for '${symbol.toUpperCase()}' — check the symbol`);
      }
      return quotes[0];
    },
  };
}
