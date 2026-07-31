import type { Holding, QuotableType } from "@shared/schema";

/** Cash lines are dry powder, not an instrument — no ticker to quote, no strategy. */
export const isCash = (h: Holding) => h.type === "cash";

/** A holding that has a real market price — i.e. anything that is not cash. */
export type InstrumentHolding = Holding & { type: QuotableType };

/** Narrowing counterpart to `isCash`, so instrument-only code paths stay type-safe. */
export const isInstrument = (h: Holding): h is InstrumentHolding => h.type !== "cash";
