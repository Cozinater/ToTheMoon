import type { AssetType } from "../shared/schema.ts";
import { cgQuotes } from "./coingecko.ts";
import { tdEodBatch, tdFx } from "./twelve-data.ts";

export type Quote = { symbol: string; type: AssetType; priceUsd: number; asOf: string };
export type Fx = { pair: "USD/SGD"; rate: number; asOf: string };

export class MarketError extends Error {
  constructor(public code: "TICKER_NOT_FOUND" | "UPSTREAM", message: string) { super(message); }
}

export interface MarketClient {
  quote(symbol: string, type: AssetType): Promise<Quote>;
  quoteBatch(reqs: { symbol: string; type: AssetType }[]): Promise<{ quotes: Quote[]; failed: string[] }>;
  fx(): Promise<Fx>;
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

  return {
    quoteBatch,
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
