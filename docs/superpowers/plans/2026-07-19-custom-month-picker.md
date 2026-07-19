# Custom Month Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `<Input type="month">` on the net worth chart's From/To range fields with a themed `MonthPicker` that matches the app's dark-green/gold design.

**Architecture:** A new `MonthPicker` component (sibling to `DatePicker`) renders a themed trigger button + Radix `Popover` containing a year navigator and a 3×4 Jan–Dec grid. It keeps the `"yyyy-mm"` value contract, so the chart's range logic is untouched — only the two inputs are swapped. New `yyyy-mm` string↔value helpers land in `src/lib/date.ts` alongside the existing `yyyy-mm-dd` helpers.

**Tech Stack:** React, TypeScript, Tailwind v4, Radix `Popover`, lucide-react, date-fns, Vitest.

## Global Constraints

- Value contract is `"yyyy-mm"` (or `""` for empty) — matches the native `type="month"` input exactly; `onChange` emits `"yyyy-mm"` or `""`.
- Construct dates local-time via `new Date(y, m - 1, 1)` — never `parseISO`/`Date.parse` (timezone off-by-one).
- Themed picker on **all** viewports — no native mobile fallback.
- Every visual choice derives from existing tokens (`src/App.css`) and mirrors `DatePicker`'s language: `surface` popover, gold selected chip, `text-primary` + dot for current month, Sora (`font-display`) year label.
- Test runner: `vitest run` (script: `npm test`). Node comes from nvm — export the nvm node22 bin before npm/npx in non-interactive shells.

---

### Task 1: Add `yyyy-mm` date helpers

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

**Interfaces:**
- Consumes: `format` from `date-fns` (already imported in `date.ts`).
- Produces:
  - `parseYm(value: string): { year: number; month: number } | undefined` — `month` is 1-based.
  - `toYm(year: number, month: number): string` — 1-based month, zero-padded → `"yyyy-mm"`.
  - `formatDisplayMonth(value: string): string` — `"2026-07"` → `"Jul 2026"`; empty/invalid → `""`.
  - `currentYm(): string` — today as `"yyyy-mm"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/date.test.ts`:

```ts
import { currentYm, formatDisplayMonth, parseYm, toYm } from "./date";

describe("parseYm", () => {
  it("parses a valid yyyy-mm into 1-based year/month", () => {
    expect(parseYm("2026-07")).toEqual({ year: 2026, month: 7 });
  });

  it("returns undefined for empty, malformed, or out-of-range month", () => {
    expect(parseYm("")).toBeUndefined();
    expect(parseYm("2026-7")).toBeUndefined();
    expect(parseYm("2026-07-11")).toBeUndefined();
    expect(parseYm("2026-00")).toBeUndefined();
    expect(parseYm("2026-13")).toBeUndefined();
  });
});

describe("toYm", () => {
  it("zero-pads the month and round-trips with parseYm", () => {
    expect(toYm(2026, 1)).toBe("2026-01");
    expect(parseYm(toYm(2026, 7))).toEqual({ year: 2026, month: 7 });
  });
});

describe("formatDisplayMonth", () => {
  it("formats as MMM yyyy", () => {
    expect(formatDisplayMonth("2026-07")).toBe("Jul 2026");
    expect(formatDisplayMonth("2026-01")).toBe("Jan 2026");
  });

  it("returns empty string for empty or invalid input", () => {
    expect(formatDisplayMonth("")).toBe("");
    expect(formatDisplayMonth("nope")).toBe("");
  });
});

describe("currentYm", () => {
  it("returns a yyyy-mm string", () => {
    expect(currentYm()).toMatch(/^\d{4}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/date.test.ts`
Expected: FAIL — `parseYm`, `toYm`, `formatDisplayMonth`, `currentYm` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/date.ts` (below the existing `formatDisplayDate`):

```ts
const YM = /^(\d{4})-(\d{2})$/;

/** Parse "yyyy-mm" into 1-based { year, month }. Returns undefined for anything else. */
export function parseYm(value: string): { year: number; month: number } | undefined {
  const m = YM.exec(value);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  return { year, month };
}

/** 1-based year/month → zero-padded "yyyy-mm". */
export function toYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2026-07" → "Jul 2026"; empty/invalid input → "". */
export function formatDisplayMonth(value: string): string {
  const parsed = parseYm(value);
  return parsed ? format(new Date(parsed.year, parsed.month - 1, 1), "MMM yyyy") : "";
}

