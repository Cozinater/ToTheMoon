import { quotableTypeSchema, type Holding, type QuotableType } from "../shared/schema.ts";
import { DynamoDayCache } from "./dynamo-cache.ts";
import { DynamoStore } from "./dynamo-store.ts";
import { createMarketClient, type MarketClient } from "./market.ts";
import type { SnapshotStore } from "./store.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PrefetchResult = { rounds: number; resolved: number; pending: number };

/**
 * Cash has no market price — never hand it to `quoteBatch`. Identical predicate to
 * the client-side `isInstrument` in `src/features/portfolio/lib/cash.ts`; kept as a
 * separate copy (not hoisted to `shared/`) because the server cannot import from
 * `src/`, but named the same so the duplication reads as intentional. Both copies
 * ask `quotableTypeSchema` rather than testing for `"cash"`, so the two tiers cannot
 * drift apart when a new AssetType lands.
 */
function isInstrument(h: Holding): h is Holding & { type: QuotableType } {
  return quotableTypeSchema.safeParse(h.type).success;
}

/**
 * Warm the day cache for every holding ahead of the user opening the app.
 *
 * Each round calls `quoteBatch`, which serves already-cached symbols for free and
 * fetches up to the per-minute cap of the rest — so repeated rounds fill the cache
 * incrementally. The heatmap's price history (`performanceBatch`) is warmed the same
 * way once the quotes are done. Between rounds we wait out Twelve Data's per-minute credit window,
 * letting a large portfolio load overnight without ever tripping a 429. The daily
 * FX rate is warmed too. Meant to run once daily after the US market close; the
 * manual "Refresh prices" button remains the fallback for stragglers.
 */
export async function prefetchQuotes(
  store: SnapshotStore,
  market: MarketClient,
  opts: { wait?: (ms: number) => Promise<void>; sleepMs?: number; maxRounds?: number } = {},
): Promise<PrefetchResult> {
  const wait = opts.wait ?? sleep;
  const sleepMs = opts.sleepMs ?? 60_000;
  const maxRounds = opts.maxRounds ?? 30;

  const draft = await store.getDraft();
  const all = (draft?.holdings ?? [])
    .filter(isInstrument)
    .map((h) => ({ symbol: h.ticker, type: h.type }));

  let rounds = 0;
  /** Repeats `fetchBatch` until nothing is rate-limited, waiting out the credit window between rounds. */
  async function drain(fetchBatch: typeof market.quoteBatch | typeof market.performanceBatch) {
    let remaining = all;
    while (remaining.length > 0 && rounds < maxRounds) {
      if (rounds > 0) await wait(sleepMs); // respect the per-minute credit window between rounds
      rounds++;
      const { rateLimited } = await fetchBatch(remaining);
      const stillLimited = new Set(rateLimited);
      // Drop everything that resolved or hard-failed (bad ticker); only rate-limited symbols retry.
      remaining = remaining.filter((r) => stillLimited.has(r.symbol.toUpperCase()));
    }
    return remaining.length;
  }

  const pending = await drain(market.quoteBatch);
  // The portfolio heatmap's YTD / year-on-year baselines, warmed after the prices that matter more.
  await drain(market.performanceBatch);

  await market.fx(); // warm the daily FX rate as well
  return { rounds, resolved: all.length - pending, pending };
}

/** EventBridge-triggered Lambda entry point (no HTTP event; see infra/prefetch.tf). */
export const handler = async (): Promise<PrefetchResult> => {
  const table = process.env.TABLE_NAME ?? "tothemoon";
  const store = new DynamoStore(table);
  const cache = new DynamoDayCache(table);
  const market = createMarketClient({ twelveDataKey: process.env.TWELVE_DATA_API_KEY ?? "", cache });
  const result = await prefetchQuotes(store, market);
  console.log("[prefetch]", JSON.stringify(result));
  return result;
};
