import type { Holding } from "@shared/schema";
import { isCash } from "./cash";

export const UNASSIGNED = "Unassigned";

export type StrategySlice = {
  label: string;
  valueUsd: number;
  share: number;      // 0–1 fraction of the portfolio's INVESTED USD value
  colorIndex: number; // position in the Settings list; -1 for unknown/unassigned
};

/**
 * Groups invested holdings by strategy and returns each group's share of total
 * invested USD value, heaviest first. Holdings without a strategy collapse into
 * "Unassigned" so the shares always add up to 100% of invested value.
 *
 * Cash is filtered out here rather than by callers: it is dry powder, not an
 * allocation, and letting it through would both invent an "Unassigned" slice and
 * shrink every real strategy's share. Filtering on type (not on the absence of a
 * strategy) also means a stray strategy on a cash line is ignored rather than
 * silently counted. The portfolio's cash share is a separate number — see
 * `splitCash` and `StrategyMixBar`.
 */
export function strategyMix(holdings: Holding[], strategies: string[] = []): StrategySlice[] {
  const invested = holdings.filter((h) => !isCash(h));
  const total = invested.reduce((acc, h) => acc + h.valueUsd, 0);
  if (total <= 0) return [];

  const byStrategy = new Map<string, number>();
  for (const h of invested) {
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
