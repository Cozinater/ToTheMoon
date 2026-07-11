# Custom Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four native `<Input type="date">` fields with a themed `DatePicker` component — custom shadcn Calendar popover on desktop (≥640px), unchanged native input on mobile.

**Architecture:** A shared `src/components/date-picker.tsx` keeps the native input's `value`/`onChange` string contract (`"yyyy-mm-dd"` or `""`) so all four call sites are one-line swaps. shadcn `calendar` + `popover` (radix-nova registry) are added to `src/components/ui/` and left pristine; all theming is passed from `date-picker.tsx` via `className`/`classNames` props. Pure date-string helpers live in `src/lib/date.ts` with vitest coverage.

**Tech Stack:** React 19, Tailwind v4, shadcn (radix-nova), react-day-picker v9, date-fns, vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-custom-date-picker-design.md`

## Global Constraints

- `npm`/`node`/`npx` are NOT on PATH in non-interactive shells. Prefix every command that touches them with:
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"`
- Do NOT edit `src/components/ui/calendar.tsx` or `src/components/ui/popover.tsx` after generation — theming goes through props in `date-picker.tsx`.
- Do NOT overwrite existing `src/components/ui/*` files (button, input, etc.) when running the shadcn CLI.
- Date strings are always `"yyyy-mm-dd"`. Convert to `Date` with local-time construction only — never `parseISO`, `Date.parse`, or `new Date("yyyy-mm-dd")` (those parse as UTC and shift the day in UTC+8).
- Display format is `d MMM yyyy` (e.g. "11 Jul 2026"). Week starts Monday. No min/max date constraints.
- All commands run from the repo root: `/Users/raymond/Documents/Github/ToTheMoon`.

---

### Task 1: Add shadcn calendar + popover components

