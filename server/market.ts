import type { AssetType } from "../shared/schema.ts";
import { cgQuotes, cgSearch } from "./coingecko.ts";
import { tdEodBatch, tdFx, tdSymbolSearch } from "./twelve-data.ts";

export type Quote = { symbol: string; type: AssetType; priceUsd: number; asOf: string };
export type Fx = { pair: "USD/SGD"; rate: number; asOf: string };
export type SearchResult = {
  symbol: string; name: string; type: AssetType; exchange?: string; currency: string;
};

export class MarketError extends Error {
  constructor(public code: "TICKER_NOT_FOUND" | "UPSTREAM", message: string) { super(message); }
}

export interface MarketClient {
  quote(symbol: string, type: AssetType): Promise<Quote>;
  quoteBatch(reqs: { symbol: string; type: AssetType }[]): Promise<{ quotes: Quote[]; failed: string[] }>;
  fx(): Promise<Fx>;
  search(q: string): Promise<SearchResult[]>;
}

export function createMarketClient({ twelveDataKey }: { twelveDataKey: string }): MarketClient {
  async function quoteBatch(reqs: { symbol: string; type: AssetType }[]) {
    const quotes: Quote[] = [];
    const failed: string[] = [];
    const equities = reqs.filter((r) => r.type !== "crypto");
    const cryptos = reqs.filter((r) => r.type === "crypto");

    if (equities.length > 0) {
      const bySymbol = await tdEodBatch(twelveDataKey, equities.map((r) => r.symbol));
      for (const r of equities) {
        const hit = bySymbol.get(r.symbol.toUpperCase());
        if (hit) quotes.push({ symbol: r.symbol.toUpperCase(), type: r.type, ...hit });
        else failed.push(r.symbol.toUpperCase());
      }
    }
    if (cryptos.length > 0) {
      const bySymbol = await cgQuotes(cryptos.map((r) => r.symbol));
      for (const r of cryptos) {
        const hit = bySymbol.get(r.symbol.toUpperCase());
        if (hit) quotes.push({ symbol: r.symbol.toUpperCase(), type: "crypto", ...hit });
        else failed.push(r.symbol.toUpperCase());
      }
    }
    return { quotes, failed };
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
    return [
      ...eq.filter(exact), ...cg.filter(exact),
      ...eq.filter((r) => !exact(r)), ...cg.filter((r) => !exact(r)),
    ].slice(0, 8);
  }

  return {
    quoteBatch,
    search,
    async quote(symbol, type) {
      const { quotes, failed } = await quoteBatch([{ symbol, type }]);
      if (failed.length > 0 || !quotes[0]) {
        throw new MarketError("TICKER_NOT_FOUND", `No data for '${symbol.toUpperCase()}' — check the symbol`);
      }
      return quotes[0];
    },
    fx: () => tdFx(twelveDataKey),
  };
}
