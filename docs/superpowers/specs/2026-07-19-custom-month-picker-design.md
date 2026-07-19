# Custom Month Picker — Design

**Date:** 2026-07-19
**Status:** Approved

## Problem

The net worth chart's custom date-range **From / To** fields
([`net-worth-chart.tsx`](../../../src/features/dashboard/components/net-worth-chart.tsx))
still use raw `<Input type="month">`. On every platform this opens the browser's
**native month picker** — the white/system-styled "2026 / Jan–Dec grid" popup —
which clashes with the app's dark-green/gold theme.

The custom-date-picker work
([spec](2026-07-11-custom-date-picker-design.md)) only replaced the four
day-level `<Input type="date">` fields with the themed `DatePicker`. The chart
is **month-level** (`yyyy-mm`) and `DatePicker` is a **day** calendar
(`yyyy-mm-dd`), so it was never converted. These two inputs are the only
remaining native pickers in the app.

## Scope

One new shared component, `MonthPicker`, replaces both native month inputs at
the single call site:

| Call site | File |
|---|---|
| Net worth chart From / To range | `src/features/dashboard/components/net-worth-chart.tsx` |

Out of scope: the chart's range logic (`chart-range.ts`), the `ChartRange`
type, and the four existing `DatePicker` fields — all unchanged.

## Component

`MonthPicker` in `src/components/month-picker.tsx`.

```ts
{
  id?: string;                        // forwarded to the trigger for Label htmlFor
  value: string;                      // "yyyy-mm" or ""
  onChange: (value: string) => void;  // "yyyy-mm", or "" when cleared
  placeholder?: string;               // trigger empty-state text, default "Pick a month"
}
```

The value contract matches the native `type="month"` input exactly, so the call
site changes only the element name plus its existing `"" → undefined` mapping —
no range/state logic changes.

### No responsive split

Unlike `DatePicker`, `MonthPicker` renders the **themed picker on all
viewports** — there is no native mobile fallback. A 3×4 month grid gives large,
touch-friendly targets, so the custom control is a good experience on mobile
too. (Decision confirmed during brainstorming, 2026-07-19.)

### Month handling

New helpers in `src/lib/date.ts`, mirroring the existing `yyyy-mm-dd` helpers:

- `parseYm(value): { year: number; month: number } | undefined` — parses
  `"yyyy-mm"` (month is 1-based). Returns `undefined` for empty, malformed, or
  out-of-range month (`< 01` / `> 12`). Regex `^(\d{4})-(\d{2})$`.
- `toYm(year, month): string` — formats a 1-based year/month to `"yyyy-mm"`,
  zero-padding the month.
- `formatDisplayMonth(value): string` — `"2026-07"` → `"Jul 2026"` via
  `date-fns/format` on a locally-constructed `new Date(year, month - 1, 1)`;
  empty/invalid input → `""`.
- `currentYm(): string` — today as `"yyyy-mm"` (used for the "this month"
  highlight and the "This month" footer action).

Construct dates with local-time `new Date(y, m - 1, 1)`, never
`parseISO`/`Date.parse`, to avoid timezone off-by-one — same rule as
`DatePicker`.

## Visual design

Every choice derives from existing design-system tokens (`src/App.css`) and
mirrors the `DatePicker` visual language for consistency.

- **Trigger:** button styled identically to `DatePicker`'s trigger and to
  `Input` — `h-10 w-full rounded-xl border-border bg-background/50 px-3`, same
  `focus-visible` and `aria-invalid` rings. (The chart currently sizes these
  `h-8 w-40`; the trigger accepts `className` so the chart keeps its compact
  sizing.) Selected month shown left-aligned in foreground (cream) as
  `MMM yyyy`; lucide `CalendarIcon` on the right in `muted-foreground`. Empty
  state: muted placeholder ("Pick a month").
- **Popover panel:** `bg-popover` with the app's `surface`-style soft light
  wash, `border-border`, `rounded-2xl`, soft shadow, `p-2` — matching
  `DatePicker`'s `PopoverContent`. `align="start"`, `w-auto`.
- **Year navigator:** a header row with the year in Sora (`font-display`)
  semibold, centered, flanked by ‹ / › ghost icon chevron buttons (lucide
  `ChevronLeftIcon` / `ChevronRightIcon`, `size-4`, `muted-foreground`).
  Prev/next change only the **displayed year**, not the selection.
- **Month grid:** 3 columns × 4 rows of month abbreviations (`Jan`…`Dec`,
  Manrope body face). Each cell a button, `rounded-lg`, `py-2`, hover
  `bg-secondary/60`, same `focus-visible` ring idiom as the day grid.
- **Selected month:** solid gold chip — `bg-primary text-primary-foreground
  font-semibold` with the subtle gold glow
  (`shadow-[0_0_20px_rgba(232,192,105,0.18)]` idiom), matching the selected day.
- **Current month (unselected):** `text-primary` with a small dot beneath the
  label, mirroring `DatePicker`'s "today" treatment.
- **Footer:** a row preserving the native picker's affordances the user is used
  to — **Clear** (left) and **This month** (right), both small text buttons in
  the accent/link style. Keeps feature parity: From/To are optional, so clearing
  must remain possible.

## Behavior

- Popover opens on click / Enter / Space on the trigger (Radix `Popover`
  defaults).
- Initial displayed year: the current value's year, else the current calendar
  year.
- Clicking a month calls `onChange("yyyy-mm")` and closes the popover.
- **Clear** calls `onChange("")` and closes. **This month** calls
  `onChange(currentYm())` and closes.
- Keyboard nav and a11y come from Radix `Popover` + native `<button>` grid.
- No min/max constraints (matches current behavior).

## Testing & verification

- **Unit** (`src/lib/date.test.ts`): `parseYm` / `toYm` round-trip including
  empty, malformed, and out-of-range month; `formatDisplayMonth` for valid and
  empty/invalid input; `currentYm` shape.
- **Visual:** run the app, select **Custom** on the net worth chart, open a
  From/To picker, screenshot (playwright-core + system Chrome, seeded
  `.data/store.json`), and check against the app's design bar
  (`screenshots/` mocks) — the picker must read as the same family as
  `DatePicker`.