**Files:**
- Create (via CLI): `src/components/ui/calendar.tsx`, `src/components/ui/popover.tsx`
- Modify (via CLI): `package.json`, `package-lock.json` (adds `react-day-picker`, `date-fns`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Calendar` (props of `react-day-picker`'s `DayPicker` + `className`/`classNames`) exported from `@/components/ui/calendar`; `Popover`, `PopoverTrigger`, `PopoverContent` exported from `@/components/ui/popover`. `date-fns` importable. Task 2 and 3 rely on these.

- [ ] **Step 1: Run the shadcn CLI**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx shadcn add calendar popover --yes
```

Expected: CLI reports adding `calendar.tsx` and `popover.tsx`, installs `react-day-picker` and `date-fns`. Do NOT pass `--overwrite`; if it asks about overwriting existing components (e.g. `button`), decline/skip.

- [ ] **Step 2: Verify only the intended files changed**

Run: `git status --short`
Expected: only `?? src/components/ui/calendar.tsx`, `?? src/components/ui/popover.tsx`, `M package.json`, `M package-lock.json`. If any existing `src/components/ui/*` file (button, input, dialog…) shows as modified, restore it: `git checkout -- src/components/ui/<file>.tsx`.

Also confirm `grep -E 'react-day-picker|date-fns' package.json` shows both new dependencies, and that `src/components/ui/calendar.tsx` imports chevron icons from `lucide-react` (the CLI resolves the registry's `IconPlaceholder` to lucide because `components.json` sets `iconLibrary: "lucide"`).

- [ ] **Step 3: Verify the build passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm run build
```

Expected: `tsc -b && vite build` completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/calendar.tsx src/components/ui/popover.tsx package.json package-lock.json
git commit -m "feat: add shadcn calendar and popover components"
```

---

### Task 2: Date string helpers with tests (TDD)

**Files:**
- Create: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`
- Modify: `vite.config.ts` (vitest `include` — currently line 20: `include: ["shared/**/*.test.ts", "server/**/*.test.ts"]`)

**Interfaces:**
- Consumes: `format` from `date-fns` (installed in Task 1).
- Produces (Task 3 relies on these exact signatures):
  - `parseYmd(value: string): Date | undefined` — local-time `Date` for a valid `"yyyy-mm-dd"`, else `undefined`
  - `toYmd(date: Date): string` — `"yyyy-mm-dd"`
  - `formatDisplayDate(value: string): string` — `"11 Jul 2026"` style, or `""` for empty/invalid input

- [ ] **Step 1: Add src tests to the vitest include list**

In `vite.config.ts`, change:

```ts
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
```

to:

```ts
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "src/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDisplayDate, parseYmd, toYmd } from "./date";

describe("parseYmd", () => {
  it("parses a valid date as local time", () => {
    const d = parseYmd("2026-07-11")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(11);
  });

  it("returns undefined for empty and malformed strings", () => {
    expect(parseYmd("")).toBeUndefined();
    expect(parseYmd("11/07/2026")).toBeUndefined();
    expect(parseYmd("2026-7-1")).toBeUndefined();
  });

  it("rejects out-of-range dates like Feb 31", () => {
    expect(parseYmd("2026-02-31")).toBeUndefined();
  });
});

describe("toYmd", () => {
  it("round-trips with parseYmd", () => {
    expect(toYmd(parseYmd("2026-07-11")!)).toBe("2026-07-11");
  });

  it("pads month and day", () => {
    expect(toYmd(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("formatDisplayDate", () => {
  it("formats as d MMM yyyy", () => {
    expect(formatDisplayDate("2026-07-11")).toBe("11 Jul 2026");
  });

  it("returns empty string for empty or invalid input", () => {
    expect(formatDisplayDate("")).toBe("");
    expect(formatDisplayDate("nope")).toBe("");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/lib/date.test.ts
```

Expected: FAIL — cannot resolve `./date` (module does not exist yet). The pre-existing `shared/` and `server/` suites still pass.

- [ ] **Step 4: Write the implementation**

Create `src/lib/date.ts`:

```ts
import { format } from "date-fns";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "yyyy-mm-dd" into a local-time Date. Returns undefined for anything else. */
export function parseYmd(value: string): Date | undefined {
  const m = YMD.exec(value);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const overflowed = date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d;
  return overflowed ? undefined : date;
}

export function toYmd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** "2026-07-11" → "11 Jul 2026"; empty/invalid input → "". */
export function formatDisplayDate(value: string): string {
  const date = parseYmd(value);
  return date ? format(date, "d MMM yyyy") : "";
}
```

- [ ] **Step 5: Run the full test suite to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test
```

Expected: PASS — all suites including the 7 new tests in `src/lib/date.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/date.ts src/lib/date.test.ts vite.config.ts
git commit -m "feat: add yyyy-mm-dd date helpers with tests"
```

---

### Task 3: DatePicker component

**Files:**
- Create: `src/components/date-picker.tsx`

**Interfaces:**
- Consumes: `Calendar` from `@/components/ui/calendar`; `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover` (Task 1); `parseYmd`/`toYmd`/`formatDisplayDate` from `@/lib/date` (Task 2); existing `Input` from `@/components/ui/input`; existing `useMediaQuery` from `@/hooks/use-media-query`.
- Produces (Task 4 relies on this): `DatePicker` component with props `{ id?: string; value: string; onChange: (value: string) => void }` — the same value contract as `<Input type="date">`.

- [ ] **Step 1: Create the component**

Create `src/components/date-picker.tsx`:

```tsx
import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatDisplayDate, parseYmd, toYmd } from "@/lib/date";

export function DatePicker(props: {
  id?: string;
  value: string; // "yyyy-mm-dd" or ""
  onChange: (value: string) => void;
}) {
  // Same breakpoint as ResponsiveModal: mobile keeps the native platform picker.
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(false);

  if (!isDesktop) {
    return <Input id={props.id} type="date" value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
  }

  const selected = parseYmd(props.value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={props.id}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-background/50 px-3 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      >
        {selected ? (
          <span>{formatDisplayDate(props.value)}</span>
        ) : (
          <span className="text-muted-foreground">Pick a date</span>
        )}
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="surface w-auto rounded-2xl p-2 shadow-lg ring-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected ?? new Date()}
          onSelect={(date) => {
            if (!date) return;
            props.onChange(toYmd(date));
            setOpen(false);
          }}
          className="[--cell-size:--spacing(9)]"
          classNames={{
            caption_label: "cn-calendar-caption select-none font-display text-sm font-semibold",
            weekday: "flex-1 select-none text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground",
            today:
              "relative rounded-(--cell-radius) text-primary after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary data-[selected=true]:after:hidden",
            outside: "text-muted-foreground/40 aria-selected:text-muted-foreground/40",
            day_button:
              "data-[selected-single=true]:font-semibold data-[selected-single=true]:shadow-[0_0_20px_rgba(232,192,105,0.18)]",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

Notes for the implementer (why these values):
- The trigger classes mirror `src/components/ui/input.tsx` exactly (input-styled button per spec). Radix's `PopoverTrigger` renders a real `<button type="button">`, so `Label htmlFor` and keyboard open (Enter/Space) work natively.
- The registry calendar already renders the selected day as a gold chip (`data-[selected-single=true]:bg-primary text-primary-foreground`); the `day_button` override only adds the semibold weight and the app's gold glow.
- `classNames` entries REPLACE the calendar's defaults for that key (they're spread last), which is why `caption_label` restates `cn-calendar-caption` and `weekday` restates `flex-1`.
- `[--cell-size:--spacing(9)]` bumps day cells from the registry's 28px to the spec's 36px (`size-9`).
- `today` drops the registry's `bg-muted` in favor of the spec's gold text + dot; the dot hides when today is also the selected chip.
- `surface` is the app's elevated-card utility from `src/App.css` (light wash + card green + token border); `ring-0` removes the popover's default `ring-1 ring-foreground/10` so the border isn't doubled.
- `defaultMonth` is evaluated on mount and `PopoverContent` unmounts when closed, so reopening always lands on the current value's month (or today's).

- [ ] **Step 2: Verify build and lint pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm run build && npm run lint
```

Expected: both complete with no errors. (No component unit test — the repo has no jsdom/react test setup; behavior is verified visually in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/components/date-picker.tsx
git commit -m "feat: themed DatePicker with desktop calendar popover"
```

---

### Task 4: Swap the four call sites

**Files:**
- Modify: `src/features/assets/components/entry-form.tsx:50`
- Modify: `src/features/portfolio/components/holding-form.tsx:136`
- Modify: `src/features/history/components/amend-dialog.tsx:76-77`
- Modify: `src/features/settings/components/close-month-card.tsx:92`

**Interfaces:**
- Consumes: `DatePicker` from `@/components/date-picker` (Task 3).
- Produces: nothing new — behavior-preserving swap. Every file keeps its existing `Input` import (all four still use `Input` for other fields).

- [ ] **Step 1: entry-form.tsx**

Add to the imports:

```tsx
import { DatePicker } from "@/components/date-picker";
```

Replace:

```tsx
            <Input id="entry-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
```

with:

```tsx
            <DatePicker id="entry-asof" value={asOf} onChange={setAsOf} />
```

- [ ] **Step 2: holding-form.tsx**

Add to the imports:

```tsx
import { DatePicker } from "@/components/date-picker";
```

Replace:

```tsx
            <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
```

with:

```tsx
            <DatePicker id="asOf" value={asOf} onChange={setAsOf} />
```

- [ ] **Step 3: amend-dialog.tsx**

Add to the imports:

```tsx
import { DatePicker } from "@/components/date-picker";
```

Replace:

```tsx
            <Input id="amend-date" type="date" value={doc.snapshotDate}
              onChange={(e) => setDoc((d) => ({ ...d, snapshotDate: e.target.value }))} />
```

with:

```tsx
            <DatePicker id="amend-date" value={doc.snapshotDate}
              onChange={(v) => setDoc((d) => ({ ...d, snapshotDate: v }))} />
```

- [ ] **Step 4: close-month-card.tsx**

Add to the imports:

```tsx
import { DatePicker } from "@/components/date-picker";
```

Replace:

```tsx
          <Input id="close-date" type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
```

with:

```tsx
          <DatePicker id="close-date" value={snapshotDate} onChange={setSnapshotDate} />
```

- [ ] **Step 5: Verify build, lint, and tests pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm run build && npm run lint && npm test
```

Expected: all pass. Lint would catch a now-unused `Input` import — there should be none (each file still uses `Input` for name/quantity/fx fields).

- [ ] **Step 6: Commit**

```bash
git add src/features/assets/components/entry-form.tsx src/features/portfolio/components/holding-form.tsx src/features/history/components/amend-dialog.tsx src/features/settings/components/close-month-card.tsx
git commit -m "feat: use DatePicker for all date fields"
```

---

### Task 5: Visual verification against the design bar

**Files:**
- Create (scratchpad only, not committed): a playwright screenshot script in the session scratchpad directory

**Interfaces:**
- Consumes: the running app with Tasks 1–4 applied.
- Produces: desktop + mobile screenshots confirming the spec's visual section; any polish fixes found.

- [ ] **Step 1: Start the dev server**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm run dev
```

Run in the background. Web on :5173, API on :8787. Local auth is disabled unless `APP_PASSWORD`/`SESSION_TOKEN` env are set — don't set them.

- [ ] **Step 2: Screenshot the picker (desktop)**

`chromium-cli` is not on this machine; use playwright-core with system Chrome. In the scratchpad directory:

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm install playwright-core
```

Then a script along these lines (adjust selectors to what the page actually renders):

```js
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5173/");
// Navigate to the assets page and open the "Add" entry dialog for a savings section.
await page.getByRole("button", { name: /add/i }).first().click();
// Open the calendar popover.
await page.locator("#entry-asof").click();
await page.waitForTimeout(300);
await page.screenshot({ path: "datepicker-desktop.png" });
await browser.close();
```

- [ ] **Step 3: Check the screenshot against the spec's visual section**

Verify every item, comparing overall feel against the reference mocks in `screenshots/`:
- Trigger looks identical to the neighboring inputs (height, radius, border, background) and shows muted "Pick a date" when empty / "11 Jul 2026"-style text when set.
- Popover panel reads as an app card: #132420 green with soft wash, rounded-2xl, token border — no white, no double border.
- Month caption is Sora semibold; chevrons are ghost buttons.
- Weekday row is small sage caps; week starts Monday.
- Selected day is a solid gold chip with semibold numeral and subtle glow; today shows gold text + dot beneath; outside-month days are faint.
- Day cells are 36px with `bg-secondary/60`-style hover.

If anything is off, fix it in `src/components/date-picker.tsx` (not the generated ui files) and re-screenshot.

- [ ] **Step 4: Verify mobile keeps the native input**

Re-run the script with `viewport: { width: 375, height: 812 }`. The form opens in the bottom drawer; assert the date field is a native input:

```js
await page.locator('input[type="date"]#entry-asof').waitFor();
```

Expected: the locator resolves (native input rendered below 640px).

- [ ] **Step 5: Commit any polish fixes**

```bash
git add -A src/
git commit -m "fix: date picker visual polish from screenshot review"
```

Only commit if Step 3/4 required changes; otherwise skip.
