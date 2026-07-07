import type { AssetType } from "@shared/schema";

export type Quote = { symbol: string; type: AssetType; priceUsd: number; asOf: string };
export type QuoteBatch = { quotes: Quote[]; failed: string[] };
export type FxResponse = { pair: "USD/SGD"; rate: number; asOf: string };
