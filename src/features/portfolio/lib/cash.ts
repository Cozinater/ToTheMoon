import { quotableTypeSchema, type Holding, type QuotableType } from "@shared/schema";
import { round2 } from "@shared/totals";

/** Cash lines are dry powder, not an instrument — no ticker to quote, no strategy. */
export const isCash = (h: Holding) => h.type === "cash";

/** A holding that has a real market price — i.e. anything that is not cash. */
export type InstrumentHolding = Holding & { type: QuotableType };

/**
 * Narrowing counterpart to `isCash`, so instrument-only code paths stay type-safe.
 * The rule lives in `quotableTypeSchema`, not in a `!== "cash"` literal here: if a
 * future AssetType is added that no provider can price, it stays out of the quote
 * paths automatically instead of silently widening them.
 */
export const isInstrument = (h: Holding): h is InstrumentHolding =>
  quotableTypeSchema.safeParse(h.type).success;

export type CashSplit = {
  invested: InstrumentHolding[];
  cash: Holding[];
  investedUsd: number;
  cashUsd: number;
};

/**
 * Partitions holdings into invested positions and cash lines, with each side's USD
 * total. Each side is rounded to cents with `round2`, the same helper `computeTotals`
 * uses on the portfolio — note that rounding the halves and adding them is not in
 * general identical to rounding the sum, so treat `investedUsd + cashUsd` as a
 * display figure rather than as a re-derivation of the portfolio total. In practice
 * they always agree, because every save path already writes 2dp `valueUsd` values.
 */
export function splitCash(holdings: Holding[]): CashSplit {
  const invested: InstrumentHolding[] = [];
  const cash: Holding[] = [];
  // Partition on `isInstrument` so its narrowing reaches `invested` — that array is
  // what builds the /api/quote symbol list, and cash must not typecheck into it.
  for (const h of holdings) {
    if (isInstrument(h)) invested.push(h);
    else cash.push(h);
  }
  const total = (hs: Holding[]) => round2(hs.reduce((acc, h) => acc + h.valueUsd, 0));
  return { invested, cash, investedUsd: total(invested), cashUsd: total(cash) };
}
