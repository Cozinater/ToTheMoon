import type { QuotableType } from "../shared/schema.ts";
import { cgQuotes, cgSearch } from "./coingecko.ts";
import { MemoryDayCache, type DayCache } from "./quote-cache.ts";
import { tdEodBatch, tdFx, tdSymbolSearch } from "./twelve-data.ts";

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

export interface MarketClient {
  quote(symbol: string, type: QuotableType): Promise<Quote>;
  quoteBatch(reqs: { symbol: string; type: QuotableType }[]): Promise<QuoteBatchResult>;
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
   */
  async function resolve(
    reqs: { symbol: string; type: QuotableType }[],
    day: string,
    cap: number,
    fetchFresh: (symbols: string[]) => Promise<Map<string, { priceUsd: number; asOf: string }>>,
  ): Promise<QuoteBatchResult> {
    const quotes: Quote[] = [];
    const failed: string[] = [];
    const rateLimited: string[] = [];
    if (reqs.length === 0) return { quotes, failed, rateLimited };

    const cached = await cache.get<Quote>(reqs.map((r) => quoteCacheKey(r.symbol, r.type)), day);
    const uncached: { symbol: string; type: QuotableType }[] = [];
    for (const r of reqs) {
      const hit = cached.get(quoteCacheKey(r.symbol, r.type));
      if (hit) quotes.push(hit);
      else uncached.push(r);
    }

    const toFetch = uncached.slice(0, cap);
    rateLimited.push(...uncached.slice(cap).map((r) => r.symbol.toUpperCase()));
    if (toFetch.length > 0) {
      try {
        const bySymbol = await fetchFresh(toFetch.map((r) => r.symbol));
        const fresh: Quote[] = [];
        for (const r of toFetch) {
          const hit = bySymbol.get(r.symbol.toUpperCase());
          if (hit) {
            const q: Quote = { symbol: r.symbol.toUpperCase(), type: r.type, ...hit };
            quotes.push(q);
            fresh.push(q);
          } else failed.push(r.symbol.toUpperCase());
        }
        if (fresh.length > 0) {
          await cache.put(fresh.map((q) => ({ key: quoteCacheKey(q.symbol, q.type), value: q })), day);
        }
      } catch (err) {
        if (err instanceof MarketError && err.code === "RATE_LIMITED") {
          rateLimited.push(...toFetch.map((r) => r.symbol.toUpperCase()));
        } else throw err;
      }
    }
    return { quotes, failed, rateLimited };
  }

  async function quoteBatch(reqs: { symbol: string; type: QuotableType }[]): Promise<QuoteBatchResult> {
    const day = todayIso();
    // Crypto (CoinGecko) is a separate provider with its own limits, so it is resolved
    // independently — an equity rate-limit no longer wipes out the crypto prices too.
    const equities = await resolve(
      reqs.filter((r) => r.type !== "crypto"), day, EQUITY_PER_MIN_CAP,
      (symbols) => tdEodBatch(twelveDataKey, symbols));
    const cryptos = await resolve(
      reqs.filter((r) => r.type === "crypto"), day, Infinity,
      (symbols) => cgQuotes(symbols));
    return {
      quotes: [...equities.quotes, ...cryptos.quotes],
      failed: [...equities.failed, ...cryptos.failed],
      rateLimited: [...equities.rateLimited, ...cryptos.rateLimited],
    };
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
