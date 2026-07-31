# Portfolio "Cash" asset type — design

**Date:** 2026-07-29
**Status:** Approved (pending spec review)

## Goal

Let the portfolio hold **cash** — readily deployable USD sitting in a brokerage account —
alongside stocks, ETFs and crypto. Cash is a fourth `AssetType`, so it rides the existing
holdings table, portfolio total, net worth and monthly snapshots with no new plumbing. But the
portfolio *page* treats it as **dry powder**, not as an allocation: strategy percentages
denominate on invested value only, and cash gets its own chip outside the strategy set.

## Key architectural facts (why this shape)

- `portfolioUsd` is simply the sum of `holdings[].valueUsd` (`shared/totals.ts`), so anything
  stored as a holding flows into the portfolio total *and* net worth for free.
- Holdings are one wholesale draft document (`GET`/`PUT /api/draft`) and are embedded verbatim in
  monthly snapshots via `holdingSchema`. Reusing `Holding` for cash means `snapshotSchema`,
  `amendInputSchema`, the store and every store backend need **zero** changes.
- `HoldingsTable` is reused by History (`snapshot-detail.tsx`) and the amend dialog; `HoldingForm`
  is reused by the amend dialog. Changes to either propagate to those surfaces automatically.
- `assetTypeSchema` is used server-side to validate the `type` query param on `/api/quote`
  (`server/app.ts`, both the single and `symbols=` batch paths). Widening the enum without a
  guard would silently start accepting `type=cash` and hand it to a price provider.
- The strategy mix bar (`strategy-mix.ts`) divides by total holdings value and buckets
  strategy-less rows into "Unassigned". Left alone, cash would appear as a large Unassigned
  slice and dilute every strategy percentage.

## Decisions

- **Type:** `"cash"` added to `assetTypeSchema`. No new schema object, no new store record.
- **Currency:** **USD only.** `priceUsd` is always `1`; `quantity` and `valueUsd` both hold the
  USD amount. This matches the app's existing USD-portfolio invariant (instrument search already
  rejects non-USD listings).
- **Cardinality:** several cash lines, each with a short free-text label reusing the existing
  `ticker` field and its 12-char cap (e.g. `IBKR USD`, `Tiger`, `Settling`). Add/edit/delete work
  exactly as they do for holdings.
- **No strategy on cash.** The cash form has no strategy select and saves `strategy: undefined`.
- **Entry path:** one "Add Holding" button as today. The form opens with a segmented
  `Instrument | Cash` toggle; picking Cash swaps the instrument search + quote box for
  label + amount.
- **Header total includes cash** — it is the portfolio total, and net worth already counts it.
- **Table `%` column is share of total** (including cash), so the column reconciles with the
  header number.
- **Strategy shares denominate on invested value only.** The cash chip is `cash ÷ total`. The two
  denominators differ deliberately — see "Dry powder bar" below.

## Scope boundaries (YAGNI)

- No non-USD cash. No per-line currency field, no FX lookup for cash.
- No strategy assignment for cash ("dry powder earmarked for China").
- No cash interest / yield tracking, and no cash-drag chart.
- No `priceUsd === 1` refinement on the schema — it over-constrains and would block a future
  multi-currency story.
- No `cashUsd` field on `totalsSchema`. Its fields are all required, so adding one would fail to
  parse every already-closed snapshot. The split is **derived** from `holdings` where needed.
- No conversion between cash and instrument holdings when editing — mode is fixed by
  `initial.type`.

## Changes by layer

### 1. Shared schema — `shared/schema.ts`

```ts
export const assetTypeSchema = z.enum(["stock", "etf", "crypto", "cash"]);
export type AssetType = z.infer<typeof assetTypeSchema>;

/** Types a price provider can quote — cash has no market price. */
export const quotableTypeSchema = assetTypeSchema.exclude(["cash"]);
export type QuotableType = z.infer<typeof quotableTypeSchema>;
```

`holdingSchema` is unchanged. A cash holding satisfies every existing constraint:
`ticker` (1–12 chars) is the label, `quantity` positive, `priceUsd` = 1, `valueUsd` = amount.

### 2. New lib — `src/features/portfolio/lib/cash.ts`

```ts
export const isCash = (h: Holding) => h.type === "cash";

/** Splits holdings into invested positions and cash lines, with each side's USD total. */
export function splitCash(holdings: Holding[]): {
  invested: Holding[]; cash: Holding[]; investedUsd: number; cashUsd: number;
};
```

Both sums use `round2` from `shared/totals.ts`, matching how `computeTotals` rounds.

### 3. Strategy mix — `src/features/portfolio/lib/strategy-mix.ts`

- Filter cash out **inside** `strategyMix()` so no caller can forget it.
- Update the doc comment: shares are now a fraction of **invested** USD value, and they sum to
  100% of invested value (not of the portfolio).
- Existing early return (`total <= 0` → `[]`) already handles a cash-only portfolio.

### 4. Dry powder bar — `src/features/portfolio/components/strategy-mix-bar.tsx`

```
PORTFOLIO (USD)
$128,400.00
7 invested | LONG TERM 41% | CHINA 27% | SPEC 14% │ CASH 17.9%
```

- The count is **invested-only** (cash is represented by its own chip), so it is labelled
  `invested`, not `holdings`. The two whole-portfolio counts elsewhere — the dashboard draft card
  and Settings → Close month — keep saying `holdings`, because they really do count every row.
