import type { Totals } from "@shared/schema";

export type SeriesKey = "portfolio" | "savings" | "cpf" | "property" | "creditCards" | "loans";

// Stack order matters: recharts stacks in render order, assets up and liabilities down.
export const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "var(--chart-1)", stack: "pos" },
  { key: "savings", label: "Savings", color: "var(--chart-2)", stack: "pos" },
  { key: "cpf", label: "CPF", color: "var(--chart-3)", stack: "pos" },
  { key: "property", label: "Property", color: "var(--chart-4)", stack: "pos" },
  { key: "creditCards", label: "Credit Cards", color: "var(--chart-5)", stack: "neg" },
  { key: "loans", label: "Loans", color: "var(--chart-6)", stack: "neg" },
] as const satisfies readonly { key: SeriesKey; label: string; color: string; stack: "pos" | "neg" }[];

const isSeriesKey = (v: unknown): v is SeriesKey =>
  typeof v === "string" && SERIES.some((s) => s.key === v);

// Anything we can't make sense of means "nothing hidden" — a corrupt value must never
// blank the chart.
export function parseHiddenSeries(raw: string | null): SeriesKey[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter(isSeriesKey))];
}

export const serializeHiddenSeries = (hidden: SeriesKey[]): string => JSON.stringify(hidden);

export const toggleSeries = (hidden: SeriesKey[], key: SeriesKey): SeriesKey[] =>
  hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];

// The six chart terms of a Totals, with liabilities negated so they stack downwards.
export const seriesValues = (t: Totals): Record<SeriesKey, number> => ({
  portfolio: t.portfolioSgd, savings: t.savingsSgd, cpf: t.cpfSgd, property: t.propertySgd,
  creditCards: -t.creditCardsSgd, loans: -t.loansSgd,
});

// Liabilities are already negated on the chart point, so summing is enough.
export const visibleTotal = (point: Record<SeriesKey, number>, hidden: SeriesKey[]): number =>
  SERIES.reduce((sum, s) => (hidden.includes(s.key) ? sum : sum + point[s.key]), 0);

// Net worth as the dashboard shows it: only the categories left visible on the chart.
// With nothing hidden this equals Totals.netWorthSgd.
export const visibleNetWorth = (t: Totals, hidden: SeriesKey[]): number =>
  visibleTotal(seriesValues(t), hidden);

export const netWorthDelta = (current: number, previous: number) => ({
  amount: current - previous,
  fraction: previous !== 0 ? (current - previous) / Math.abs(previous) : null,
});
