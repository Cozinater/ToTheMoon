import type { QuotableType } from "@shared/schema";

export type Quote = { symbol: string; type: QuotableType; priceUsd: number; asOf: string };
export type QuoteBatch = { quotes: Quote[]; failed: string[]; rateLimited: string[] };
export type FxResponse = { pair: "USD/SGD"; rate: number; asOf: string };
export type SearchResult = { symbol: string; name: string; type: QuotableType; exchange?: string; currency: string };
export type SearchResponse = { results: SearchResult[] };