- After the strategy slices, render a cash chip when `cashUsd > 0`: label `CASH`, value
  `cashUsd / (investedUsd + cashUsd)`. It reuses the slice markup (same uppercase tracked label,
  same `tabular-nums text-foreground` value) but is styled outside the strategy palette:
  - label class `text-foreground/70` — off the strategy palette (never a `text-chart-*` token),
    but deliberately brighter than the `NEUTRAL` `text-muted-foreground` tint that
    `strategy-tint.ts` gives the "Unassigned" slice, since that chip sits right next to it and is
    measured on a different denominator;
  - its leading divider is a drawn rule (`h-3 w-px bg-border`), not a text glyph, and it renders
    at **all** widths rather than the slices' `hidden sm:inline` — below `sm` it is the only thing
    keeping `UNASSIGNED 20%` and `CASH 17%` apart. The slice dividers keep their `|` behaviour
    (dividers only appear once the row fits on one line).
- The cash chip renders even when `mix` is empty, so a cash-only portfolio still shows it.
- The mixed denominators are intentional: *"of my invested money 41% is Long Term, and 17.9% of
  the portfolio is dry powder."* The chips are not meant to sum to 100% across the divider.
- Cash-only portfolio: `strategyMix` returns `[]`, bar reads `0 invested │ CASH 100%`.

### 5. Holdings table — `src/features/portfolio/components/holdings-table.tsx`

- `TYPE_TABS` gains `{ value: "cash", label: "Cash" }`.
- `quantity` and `priceUsd` cells render `—` for cash rows (`23,000 × $1.00` is noise).
- `%` column unchanged (share of total, including cash).
- Sorting, global filter, `colSpan` and the `readOnly` path are untouched — History detail and
  the amend dialog inherit all of the above.

### 6. Add/edit form — split into three files

`holding-form.tsx` already carries quote state, FX and strategy defaults in ~190 lines. Branching
inline would make it worse, so it splits:

- **`holding-form.tsx`** — shell only: `ResponsiveModal`, the segmented `Instrument | Cash`
  toggle, and delegation to one body. On edit the mode is fixed by `initial.type` and the toggle
  is hidden. Title stays `Add holding` / `Edit <ticker>`. The modal description switches with the
  mode (instrument: today's copy; cash: something like "Record deployable cash in your brokerage
  account.").
  The toggle is built from two `Button`s using the same active/inactive pattern as the table's
  type tabs (`variant={active ? "secondary" : "ghost"}`, `size="sm"`) — **no new shadcn
  primitive**. There is no `tabs` or `toggle-group` under `src/components/ui/`, and adding one
  would mean invoking the shadcn CLI for what two buttons already express.
- **`instrument-fields.tsx`** — today's behaviour lifted verbatim: `InstrumentCombobox`,
  quantity, as-of, strategy select, quote/FX fetch and the price preview box.
- **`cash-fields.tsx`** — label (`Input`, max 12), amount in USD, as-of `DatePicker`, and the
  hint *"Brokerage cash only — bank balances belong under Assets."* which guards against
  double-counting against Assets → Bank savings. No quote box, no FX call, no strategy select.

Both bodies own their own state and call the same `onSave(holding, fxRate?)` signature, so
`amend-dialog.tsx` needs no changes and gains cash editing for free. The cash body saves
`{ ticker: label, type: "cash", quantity: amount, priceUsd: 1, valueUsd: amount, asOf }`
with no `strategy`, and calls `onSave` with no `fxRate`.

Save is enabled when the label is non-empty, the amount is finite and > 0, and as-of is set.

### 7. Refresh prices — `src/routes/portfolio.tsx`

- Filter cash out before building the `symbols` string, so cash can never appear in the
  "Couldn't refresh" or rate-limited notes.
- Disable the Refresh button on the **invested** count rather than `holdings.length` — a
  cash-only portfolio has nothing to refresh.
- Update the empty-state hint (currently "stock, ETF, or crypto holding") to mention cash.

### 8. Server guard — `server/app.ts`, `server/market.ts`

- Both `/api/quote` validation sites (the `symbols=` batch loop and the single `type` param)
  switch from `assetTypeSchema` to `quotableTypeSchema`. The existing error message
  (`"symbol and type=stock|etf|crypto required"`) stays accurate.
- Narrow `MarketClient.quote`, `quoteBatch` and the internal `Quote` type from `AssetType` to
  `QuotableType`, so the compiler enforces that cash can never reach a price provider.

## Edge cases

- **Cash-only portfolio:** strategy bar shows only the cash chip; Refresh disabled; totals and
  net worth correct.
- **Pre-feature snapshots:** contain no cash rows, so History renders exactly as before.
- **A stray `strategy` on a cash row** (e.g. hand-edited data): ignored, because `strategyMix`
  filters by type rather than by the presence of a strategy.
- **Duplicate labels:** allowed. Two `IBKR USD` lines are a user bookkeeping choice, not an
  error — same as two holdings of the same ticker today.
- **Double-counting with Assets → Bank savings:** mitigated by the form hint, not enforced.

## Testing

Test-first for the non-UI layers:

- `shared/schema.test.ts`: a cash holding parses through `holdingSchema` and `draftInputSchema`;
  `quotableTypeSchema` rejects `"cash"` and accepts the other three.
- New `src/features/portfolio/lib/cash.test.ts`: `splitCash` partitions correctly and sums each
  side; empty input; cash-only input.
- `src/features/portfolio/lib/strategy-mix.test.ts`: cash is excluded from the denominator (a
  portfolio of one stock + one cash line gives the stock 100%); cash-only input returns `[]`.
- `server/app.test.ts`: `GET /api/quote?symbol=X&type=cash` returns 400; a `SYM:cash` entry in
  `symbols=` returns 400.

UI wiring verified manually, consistent with the existing lightweight approach (no new component
tests).
