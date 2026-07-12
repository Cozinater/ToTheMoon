import { useDraft } from "@/hooks/use-draft";
import { useSnapshots } from "@/hooks/use-snapshots";
import { monthLabel } from "@/lib/format";
import type { Totals } from "@shared/schema";
import { computeTotals } from "@shared/totals";

export type ChartPoint = {
  month: string | null;                    // snapshot "YYYY-MM"; null for the live "Now" point
  label: string;
  portfolio: number; savings: number; cpf: number; property: number;
  creditCards: number; loans: number;      // stored negative for the chart
  netWorth: number;
};

const toPoint = (month: string | null, label: string, t: Totals): ChartPoint => ({
  month, label,
  portfolio: t.portfolioSgd, savings: t.savingsSgd, cpf: t.cpfSgd, property: t.propertySgd,
  creditCards: -t.creditCardsSgd, loans: -t.loansSgd,
  netWorth: t.netWorthSgd,
});

export function useDashboardData() {
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

  const delta = totals && latest
    ? {
        amount: totals.netWorthSgd - latest.totals.netWorthSgd,
        fraction: latest.totals.netWorthSgd !== 0
          ? (totals.netWorthSgd - latest.totals.netWorthSgd) / Math.abs(latest.totals.netWorthSgd)
          : null,
        vs: monthLabel(latest.month),
      }
    : null;

  return {
    isPending: draft.isPending || snapshots.isPending,
    isError: draft.isError || snapshots.isError,
    refetch: () => { void draft.refetch(); void snapshots.refetch(); },
    draft: draft.data,
    totals, fxRate, fxMissing, points, delta,
  };
}
