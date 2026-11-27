import type { IncomeEntry } from "@shared/schema";

export type IncomeRow = IncomeEntry & { changePct: number | null };

export type IncomeSummary = {
  first: IncomeEntry;
  latest: IncomeEntry;
  totalGrowthPct: number | null;
  /** Compound yearly growth; null under a year of history, where it would mislead. */
  annualisedPct: number | null;
};

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY_MS;

const byDate = (entries: IncomeEntry[]) => [...entries].sort((a, b) => a.date.localeCompare(b.date));

/** Oldest first, each row with its change against the row before it. */
export function withChanges(entries: IncomeEntry[]): IncomeRow[] {
  return byDate(entries).map((e, i, sorted) => ({
    ...e,
    changePct: i === 0 ? null : e.amountSgd / sorted[i - 1].amountSgd - 1,
  }));
}

export function incomeSummary(entries: IncomeEntry[]): IncomeSummary | null {
  const sorted = byDate(entries);
  if (sorted.length === 0) return null;
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  if (sorted.length === 1) return { first, latest, totalGrowthPct: null, annualisedPct: null };
  const ratio = latest.amountSgd / first.amountSgd;
  const years = daysBetween(first.date, latest.date) / 365.25;
  return {
    first,
    latest,
    totalGrowthPct: ratio - 1,
    annualisedPct: years >= 1 ? ratio ** (1 / years) - 1 : null,
  };
}
