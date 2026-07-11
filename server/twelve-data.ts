import { MarketError, type Fx } from "./market.ts";

const BASE = "https://api.twelvedata.com";

type EodPayload = {
  symbol?: string; currency?: string; datetime?: string; close?: string;
  code?: number; status?: string; message?: string;
};

async function get(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, apikey: key });
  let res: Response;
  try { res = await fetch(`${BASE}${path}?${qs}`); }
  catch { throw new MarketError("UPSTREAM", "Twelve Data unreachable — try again"); }
  if (!res.ok) throw new MarketError("UPSTREAM", `Twelve Data error (HTTP ${res.status}) — try again`);
  return res.json();
}

function toQuote(p: EodPayload): { priceUsd: number; asOf: string } | null {
  if (p.status === "error" || !p.close || !p.datetime) return null;
  if (p.currency && p.currency !== "USD") return null; // only USD-quoted tickers supported
  return { priceUsd: Number(p.close), asOf: p.datetime };
}

/** One request for all symbols (1 credit each, one HTTP call — free tier is 8 credits/min). */
export async function tdEodBatch(key: string, symbols: string[]): Promise<Map<string, { priceUsd: number; asOf: string }>> {
  const upper = symbols.map((s) => s.toUpperCase());
  const body = await get("/eod", { symbol: upper.join(",") }, key) as Record<string, EodPayload> | EodPayload;
  const out = new Map<string, { priceUsd: number; asOf: string }>();
  if (upper.length === 1) {
    const q = toQuote(body as EodPayload);
    if (q) out.set(upper[0]!, q);
    return out;
  }
  for (const s of upper) {
    const q = toQuote((body as Record<string, EodPayload>)[s] ?? {});
    if (q) out.set(s, q);
  }
  return out;
}

export async function tdFx(key: string): Promise<Fx> {
  const body = await get("/exchange_rate", { symbol: "USD/SGD" }, key) as
    { rate?: number; timestamp?: number; status?: string; message?: string };
  if (body.status === "error" || typeof body.rate !== "number" || !body.timestamp) {
    throw new MarketError("UPSTREAM", body.message ?? "FX rate unavailable — try again");
  }
  return { pair: "USD/SGD", rate: body.rate, asOf: new Date(body.timestamp * 1000).toISOString().slice(0, 10) };
}

export type EquitySearchHit = {
  symbol: string; name: string; type: "stock" | "etf"; exchange: string; currency: string;
};

type SymbolSearchPayload = {
  data?: { symbol?: string; instrument_name?: string; instrument_type?: string;
    exchange?: string; currency?: string }[];
};

/** symbol_search is a credit-free utility endpoint on the free tier. */
export async function tdSymbolSearch(key: string, q: string): Promise<EquitySearchHit[]> {
  const body = await get("/symbol_search", { symbol: q, outputsize: "8" }, key) as SymbolSearchPayload;
  return (body.data ?? [])
    .filter((d) => d.symbol && d.instrument_name)
    .map((d) => ({
      symbol: d.symbol!.toUpperCase(),
      name: d.instrument_name!,
      type: d.instrument_type === "ETF" ? "etf" as const : "stock" as const,
      exchange: d.exchange ?? "",
      currency: d.currency ?? "USD",
    }));
}
