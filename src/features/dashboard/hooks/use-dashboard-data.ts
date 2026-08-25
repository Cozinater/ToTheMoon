import { useDraft } from "@/hooks/use-draft";
import { useSnapshots } from "@/hooks/use-snapshots";
import { monthLabel } from "@/lib/format";
import type { Totals } from "@shared/schema";
import { computeTotals } from "@shared/totals";
import { netWorthDelta, seriesValues, visibleNetWorth, type SeriesKey } from "../lib/chart-series";

export type ChartPoint = Record<SeriesKey, number> & {
  month: string | null;                    // snapshot "YYYY-MM"; null for the live "Now" point
  label: string;
};

const toPoint = (month: string | null, label: string, t: Totals): ChartPoint =>
  ({ month, label, ...seriesValues(t) });

// `hidden` is the chart's legend selection: the headline figure and its delta follow
// it, so the hero always totals exactly what the chart is plotting.
export function useDashboardData(hidden: SeriesKey[] = []) {
  const draft = useDraft();
  const snapshots = useSnapshots();

  const latest = snapshots.data?.[0];
  const fxRate = draft.data?.fxRate ?? latest?.fxRate;
  const fxMissing = fxRate == null && (draft.data?.holdings.length ?? 0) > 0;
  const totals = draft.data ? computeTotals(draft.data, fxRate ?? 1) : undefined;

  const points: ChartPoint[] = [...(snapshots.data ?? [])]
    .reverse()
    .map((s) => toPoint(s.month, monthLabel(s.month), s.totals));
  if (totals) points.push(toPoint(null, "Now", totals));

  const netWorth = totals ? visibleNetWorth(totals, hidden) : undefined;
  const delta = netWorth != null && latest
    ? { ...netWorthDelta(netWorth, visibleNetWorth(latest.totals, hidden)), vs: monthLabel(latest.month) }
    : null;

  return {
    isPending: draft.isPending || snapshots.isPending,
    isError: draft.isError || snapshots.isError,
    refetch: () => { void draft.refetch(); void snapshots.refetch(); },
    draft: draft.data,
    totals, netWorth, fxRate, fxMissing, points, delta,
  };
}
