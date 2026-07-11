# Dashboard Chart Date Range Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date-range filter (6M / 1Y / YTD / All preset pills + a Custom start/end month window) to the "Net worth over time" chart on the dashboard.

**Architecture:** Filtering is a pure function in a new `chart-range.ts` module (unit-tested with vitest). `ChartPoint` gains a sortable `month` field (`"YYYY-MM"`, `null` for the live "Now" point). `NetWorthChart` owns the range in local `useState`, renders the pill group + optional custom month inputs, and filters points before handing them to recharts. Nothing outside the chart card changes.

**Tech Stack:** React 19, TypeScript, recharts, Tailwind, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-11-chart-date-range-filter-design.md`

## Global Constraints

- `npm`/`node`/`npx` are NOT on PATH in non-interactive shells. Prefix every shell session with:
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"`
- Run all commands from the repo root: `/Users/raymond/Documents/Github/ToTheMoon`
- No new runtime dependencies.
- Months are `"YYYY-MM"` strings compared lexicographically (`>=` / `<=`) — correct for this format; do NOT add a date library.
- Code style: double quotes, semicolons, 2-space indent (match surrounding files).
- Commit messages follow repo style (`feat: …` lowercase) and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `<SCRATCHPAD>` below means the executing session's scratchpad directory (listed in the system prompt); never use `/tmp`.

---

### Task 1: Range filter logic (`chart-range.ts`)

Pure logic + tests. Also widens the vitest `include` so tests under `src/` run at all (today only `shared/**` and `server/**` are picked up).

