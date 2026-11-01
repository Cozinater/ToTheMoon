import type { QuotableType } from "./schema.ts";

export type PricePoint = { date: string; close: number };

/** The latest close plus the two baseline closes a holding's YTD and year-on-year change are measured from. */
export type Baselines = { last: PricePoint; ytd: PricePoint | null; yoy: PricePoint | null };

export type Performance = Baselines & { symbol: string; type: QuotableType };
export type PerformanceBatch = { performance: Performance[]; failed: string[]; rateLimited: string[] };

export type PerformancePeriod = "ytd" | "yoy";

/**
 * How far past a target date the oldest bar may sit and still stand in for it. CoinGecko's
 * keyless API caps history at 365 days, so its oldest bar lands a day after "one year ago";
 * a week also covers a target that falls on a long market holiday.
 */
const BASELINE_GRACE_DAYS = 7;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The same calendar day one year earlier; 29 Feb falls back to 28 Feb. */
export function oneYearBefore(iso: string): string {
  const prior = `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
  return prior.endsWith("-02-29") ? prior.replace(/-29$/, "-28") : prior;
}

/**
 * Picks the latest close and the YTD / year-on-year baselines from a daily price history
 * (any order). Both baselines anchor on the latest bar's date, not the wall clock, so a
 * weekend or a stale feed never measures from the wrong day:
 *  - YTD measures from the last close of the previous calendar year.
 *  - Year-on-year measures from the last close on or before the same day a year earlier.
 * A baseline is null when the history doesn't reach back far enough (a recent listing).
 */
export function pickBaselines(bars: PricePoint[]): Baselines | null {
  if (bars.length === 0) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1]!;

  const atOrBefore = (target: string): PricePoint | null => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i]!.date <= target) return sorted[i]!;
    }
    const oldest = sorted[0]!;
    return oldest !== last && oldest.date <= addDays(target, BASELINE_GRACE_DAYS) ? oldest : null;
  };

  return {
    last,
    ytd: atOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`),
    yoy: atOrBefore(oneYearBefore(last.date)),
  };
}

/** Fractional change from the period's baseline to the latest close, or null without a usable baseline. */
export function periodChange(p: Baselines, period: PerformancePeriod): number | null {
  const base = p[period];
  if (!base || base.close <= 0) return null;
  return p.last.close / base.close - 1;
}

/**
 * The earliest date a price-history fetch must reach for `pickBaselines` to find both
 * baselines. The year-on-year target is never later than the YTD one (same year, a day
 * of the year at or before 31 Dec), so it alone sets the start. Ten days of slack covers
 * the latest bar trailing today (weekends, holidays, and early January, when the latest
 * bar can still sit in the old year and move the YTD target back a year).
 */
export function historyStart(today: string): string {
  return addDays(oneYearBefore(today), -10);
}
