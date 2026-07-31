import type { Holding, QuotableType } from "@shared/schema";
import { round2 } from "@shared/totals";

/** Cash lines are dry powder, not an instrument — no ticker to quote, no strategy. */
export const isCash = (h: Holding) => h.type === "cash";

/** A holding that has a real market price — i.e. anything that is not cash. */
export type InstrumentHolding = Holding & { type: QuotableType };

/** Narrowing counterpart to `isCash`, so instrument-only code paths stay type-safe. */
export const isInstrument = (h: Holding): h is InstrumentHolding => h.type !== "cash";

export type CashSplit = {
  invested: Holding[];
  cash: Holding[];
  investedUsd: number;
  cashUsd: number;
};

/**
 * Partitions holdings into invested positions and cash lines, with each side's USD
 * total. Both totals are rounded to cents the same way `computeTotals` rounds the
 * portfolio, so the two never disagree by a fraction of a cent.
 */
export function splitCash(holdings: Holding[]): CashSplit {
  const invested: Holding[] = [];
  const cash: Holding[] = [];
  for (const h of holdings) (isCash(h) ? cash : invested).push(h);
  const total = (hs: Holding[]) => round2(hs.reduce((acc, h) => acc + h.valueUsd, 0));
  return { invested, cash, investedUsd: total(invested), cashUsd: total(cash) };
}