/** Today as "yyyy-mm". */
export function currentYm(): string {
  const d = new Date();
  return toYm(d.getFullYear(), d.getMonth() + 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/date.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "feat: add yyyy-mm date helpers with tests"
```

---

### Task 2: Build the `MonthPicker` component

**Files:**
- Create: `src/components/month-picker.tsx`

**Interfaces:**
- Consumes: `parseYm`, `toYm`, `formatDisplayMonth`, `currentYm` from `@/lib/date` (Task 1); `Popover`, `PopoverContent`, `PopoverTrigger` from `@/components/ui/popover`; `cn` from `@/lib/utils`; `CalendarIcon`, `ChevronLeftIcon`, `ChevronRightIcon` from `lucide-react`.
- Produces: `MonthPicker(props: { id?: string; value: string; onChange: (value: string) => void; className?: string; placeholder?: string })`.

This is a UI component; it is verified visually in Task 4 (there is no unit test — the repo has no component-test setup, and behavior is thin glue over the helpers already covered in Task 1).

- [ ] **Step 1: Write the component**

Create `src/components/month-picker.tsx`:

```tsx
import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { currentYm, formatDisplayMonth, parseYm, toYm } from "@/lib/date";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPicker(props: {
  id?: string;
  value: string; // "yyyy-mm" or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseYm(props.value)?.year ?? new Date().getFullYear());
  const nowYm = currentYm();

  // Each time the popover opens, start the navigator on the selected year (or this year).
  const onOpenChange = (next: boolean) => {
    if (next) setViewYear(parseYm(props.value)?.year ?? new Date().getFullYear());
    setOpen(next);
  };

  const commit = (value: string) => {
    props.onChange(value);
    setOpen(false);
  };

  const navBtn =
    "flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        id={props.id}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 md:text-sm",
          props.className,
        )}
      >
        {parseYm(props.value) ? (
          <span>{formatDisplayMonth(props.value)}</span>
        ) : (
          <span className="text-muted-foreground">{props.placeholder ?? "Pick a month"}</span>
        )}
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="surface w-auto rounded-2xl p-2 shadow-lg ring-0">
        <div className="flex items-center justify-between px-1 pb-2">
          <button type="button" aria-label="Previous year" onClick={() => setViewYear((y) => y - 1)} className={navBtn}>
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="font-display text-sm font-semibold select-none">{viewYear}</span>
          <button type="button" aria-label="Next year" onClick={() => setViewYear((y) => y + 1)} className={navBtn}>
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, i) => {
            const ym = toYm(viewYear, i + 1);
            const isSelected = ym === props.value;
            const isCurrent = ym === nowYm;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={isSelected}
                onClick={() => commit(ym)}
                className={cn(
                  "relative rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground shadow-[0_0_20px_rgba(232,192,105,0.18)]"
                    : "hover:bg-secondary/60",
                  !isSelected && isCurrent && "text-primary",
                )}
              >
                {label}
                {isCurrent && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between px-1 pt-1">
          <button
            type="button"
            onClick={() => commit("")}
            className="rounded text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => commit(nowYm)}
            className="rounded text-xs font-medium text-primary transition-colors outline-none hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            This month
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck / build to verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `month-picker.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/month-picker.tsx
git commit -m "feat: themed MonthPicker with year navigator and month grid"
```

---

### Task 3: Wire `MonthPicker` into the net worth chart

**Files:**
- Modify: `src/features/dashboard/components/net-worth-chart.tsx`

**Interfaces:**
- Consumes: `MonthPicker` from `@/components/month-picker` (Task 2).
- Produces: nothing new — internal wiring only. `ChartRange` and `chart-range.ts` are unchanged.

- [ ] **Step 1: Swap the import**

In `src/features/dashboard/components/net-worth-chart.tsx`, remove the now-unused `Input` import (line 3) and add the `MonthPicker` import:

```tsx
import { MonthPicker } from "@/components/month-picker";
```

(Confirm `Input` is not referenced elsewhere in the file — it is used only inside `CustomRangeInputs`.)

- [ ] **Step 2: Replace the inputs in `CustomRangeInputs`**

Replace the whole `CustomRangeInputs` function body's two `<Input type="month" ...>` elements so the function reads:

```tsx
function CustomRangeInputs(props: {
  range: { start?: string; end?: string };
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        From
        <MonthPicker
          className="h-8 w-40"
          value={props.range.start ?? ""}
          onChange={(v) => props.onChange({ ...props.range, start: v || undefined })}
        />
      </label>
      <label className="flex items-center gap-2">
        To
        <MonthPicker
          className="h-8 w-40"
          value={props.range.end ?? ""}
          onChange={(v) => props.onChange({ ...props.range, end: v || undefined })}
        />
      </label>
    </div>
  );
}
```

(`cn`/twMerge makes `h-8 w-40` override the trigger's default `h-10 w-full`. The `v || undefined` mapping preserves the existing "empty means open-ended" semantics.)

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass (including `chart-range` tests, unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/features/dashboard/components/net-worth-chart.tsx
git commit -m "feat: use themed MonthPicker for chart From/To range"
```

---

### Task 4: Visual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the app and screenshot the picker**

Use the UI verification setup (playwright-core + system Chrome, seeded `.data/store.json`, worktree dev-server ports 5273/8788 via temp override — never 5173/8787). Steps:
1. Load the dashboard.
2. Click **Custom** on the "Net worth over time" card.
3. Click the **From** field to open the picker.
4. Screenshot the open popover.

- [ ] **Step 2: Check against the design bar**

Confirm against `screenshots/` mocks and the `DatePicker` family:
- Popover is the dark `surface` panel (no white native chrome).
- Year navigator: `‹ 2026 ›`, year in Sora semibold.
- 3×4 Jan–Dec grid; hover shows `bg-secondary/60`.
- Current month (Jul 2026) shows `text-primary` + dot when unselected; a selected month shows the gold chip.
- **Clear** and **This month** footer actions present and working.
- Reads as the same visual family as the existing `DatePicker`.

- [ ] **Step 3: Report**

Report the screenshot and the checklist result. No commit (verification only).

---

## Self-Review

- **Spec coverage:** helpers (Task 1 ↔ spec "Month handling"); component visuals/behavior (Task 2 ↔ spec "Visual design" + "Behavior"); no responsive split (Task 2 renders themed on all viewports); wiring + untouched range logic (Task 3 ↔ spec "Scope"); unit + visual verification (Task 4 ↔ spec "Testing & verification"). Clear/This-month footer covered in Task 2. ✓
- **Placeholders:** none — every code step contains full code. ✓
- **Type consistency:** `parseYm`/`toYm`/`formatDisplayMonth`/`currentYm` signatures identical across Tasks 1–2; `MonthPicker` prop shape identical across Tasks 2–3; `"yyyy-mm"` value contract consistent throughout. ✓
