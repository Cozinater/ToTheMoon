# ToTheMoon — Dashboard Chart Category Filter Design

Let the user show and hide individual categories on the dashboard's "Net worth
over time" chart by clicking the legend. Today all six series always render;
that stays the default. The selection persists in `localStorage`.

Delta against the deployed app (main design:
`docs/superpowers/specs/2026-07-07-tothemoon-design.md`). Composes with the
date range filter (`docs/superpowers/specs/2026-07-11-chart-date-range-filter-design.md`).

## Decisions log

| Decision | Choice |
|---|---|
| Categories | The six existing chart series: Portfolio, Savings, CPF, Property, Credit Cards, Loans |
| Control | The existing bottom legend becomes clickable toggle chips |
| Default | All six visible |
| Tooltip total | Sum of visible series, labelled "Visible total" while any category is hidden |
| All hidden | Allowed — plot area shows "No categories selected", legend stays clickable |
| Persistence | `localStorage`, key `tothemoon:chart-hidden-series` |
| Cross-tab sync | None — read once on mount |
| Where the logic lives | Pure `lib/chart-series.ts` + a small `use-hidden-series` hook + a split-out legend component |
| Scope of effect | Chart card only; hero, summary cards, draft card unaffected |

## UI

- The legend row at the bottom of the chart card becomes a row of
  `<button type="button">` chips, one per series, each carrying its colour
  dot and label as today.
- **Visible** chip: filled colour dot, current `text-muted-foreground` label.
- **Hidden** chip: hollow dot (colour ring, transparent fill), label dimmed
  further and struck through.
- Chips carry `aria-pressed={visible}` and reuse the range pills' interaction
  styling (`rounded-lg px-2 py-1`, `hover:text-foreground`,
  `focus-visible:ring-3 focus-visible:ring-ring/50`) so keyboard focus looks
  consistent across the card's two controls. The row's `gap-x-4` shrinks to
  `gap-x-1` to offset each chip's new `px-2`, keeping the visual spacing
  between labels roughly as it is today.
- No new controls in the header; the range pills and the "N snapshots" count
  are unchanged.

## Behaviour

- Only visible series render an `<Area>` and a gradient `<def>`. Recharts
  restacks the remaining areas and rescales the Y axis to the visible data.
  That rescaling is intended, not a bug.
- Category filtering and range filtering are independent and compose: hiding a
  category never changes which months render, and the "N snapshots" count keeps
  reflecting the range alone.
- Hidden categories do not affect the hero figure, the summary cards, or the
  draft card.

### Tooltip

Recharts only includes rendered series in the tooltip payload, so the per-series
rows are correct with no extra work. The footer line changes:

| State | Footer label | Footer value |
|---|---|---|
| No categories hidden | `Net worth` | `visibleTotal` (equals `point.netWorth`) |
| Any category hidden | `Visible total` | `visibleTotal` |

`ChartPoint` already stores `creditCards` and `loans` negated, so `visibleTotal`
is a plain sum of the visible keys and needs no sign handling.

### Empty states

Checked in this order inside the plot area:

1. `filtered.length === 0` → "No snapshots in this range" (existing message,
   unchanged, takes precedence).
2. Otherwise, no visible categories → "No categories selected".
3. Otherwise, the chart.

The legend renders below the plot area in every case, so the user can always
click a category back on.

## Persistence

- Key: `tothemoon:chart-hidden-series`. Value: a JSON array of series keys,
  e.g. `["cpf","creditCards"]`.
- Read once, lazily, in the `useState` initialiser on mount. Written on every
  toggle, including back to `[]` (one code path — the key is never removed).
- No `storage` event listener; a second tab will not update live.
- Parsing is defensive: missing key, malformed JSON, or a non-array value all
  yield "nothing hidden". Unknown and non-string entries are filtered out and
  duplicates collapsed.
- All six keys stored is a valid state — the user hid everything on purpose, so
  it is respected and the "No categories selected" message shows.
