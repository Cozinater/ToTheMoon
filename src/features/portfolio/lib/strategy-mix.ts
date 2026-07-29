import type { Holding } from "@shared/schema";

export const UNASSIGNED = "Unassigned";

export type StrategySlice = {
  label: string;
  valueUsd: number;
  share: number;      // 0–1 fraction of the portfolio's USD value
  colorIndex: number; // position in the Settings list; -1 for unknown/unassigned
};

/**
 * Groups holdings by strategy and returns each group's share of total USD value,
 * heaviest first. Holdings without a strategy collapse into "Unassigned" so the
 * shares always add up to 100%.
 */
export function strategyMix(holdings: Holding[], strategies: string[] = []): StrategySlice[] {
  const total = holdings.reduce((acc, h) => acc + h.valueUsd, 0);
  if (total <= 0) return [];

  const byStrategy = new Map<string, number>();
  for (const h of holdings) {
    const label = h.strategy ?? UNASSIGNED;
    byStrategy.set(label, (byStrategy.get(label) ?? 0) + h.valueUsd);
  }

  return [...byStrategy]
    .map(([label, valueUsd]) => ({
      label,
      valueUsd,
      share: valueUsd / total,
      colorIndex: strategies.indexOf(label),
    }))
    .sort((a, b) => b.share - a.share || a.label.localeCompare(b.label));
}
