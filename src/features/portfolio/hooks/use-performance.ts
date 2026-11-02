import { useQuery } from "@tanstack/react-query";
import type { PerformanceBatch } from "@shared/performance";
import { api } from "@/lib/api";
import type { InstrumentHolding } from "../lib/cash";

/** Twelve Data's free tier refills its per-minute credits after a minute; retry just past that. */
const RATE_LIMIT_RETRY_MS = 65_000;

/**
 * Price history (latest close plus YTD / year-on-year baselines) for every invested holding.
 * The server caches it per day, so refetching is cheap. While some symbols are still
 * rate-limited the query polls once a minute, and each poll fills in more of the map.
 */
export function usePerformance(holdings: InstrumentHolding[]) {
  const symbols = [...new Set(holdings.map((h) => `${h.ticker.toUpperCase()}:${h.type}`))].sort().join(",");
  return useQuery({
    queryKey: ["performance", symbols],
    queryFn: () => api<PerformanceBatch>(`/api/performance?symbols=${encodeURIComponent(symbols)}`),
    enabled: symbols !== "",
    staleTime: 30 * 60_000,
    refetchInterval: (query) => (query.state.data?.rateLimited.length ? RATE_LIMIT_RETRY_MS : false),
  });
}