**Files:**
- Modify: `vite.config.ts:20`
- Create: `src/features/dashboard/lib/chart-range.ts`
- Test: `src/features/dashboard/lib/chart-range.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained; generic over `{ month: string | null }` so it does not import `ChartPoint`).
- Produces (Tasks 3 imports these):
  - `type ChartRangePreset = "6m" | "1y" | "ytd" | "all"`
  - `type ChartRange = { preset: ChartRangePreset } | { start?: string; end?: string }`
  - `function addMonths(month: string, delta: number): string`
  - `function filterChartPoints<T extends { month: string | null }>(points: T[], range: ChartRange, currentMonth: string): T[]`

- [ ] **Step 1: Make vitest pick up `src/**` tests**

In `vite.config.ts`, change the `include` line inside the `test` block:

```ts
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "src/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing tests**

Create `src/features/dashboard/lib/chart-range.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addMonths, filterChartPoints, type ChartRange } from "./chart-range";

describe("addMonths", () => {
  it("subtracts within a year", () => expect(addMonths("2026-07", -5)).toBe("2026-02"));
  it("rolls back across a year boundary", () => expect(addMonths("2026-03", -11)).toBe("2025-04"));
  it("rolls back from January", () => expect(addMonths("2026-01", -1)).toBe("2025-12"));
  it("rolls forward across a year boundary", () => expect(addMonths("2025-12", 1)).toBe("2026-01"));
});

describe("filterChartPoints", () => {
  // Ascending snapshot points plus the live "Now" point (month: null), as the chart receives them.
  const points = ["2024-11", "2025-06", "2025-08", "2026-01", "2026-06", null]
    .map((month) => ({ month }));
  const CURRENT = "2026-07";
  const months = (range: ChartRange) =>
    filterChartPoints(points, range, CURRENT).map((p) => p.month);

  it("all keeps every point", () => {
    expect(months({ preset: "all" })).toEqual(["2024-11", "2025-06", "2025-08", "2026-01", "2026-06", null]);
  });

  it("6m keeps the 6 calendar months up to now, plus Now", () => {
    expect(months({ preset: "6m" })).toEqual(["2026-06", null]);   // cutoff 2026-02
  });

  it("1y keeps the 12 calendar months up to now, inclusive boundary, plus Now", () => {
    expect(months({ preset: "1y" })).toEqual(["2025-08", "2026-01", "2026-06", null]);  // cutoff 2025-08
  });

  it("ytd keeps January of the current year onward, plus Now", () => {
    expect(months({ preset: "ytd" })).toEqual(["2026-01", "2026-06", null]);  // cutoff 2026-01
  });

  it("custom is inclusive on both ends and drops Now when end is in the past", () => {
    expect(months({ start: "2025-06", end: "2026-01" })).toEqual(["2025-06", "2025-08", "2026-01"]);
  });

  it("custom keeps Now when end is the current month", () => {
    expect(months({ start: "2026-06", end: "2026-07" })).toEqual(["2026-06", null]);
  });

  it("custom with only an end is unbounded at the start", () => {
    expect(months({ end: "2025-06" })).toEqual(["2024-11", "2025-06"]);
  });

  it("custom with only a start runs through now", () => {
    expect(months({ start: "2026-06" })).toEqual(["2026-06", null]);
  });

  it("custom with no bounds keeps everything", () => {
    expect(months({})).toEqual(["2024-11", "2025-06", "2025-08", "2026-01", "2026-06", null]);
  });

  it("start after end yields an empty window", () => {
    expect(months({ start: "2026-03", end: "2025-01" })).toEqual([]);
  });

  it("a window with no snapshots yields an empty result", () => {
    expect(months({ start: "2020-01", end: "2020-12" })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/dashboard/lib/chart-range.test.ts
```
Expected: FAIL — cannot resolve `./chart-range` (module does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `src/features/dashboard/lib/chart-range.ts`:

```ts
export type ChartRangePreset = "6m" | "1y" | "ytd" | "all";
export type ChartRange = { preset: ChartRangePreset } | { start?: string; end?: string };

// Months are "YYYY-MM" strings; lexicographic comparison is chronological.
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function presetStart(preset: ChartRangePreset, currentMonth: string): string | undefined {
  switch (preset) {
    case "6m": return addMonths(currentMonth, -5);
    case "1y": return addMonths(currentMonth, -11);
    case "ytd": return `${currentMonth.slice(0, 4)}-01`;
    case "all": return undefined;
  }
}

export function filterChartPoints<T extends { month: string | null }>(
  points: T[],
  range: ChartRange,
  currentMonth: string,
): T[] {
  const start = "preset" in range ? presetStart(range.preset, currentMonth) : range.start;
  const end = "preset" in range ? undefined : range.end;
  const includeNow = end == null || end >= currentMonth;
  return points.filter((p) =>
    p.month == null
      ? includeNow
      : (start == null || p.month >= start) && (end == null || p.month <= end),
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/dashboard/lib/chart-range.test.ts
```
Expected: PASS (15 tests). Then run the full suite to confirm nothing broke:
```bash
npm test
```
Expected: PASS — existing `shared/` and `server/` tests plus the new file.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/features/dashboard/lib/chart-range.ts src/features/dashboard/lib/chart-range.test.ts
git commit -m "feat: chart date-range filter logic

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Add `month` to `ChartPoint`

Type-level plumbing so points carry a sortable month. Verified by the compiler and the existing suite (there is no React-hook test rig in this repo; the field is exercised by Task 1's generic function and consumed in Task 3).

**Files:**
- Modify: `src/features/dashboard/hooks/use-dashboard-data.ts:7-19,30-33`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 3 relies on this): `ChartPoint` gains `month: string | null` — the snapshot's `"YYYY-MM"`, or `null` for the "Now" draft point. `label` stays display-only.

- [ ] **Step 1: Add the field**

In `src/features/dashboard/hooks/use-dashboard-data.ts`, change the `ChartPoint` type and `toPoint`:

```ts
export type ChartPoint = {
  month: string | null;                    // snapshot "YYYY-MM"; null for the live "Now" point
  label: string;
  portfolio: number; savings: number; cpf: number; property: number;
  creditCards: number; loans: number;      // stored negative for the chart
  netWorth: number;
};

const toPoint = (month: string | null, label: string, t: Totals): ChartPoint => ({
  month, label,
  portfolio: t.portfolioSgd, savings: t.savingsSgd, cpf: t.cpfSgd, property: t.propertySgd,
  creditCards: -t.creditCardsSgd, loans: -t.loansSgd,
  netWorth: t.netWorthSgd,
});
```

And the two call sites inside `useDashboardData`:

```ts
  const points: ChartPoint[] = [...(snapshots.data ?? [])]
    .reverse()
    .map((s) => toPoint(s.month, monthLabel(s.month), s.totals));
  if (totals) points.push(toPoint(null, "Now", totals));
```

- [ ] **Step 2: Typecheck and test**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx tsc -b && npm test
```
Expected: tsc exits 0; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/hooks/use-dashboard-data.ts
git commit -m "feat: carry snapshot month on chart points

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Chart UI — pills, custom inputs, empty state, count fix

Rewrites `NetWorthChart` to own the range state and filter. Also fixes the snapshot count to exclude the "Now" point (today a fresh account shows "1 snapshot" with zero snapshots).

**Files:**
- Modify: `src/features/dashboard/components/net-worth-chart.tsx` (full file below)

**Interfaces:**
- Consumes: `filterChartPoints`, `ChartRange`, `ChartRangePreset` from `../lib/chart-range` (Task 1); `ChartPoint.month` (Task 2); `Input` from `@/components/ui/input`; `cn` from `@/lib/utils`.
- Produces: no API change — component still takes `{ points: ChartPoint[] }`; `src/routes/index.tsx` is untouched.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `src/features/dashboard/components/net-worth-chart.tsx` with:

```tsx
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { compactSgd, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChartPoint } from "../hooks/use-dashboard-data";
import { filterChartPoints, type ChartRange, type ChartRangePreset } from "../lib/chart-range";

const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "var(--chart-1)", stack: "pos" },
  { key: "savings", label: "Savings", color: "var(--chart-2)", stack: "pos" },
  { key: "cpf", label: "CPF", color: "var(--chart-3)", stack: "pos" },
  { key: "property", label: "Property", color: "var(--chart-4)", stack: "pos" },
  { key: "creditCards", label: "Credit Cards", color: "var(--chart-5)", stack: "neg" },
  { key: "loans", label: "Loans", color: "var(--chart-6)", stack: "neg" },
] as const;

const PRESETS: { preset: ChartRangePreset; label: string }[] = [
  { preset: "6m", label: "6M" },
  { preset: "1y", label: "1Y" },
  { preset: "ytd", label: "YTD" },
  { preset: "all", label: "All" },
];

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type TooltipEntry = { name?: string; value?: number; color?: string; payload?: ChartPoint };

function ChartTooltip(props: { active?: boolean; label?: string; payload?: TooltipEntry[] }) {
  if (!props.active || !props.payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium">{props.label}</div>
      {props.payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-6">
          <span style={{ color: p.color }}>{p.name}</span>
          <span>{sgd(p.value ?? 0)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t border-border pt-1 font-medium">
        <span>Net worth</span>
        <span>{sgd(props.payload[0]?.payload?.netWorth ?? 0)}</span>
      </div>
    </div>
  );
}

function RangePills({ range, onChange }: { range: ChartRange; onChange: (r: ChartRange) => void }) {
  const pill = (active: boolean) =>
    cn(
      "rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
      active
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
    );
  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((p) => (
        <button key={p.preset} type="button" onClick={() => onChange({ preset: p.preset })}
          className={pill("preset" in range && range.preset === p.preset)}>
          {p.label}
        </button>
      ))}
      <button type="button" onClick={() => onChange({})} className={pill(!("preset" in range))}>
        Custom
      </button>
    </div>
  );
}

function CustomRangeInputs(props: {
  range: { start?: string; end?: string };
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        From
        <Input type="month" className="h-8 w-40 scheme-dark" value={props.range.start ?? ""}
          onChange={(e) => props.onChange({ ...props.range, start: e.target.value || undefined })} />
      </label>
      <label className="flex items-center gap-2">
        To
        <Input type="month" className="h-8 w-40 scheme-dark" value={props.range.end ?? ""}
          onChange={(e) => props.onChange({ ...props.range, end: e.target.value || undefined })} />
      </label>
    </div>
  );
}

export function NetWorthChart({ points }: { points: ChartPoint[] }) {
  const [range, setRange] = useState<ChartRange>({ preset: "all" });
  const filtered = filterChartPoints(points, range, currentMonth());
  const snapshotCount = filtered.filter((p) => p.month !== null).length;

  return (
    <div className="surface rounded-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Net worth over time</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {snapshotCount} {snapshotCount === 1 ? "snapshot" : "snapshots"}
          </span>
          <RangePills range={range} onChange={setRange} />
        </div>
      </div>
      {!("preset" in range) && <CustomRangeInputs range={range} onChange={setRange} />}
      <div className="h-80 md:h-96">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No snapshots in this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.06} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="rgb(244 236 220 / 0.07)" strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9db2a4", fontSize: 12 }} />
              <YAxis tickFormatter={compactSgd} tickLine={false} axisLine={false} width={72} tick={{ fill: "#9db2a4", fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stackId={s.stack} name={s.label}
                  stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

Notes on what changed vs the old file: new imports (`useState`, `Input`, `cn`, chart-range), new `PRESETS`/`currentMonth`/`RangePills`/`CustomRangeInputs`, header right side now count + pills (wrapped in `flex-wrap` for narrow screens), custom-inputs row, `data={filtered}` instead of `data={points}`, empty-state branch, and the count excludes the Now point. `SERIES`, `ChartTooltip`, the chart body, and the legend are unchanged.

- [ ] **Step 2: Typecheck, lint, test**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx tsc -b && npm run lint && npm test
```
Expected: all three exit 0.

- [ ] **Step 3: Seed dev data for visual verification**

The API reads `.data/store.json` (gitignored) at startup only. Write this seed script to the scratchpad (adjust `<SCRATCHPAD>` to the session scratchpad directory) as `<SCRATCHPAD>/seed-store.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { computeTotals } from "/Users/raymond/Documents/Github/ToTheMoon/shared/totals.ts";

const entry = (name: string, balanceSgd: number, asOf: string) =>
  ({ id: crypto.randomUUID(), name, balanceSgd, asOf });

const months: string[] = [];
for (let y = 2025, m = 1; !(y === 2026 && m === 7); m === 12 ? (y++, m = 1) : m++) {
  months.push(`${y}-${String(m).padStart(2, "0")}`);
}
// 2025-01 .. 2026-06 — spans YTD, 1Y, and 6M boundaries for currentMonth 2026-07

const fxRate = 1.32;
const doc = (i: number, asOf: string) => ({
  holdings: [],
  assets: {
    bankSavings: [entry("DBS", 52000 + i * 1800, asOf)],
    cpf: [entry("CPF OA", 98000 + i * 1200, asOf)],
    property: [entry("HDB flat", 620000, asOf)],
  },
  liabilities: {
    creditCards: [entry("DBS Altitude", 1400 + (i % 4) * 350, asOf)],
    loans: [entry("HDB loan", 398000 - i * 1100, asOf)],
  },
});

const snapshots = months.map((month, i) => {
  const asOf = `${month}-28`;
  const d = doc(i, asOf);
  return { month, snapshotDate: asOf, fxRate, closedAt: `${asOf}T12:00:00.000Z`, ...d, totals: computeTotals(d, fxRate) };
});

const draft = { ...doc(months.length, "2026-07-10"), fxRate, updatedAt: "2026-07-10T12:00:00.000Z" };

mkdirSync("/Users/raymond/Documents/Github/ToTheMoon/.data", { recursive: true });
writeFileSync("/Users/raymond/Documents/Github/ToTheMoon/.data/store.json", JSON.stringify({ draft, snapshots }, null, 2));
console.log(`seeded ${snapshots.length} snapshots + draft`);
```

Run it, then start the dev server in the background (web :5173, api :8787 — local auth is off since APP_PASSWORD/SESSION_TOKEN are unset):
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx tsx <SCRATCHPAD>/seed-store.ts
npm run dev   # run in background
```
Expected: `seeded 18 snapshots + draft`; dev server serving on http://localhost:5173.

- [ ] **Step 4: Screenshot each range state**

No Playwright browsers are cached on this machine and `chromium-cli` is not installed; use `playwright-core` with the system Chrome (`channel: "chrome"`). In `<SCRATCHPAD>`: `npm i playwright-core`, then write `<SCRATCHPAD>/shot.mjs`:

```js
import { chromium } from "playwright-core";

const dir = new URL("./shots/", import.meta.url).pathname;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://localhost:5173/");
await page.getByText("Net worth over time").waitFor();

await page.screenshot({ path: `${dir}all.png`, fullPage: true });
for (const label of ["6M", "1Y", "YTD"]) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}${label}.png`, fullPage: true });
}
await page.getByRole("button", { name: "Custom", exact: true }).click();
await page.locator('input[type="month"]').first().fill("2025-03");
await page.locator('input[type="month"]').nth(1).fill("2025-09");
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}custom.png`, fullPage: true });
await page.locator('input[type="month"]').first().fill("2020-01");
await page.locator('input[type="month"]').nth(1).fill("2020-06");
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}empty.png`, fullPage: true });
await browser.close();
```

Run `mkdir -p <SCRATCHPAD>/shots && node <SCRATCHPAD>/shot.mjs`, then READ every screenshot and verify (counts below assume execution in July 2026, i.e. `currentMonth` = `2026-07`; if executing later, shift the expected windows accordingly):
- `all.png`: full history (18 snapshot months + Now), count says "18 snapshots", All pill active.
- `6M.png`: x-axis starts at Feb 2026, count "5 snapshots".
- `1Y.png`: x-axis starts at Aug 2025, count "11 snapshots".
- `YTD.png`: x-axis starts at Jan 2026, count "6 snapshots".
- `custom.png`: month inputs visible; x-axis Mar 2025–Sep 2025, no Now point, count "7 snapshots".
- `empty.png`: "No snapshots in this range" centered, count "0 snapshots", pills + inputs still visible.

Layout must look coherent with the rest of the dashboard (pills aligned with the title row, no overflow at 1440px). Also grab one mobile-width shot (viewport 390×844) of the default view and check the header wraps cleanly.

- [ ] **Step 5: Stop the dev server and commit**

Stop the background dev server. Then:
```bash
git add src/features/dashboard/components/net-worth-chart.tsx
git commit -m "feat: date-range filter on net worth chart

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Acceptance check (maps to spec)

1. Default load = All: full history + Now — Task 3 Step 4 `all.png`.
2. Preset windows anchored to the current calendar month, Now always kept — Task 1 tests + `6M/1Y/YTD.png`.
3. Custom inclusive bounds; Now dropped when `end < currentMonth` — Task 1 tests + `custom.png`.
4. Count reflects filtered snapshots, excluding Now — Task 3 (`snapshotCount`) + screenshots.
5. Empty window shows the message with controls usable — Task 1 tests (empty results) + `empty.png`.
6. No persistence — state is `useState` inside `NetWorthChart`, nothing written anywhere.
7. `npm test` green with the new unit tests — Tasks 1–3 test steps.