- Both the read and the write are wrapped in `try`/`catch`. Safari private mode
  throws on `setItem`; a storage failure degrades to all-visible / no-op rather
  than crashing the dashboard.

## Implementation

- `src/features/dashboard/lib/chart-series.ts` (new) — pure, no React and no
  browser APIs, so it is testable under the repo's `node` vitest environment:
  - `type SeriesKey = "portfolio" | "savings" | "cpf" | "property" | "creditCards" | "loans"`
  - `SERIES` — the table currently inlined in `net-worth-chart.tsx`
    (key, label, colour, stack), moved here.
  - `parseHiddenSeries(raw: string | null): SeriesKey[]`
  - `serializeHiddenSeries(hidden: SeriesKey[]): string`
  - `visibleTotal(point: Record<SeriesKey, number>, hidden: SeriesKey[]): number`
- `src/features/dashboard/lib/chart-series.test.ts` (new) — colocated vitest
  file, same pattern as `chart-range.test.ts`.
- `src/features/dashboard/hooks/use-hidden-series.ts` (new) — the only module
  touching `localStorage`. Returns `[hidden, toggle]`; `toggle(key)` flips
  membership and persists.
- `src/features/dashboard/components/chart-legend.tsx` (new) — presentational,
  takes `hidden` and `onToggle`, and imports `SERIES` from the lib itself so
  the chart does not have to pass the table through.
- `src/features/dashboard/components/net-worth-chart.tsx` — drops the local
  `SERIES` constant, calls `useHiddenSeries`, renders only visible areas and
  gradients, renders `<ChartLegend>`, passes `hidden` to the tooltip
  (`content={<ChartTooltip hidden={hidden} />}` — recharts clones the element
  with its own props), and adds the all-hidden empty state.
- No changes to `use-dashboard-data.ts`, `src/routes/index.tsx`, the hero,
  summary cards, server code, or storage.

`hidden` is a `SeriesKey[]`, not a `Set` — six items make lookup cost
irrelevant, and an array serialises directly and compares cleanly as React
state.

## Testing

Unit tests in `chart-series.test.ts`:

- `parseHiddenSeries`: `null`, empty string, malformed JSON, a JSON object
  instead of an array, a valid subset, unknown keys filtered out, non-string
  entries filtered out, duplicates collapsed, all six keys.
- `serializeHiddenSeries` → `parseHiddenSeries` round trip.
- `visibleTotal`: nothing hidden equals `point.netWorth`; hiding an asset
  lowers the total; hiding a liability raises it (stored negative); everything
  hidden is `0`.

No component-test framework exists in the repo, so interaction is verified
manually via the playwright screenshot setup (seeded `.data/store.json`):
toggling chips, the tooltip footer switching label, the all-hidden message, and
a reload confirming the selection persists.

## Acceptance criteria

1. Clicking a legend chip hides that series from the chart; clicking again
   restores it. All six are visible on a first visit.
2. Hidden chips are visually distinct (hollow dot, dimmed, struck through) and
   expose `aria-pressed="false"`; chips are reachable and operable by keyboard.
3. The tooltip lists only visible categories, and its footer equals the sum of
   the rows listed — labelled "Visible total" when anything is hidden and
   "Net worth" when all six are shown.
4. Stacking and the Y axis rescale to the visible series.
5. Hiding every category shows "No categories selected"; an empty date range
   still shows "No snapshots in this range" instead, even with categories
   hidden.
6. The selection survives a reload. A missing, malformed, or unknown-key
   `localStorage` value falls back to all visible, and a storage write failure
   does not break the page.
7. The date range filter, the snapshot count, the hero, and the summary cards
   behave exactly as they do today.
8. `npm test` passes with the new `chart-series` unit tests; `npm run lint` is
   clean.

## Out of scope

Filtering anything outside the chart card (hero, summary cards, draft card),
breaking Portfolio down by strategy, URL/shareable filter state, cross-tab
sync, "isolate this series" gestures such as double-click or shift-click, and
reordering or recolouring series.
