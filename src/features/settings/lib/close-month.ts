import { addMonths } from "@/lib/month";

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

// A snapshot taken on the 1st usually describes the month that just ended, so the
// card offers that month alongside the date's own. Oldest first.
export const closeMonthOptions = (snapshotDate: string): [string, string] => {
  const own = monthOf(snapshotDate);
  return [addMonths(own, -1), own];
};

// The date's own month, unless it is already closed and the previous one is still
// open — the "1 Aug snapshot for July" case. With both closed there is nothing
// sensible to pick, so stay on the date's month and let the UI say so.
export function defaultCloseMonth(snapshotDate: string, closedMonths: string[]): string {
  const [previous, own] = closeMonthOptions(snapshotDate);
  return closedMonths.includes(own) && !closedMonths.includes(previous) ? previous : own;
}
