# ToTheMoon — Dashboard Chart Date Range Filter Design

Let the user narrow the "Net worth over time" chart on the dashboard to a
date range, via preset pills (6M / 1Y / YTD / All) plus a custom start/end
month window. Today the chart always shows every snapshot plus the live
"Now" point; that remains the default (All).

Delta against the deployed app (main design:
`docs/superpowers/specs/2026-07-07-tothemoon-design.md`).

## Decisions log

| Decision | Choice |
|---|---|
| Filter style | Preset pills **and** a Custom option with start/end month inputs |
| Presets | 6M, 1Y, YTD, All |
| Default | All (current behavior — full history + Now) |
| Persistence | None — local component state, resets to All on reload |
| Scope of effect | Chart card only; hero, summary cards, draft card unaffected |
| Where filtering lives | Inside `NetWorthChart` (Approach A) — pure presentation concern |
| Preset anchor | Today's calendar month (not the latest snapshot's month) |

## UI

- The chart card header (right side, where the "N snapshots" count sits)
  gains a compact pill group: `6M · 1Y · YTD · All · Custom`. One pill is
  active at a time; All is active initially. Pills follow the existing
  small/ghost button styling from `src/components/ui/button.tsx`.
- The "N snapshots" count stays next to the pills and reflects the
  **filtered** snapshot count, excluding the Now point. This is a small
  fix in passing: today the label counts the Now draft point as a
  snapshot (a fresh account shows "1 snapshot" with zero snapshots).
- Selecting **Custom** reveals a row under the header with two native
  `<input type="month">` fields (start, end). Both are optional: empty
  start = from the beginning, empty end = through now. The row disappears
  when a preset pill is selected again.
- If the selected window contains no points at all, the chart area shows a
  centered muted "No snapshots in this range" message; the header, pills,
  and custom inputs stay visible so the user can widen the range.

## Data model

- `ChartPoint` (in `src/features/dashboard/hooks/use-dashboard-data.ts`)
  gains `month: string | null` — the snapshot's `YYYY-MM` for snapshot
  points, `null` for the "Now" draft point. `label` stays display-only.
- `YYYY-MM` strings compare correctly with plain lexicographic `<=` / `>=`;
  no date library is added.

## Filter semantics

Let `currentMonth` = today's month as `YYYY-MM` (computed in the browser's
local timezone).

| Range | Snapshot point included iff | Now point included |
|---|---|---|
| 6M | `month >= currentMonth - 5 months` | yes |
| 1Y | `month >= currentMonth - 11 months` | yes |
| YTD | `month >= <current year>-01` | yes |
| All | always | yes |
| Custom | `start <= month <= end` (missing bound = unbounded) | iff `end` empty or `end >= currentMonth` |

- Presets are calendar windows ending at the present, so "6M" means the 6
  calendar months up to and including the current month.
- Custom bounds are inclusive. `start > end` yields an empty window and
  shows the empty-range message (inputs are not swapped or clamped).
- The Now point only renders when there is a draft (unchanged); the rules
  above additionally gate it by range.

## Implementation

- `src/features/dashboard/lib/chart-range.ts` (new) — pure logic, no React:
  - `type ChartRange = { preset: "6m" | "1y" | "ytd" | "all" } | { start?: string; end?: string }`
  - `filterChartPoints(points: ChartPoint[], range: ChartRange, currentMonth: string): ChartPoint[]`
  - a month-arithmetic helper (`addMonths(month: string, delta: number)`)
    used to derive preset cutoffs.
- `src/features/dashboard/lib/chart-range.test.ts` (new) — colocated vitest
  file (same pattern as `shared/totals.test.ts`).
- `src/features/dashboard/hooks/use-dashboard-data.ts` — add `month` to
  `ChartPoint` and populate it in `toPoint` (snapshot month or `null`).
- `src/features/dashboard/components/net-worth-chart.tsx` — hold the range
  in `useState<ChartRange>({ preset: "all" })`; render the pill group and
  conditional custom inputs (as a small subcomponent in the same file);
  pass filtered points to the chart; render the empty-range message when
  the filtered list is empty.
- No changes to `src/routes/index.tsx`, the hero, summary cards, server
  code, or storage.

## Testing

- Unit tests for `filterChartPoints` (and `addMonths`, including year
  rollover): each preset at year boundaries, custom with both/one/no
  bounds, `start > end`, Now-point inclusion and exclusion, empty result.
- No component-test framework exists in the repo; interaction is verified
  manually via the playwright screenshot setup (seeded `.data/store.json`),
  checking: default All matches today's rendering, each pill narrows the
  chart, Custom inputs work, and the empty-range message renders.

## Acceptance criteria

1. Dashboard chart renders the same data as today on load (All selected);
   the only visible differences are the new controls and the corrected
   snapshot count (Now no longer counted).
2. 6M / 1Y / YTD pills narrow the chart to the documented calendar windows,
   always keeping the Now point.
3. Custom start/end month inputs filter inclusively; the Now point is
   excluded when the end bound is before the current month.
4. Snapshot count label reflects the filtered count.
5. An empty window shows "No snapshots in this range" instead of an empty
   chart, with the controls still usable.
6. Selection resets to All on reload (no persistence).
7. `npm test` passes with the new `chart-range` unit tests.

## Out of scope

Persisting the selection (localStorage/URL), filtering anything other than
the chart card, non-month granularity (snapshots are monthly), comparing
ranges, and server-side filtering.
