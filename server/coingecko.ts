import { MarketError, SEARCH_LIMIT } from "./market.ts";

const BASE = "https://api.coingecko.com/api/v3";

async function get(path: string): Promise<unknown> {
  let res: Response;
  try { res = await fetch(`${BASE}${path}`); }
  catch { throw new MarketError("UPSTREAM", "CoinGecko unreachable — try again"); }
  if (!res.ok) throw new MarketError("UPSTREAM", `CoinGecko error (HTTP ${res.status}) — try again`);
  return res.json();
}

async function resolveId(symbol: string): Promise<string | null> {
  const body = await get(`/search?query=${encodeURIComponent(symbol)}`) as
    { coins: { id: string; symbol: string }[] };
  return body.coins.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase())?.id ?? null;
}

/** Resolves each symbol via /search, then one /simple/price call for all of them. */
export async function cgQuotes(symbols: string[]): Promise<Map<string, { priceUsd: number; asOf: string }>> {
  const out = new Map<string, { priceUsd: number; asOf: string }>();
  const ids = new Map<string, string>(); // symbol (upper) → coingecko id
  const resolved = await Promise.all(symbols.map(async (s) => [s, await resolveId(s)] as const));
  for (const [s, id] of resolved) {
    if (id) ids.set(s.toUpperCase(), id);
  }
  if (ids.size === 0) return out;
  const prices = await get(`/simple/price?ids=${[...ids.values()].join(",")}&vs_currencies=usd`) as
    Record<string, { usd?: number }>;
  const today = new Date().toISOString().slice(0, 10);
  for (const [symbol, id] of ids) {
    const usd = prices[id]?.usd;
    if (typeof usd === "number") out.set(symbol, { priceUsd: usd, asOf: today });
  }
  return out;
}

export type CryptoSearchHit = { symbol: string; name: string };

export async function cgSearch(q: string): Promise<CryptoSearchHit[]> {
  const body = await get(`/search?query=${encodeURIComponent(q)}`) as
    { coins?: { symbol: string; name: string }[] };
  return (body.coins ?? []).slice(0, SEARCH_LIMIT).map((c) => ({ symbol: c.symbol.toUpperCase(), name: c.name }));
}
