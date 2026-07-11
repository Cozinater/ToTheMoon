# Custom Date Picker — Design

**Date:** 2026-07-11
**Status:** Approved

## Problem

All four date fields use `<Input type="date">`. On desktop browsers the native
calendar dropdown is unstyled (white, system fonts) and clashes with the app's
dark green/cream theme. Replace it with a themed custom picker on desktop while
keeping the native platform picker on mobile, where it is a good experience.

## Scope

One shared component replaces the native input at all four call sites:

| Call site | File |
|---|---|
| Add/edit bank-savings entry | `src/features/assets/components/entry-form.tsx` |
| Portfolio holding as-of date | `src/features/portfolio/components/holding-form.tsx` |
| History amend date | `src/features/history/components/amend-dialog.tsx` |
| Settings close-month date | `src/features/settings/components/close-month-card.tsx` |

## Component

`DatePicker` in `src/components/date-picker.tsx`.

```ts
{
  id?: string;                        // forwarded to the trigger for Label htmlFor
  value: string;                      // "yyyy-mm-dd" or ""
  onChange: (value: string) => void;  // always "yyyy-mm-dd"
}
```

The value contract matches the native input exactly, so call sites change only
the element name — no form/state logic changes.

### Responsive split

Inside `DatePicker`, `useMediaQuery("(min-width: 640px)")` (same hook and
breakpoint as `ResponsiveModal`):

- **< 640px:** render the existing `<Input type="date">` unchanged — mobile
  users keep the platform wheel/full-screen picker.
- **≥ 640px:** render the custom trigger + calendar popover.

### Date handling

Convert `"yyyy-mm-dd"` ↔ `Date` with local-time construction
(`new Date(y, m - 1, d)`), never `parseISO`/`Date.parse`, to avoid timezone
off-by-one. Invalid or empty strings render the placeholder state.

## Dependencies

Add shadcn `calendar` and `popover` components (radix-nova registry) to
`src/components/ui/`, which brings `react-day-picker` and `date-fns`.

## Visual design

Direction is pinned by the existing design system; every choice derives from
tokens in `src/App.css`.

- **Trigger:** button styled identically to `Input` — `h-10 w-full rounded-xl
  border-border bg-background/50 px-3`, same focus-visible ring
  (`ring-ring/40`). Date text left-aligned in foreground (cream); lucide
  `CalendarIcon` on the right in `muted-foreground` (sage). Empty state:
  muted placeholder "Pick a date".
- **Display format:** `d MMM yyyy` (e.g. "11 Jul 2026") via `date-fns/format`.
- **Popover panel:** `bg-popover` (#132420) with the app's `surface`-style
  soft light wash, `border-border`, `rounded-2xl`, soft shadow.
- **Month caption:** Sora (`font-display`) semibold — the panel's heading uses
  the display face like every heading in the app. Prev/next chevrons are
  ghost icon buttons.
- **Day grid:** Manrope (inherited body face). Weekday header row in small
  sage caps. Day cells `size-9`, `rounded-lg`, hover `bg-secondary/60`.
- **Selected day:** solid gold chip — `bg-primary text-primary-foreground
  font-semibold` with the app's subtle gold glow shadow
  (`shadow-[0_0_20px_rgba(232,192,105,0.10)]` idiom).
- **Today (unselected):** `text-primary` with a small dot beneath the number.
- **Outside-month days:** faint sage (`text-muted-foreground/40`-ish).
- **Week starts Monday.**
- **No footer** (no Clear/Today row) — selecting a day closes the popover
  immediately.

## Behavior

- Popover opens on click / Enter / Space on the trigger.
- Initial visible month: the current value's month, else today's.
- Picking a day calls `onChange("yyyy-mm-dd")` and closes the popover.
- Keyboard navigation and a11y come from react-day-picker defaults.
- No min/max date constraints (matches current behavior).

## Testing & verification

- Unit: `"yyyy-mm-dd"` ↔ `Date` conversion round-trip, including empty and
  invalid input.
- Visual: run the app, open the Add to Bank Savings dialog with the picker
  expanded, screenshot (playwright-core + system Chrome), and check against
  the app's design bar (`screenshots/` mocks).
