# Dashboard Chart Category Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user show and hide individual categories on the dashboard's "Net worth over time" chart by clicking the legend, with the selection persisted in `localStorage`.

**Architecture:** A pure, node-testable module (`lib/chart-series.ts`) owns the series table and all the logic — which keys are valid, how a toggle changes the hidden list, what the visible total is. A thin hook (`hooks/use-hidden-series.ts`) is the only place that touches `localStorage`. A presentational component (`components/chart-legend.tsx`) renders the clickable chips. `net-worth-chart.tsx` wires the three together and renders only the visible `<Area>`s.

**Tech Stack:** React 19, TypeScript, Recharts 3, Tailwind 4, vitest (node environment), TanStack Router/Query (untouched here).

**Spec:** `docs/superpowers/specs/2026-08-01-chart-category-filter-design.md`

## Global Constraints

- Node/npm are not on `PATH` in non-interactive shells. Prefix every npm/node/npx command with:
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"`
- vitest runs with `environment: "node"` (see `vite.config.ts`). **No `localStorage`, `window`, or DOM globals exist in tests.** Never write a test that touches them.
- The repo has no component-test framework. Do not add one. Component behaviour is verified manually in Task 4.
- `localStorage` key is exactly `tothemoon:chart-hidden-series`. Value is a JSON array of series keys.
- Tooltip footer label is exactly `Visible total` when any category is hidden and exactly `Net worth` when none is.
- All-hidden empty-state copy is exactly `No categories selected`. The existing `No snapshots in this range` copy must not change.
- `eslint` has `react-refresh/only-export-components` **on** for `src/features/**/components/**/*.tsx`. Files under `components/` may export components only — put constants, types, and helpers in `lib/`.
- Existing behaviour that must not change: the date-range pills, the "N snapshots" count, the hero, the summary cards, the draft card, and all server code.
- Two-space indent, double-quoted strings, semicolons — match the surrounding files.
- Commit messages follow the repo's Conventional Commits style (`feat:`, `refactor:`, `test:`, `docs:`).

## File Structure

| File | Responsibility |
|---|---|
| `src/features/dashboard/lib/chart-series.ts` (new) | The `SERIES` table, `SeriesKey`, and all pure logic: `parseHiddenSeries`, `serializeHiddenSeries`, `toggleSeries`, `visibleTotal`. No React, no browser APIs. |
| `src/features/dashboard/lib/chart-series.test.ts` (new) | Unit tests for the above. |
| `src/features/dashboard/hooks/use-hidden-series.ts` (new) | The only module that reads/writes `localStorage`. Returns `[hidden, toggle]`. |
| `src/features/dashboard/components/chart-legend.tsx` (new) | Presentational clickable legend chips. |
| `src/features/dashboard/components/net-worth-chart.tsx` (modify) | Wires the above together; renders only visible areas/gradients; adds the all-hidden empty state; passes `hidden` to the tooltip. |

---

### Task 1: Pure series module

Moves the `SERIES` table out of the component into a testable lib and adds the pure logic the later tasks consume. No behaviour change — at the end of this task the app renders exactly as it does today.

**Files:**
- Create: `src/features/dashboard/lib/chart-series.ts`
- Create: `src/features/dashboard/lib/chart-series.test.ts`
- Modify: `src/features/dashboard/components/net-worth-chart.tsx:9-16` (delete the local `SERIES` const, import it instead)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SeriesKey = "portfolio" | "savings" | "cpf" | "property" | "creditCards" | "loans"`
  - `SERIES: readonly { key: SeriesKey; label: string; color: string; stack: "pos" | "neg" }[]`
  - `parseHiddenSeries(raw: string | null): SeriesKey[]`
  - `serializeHiddenSeries(hidden: SeriesKey[]): string`
  - `toggleSeries(hidden: SeriesKey[], key: SeriesKey): SeriesKey[]`
  - `visibleTotal(point: Record<SeriesKey, number>, hidden: SeriesKey[]): number`

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/lib/chart-series.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseHiddenSeries,
  serializeHiddenSeries,
  SERIES,
  toggleSeries,
  visibleTotal,
  type SeriesKey,
} from "./chart-series";

describe("SERIES", () => {
  it("lists the six chart categories in stack order", () => {
    expect(SERIES.map((s) => s.key)).toEqual([
      "portfolio", "savings", "cpf", "property", "creditCards", "loans",
    ]);
  });

  it("puts assets on the positive stack and liabilities on the negative one", () => {
    expect(SERIES.filter((s) => s.stack === "neg").map((s) => s.key)).toEqual(["creditCards", "loans"]);
  });
});

describe("parseHiddenSeries", () => {
  it("treats a missing value as nothing hidden", () => expect(parseHiddenSeries(null)).toEqual([]));
  it("treats an empty string as nothing hidden", () => expect(parseHiddenSeries("")).toEqual([]));
  it("treats malformed JSON as nothing hidden", () => expect(parseHiddenSeries("{oops")).toEqual([]));
  it("treats a non-array value as nothing hidden", () => expect(parseHiddenSeries('{"cpf":true}')).toEqual([]));

  it("keeps a valid subset", () => {
    expect(parseHiddenSeries('["cpf","creditCards"]')).toEqual(["cpf", "creditCards"]);
  });

  it("drops keys that are not chart categories", () => {
    expect(parseHiddenSeries('["cpf","bogus","netWorth"]')).toEqual(["cpf"]);
  });

  it("drops entries that are not strings", () => {
    expect(parseHiddenSeries('["cpf",7,null,{"key":"loans"}]')).toEqual(["cpf"]);
  });

  it("collapses duplicates", () => {
    expect(parseHiddenSeries('["cpf","cpf","loans"]')).toEqual(["cpf", "loans"]);
  });

  it("accepts all six keys — hiding everything is a deliberate state", () => {
    const all: SeriesKey[] = ["portfolio", "savings", "cpf", "property", "creditCards", "loans"];
    expect(parseHiddenSeries(JSON.stringify(all))).toEqual(all);
  });
});

describe("serializeHiddenSeries", () => {
  it("round-trips through parseHiddenSeries", () => {
    const hidden: SeriesKey[] = ["savings", "loans"];
    expect(parseHiddenSeries(serializeHiddenSeries(hidden))).toEqual(hidden);
  });

  it("round-trips the empty list", () => {
    expect(parseHiddenSeries(serializeHiddenSeries([]))).toEqual([]);
  });
});

describe("toggleSeries", () => {
  it("hides a visible category", () => expect(toggleSeries([], "cpf")).toEqual(["cpf"]));

  it("shows a hidden category again", () => {
    expect(toggleSeries(["cpf", "loans"], "cpf")).toEqual(["loans"]);
  });

  it("does not mutate the input", () => {
    const hidden: SeriesKey[] = ["cpf"];
    toggleSeries(hidden, "loans");
    expect(hidden).toEqual(["cpf"]);
  });
});

describe("visibleTotal", () => {
  // Liabilities are stored negated on ChartPoint, so the total is a plain sum.
  const point = {
    portfolio: 80_000, savings: 30_000, cpf: 50_000, property: 600_000,
    creditCards: -2_000, loans: -400_000,
  };
  const netWorth = 358_000;

  it("equals net worth when nothing is hidden", () => {
    expect(visibleTotal(point, [])).toBe(netWorth);
  });

  it("falls by the hidden amount when an asset is hidden", () => {
    expect(visibleTotal(point, ["cpf"])).toBe(netWorth - 50_000);
  });

  it("rises when a liability is hidden", () => {
    expect(visibleTotal(point, ["loans"])).toBe(netWorth + 400_000);
  });

  it("is zero when everything is hidden", () => {
    expect(visibleTotal(point, ["portfolio", "savings", "cpf", "property", "creditCards", "loans"])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/dashboard/lib/chart-series.test.ts
```

Expected: FAIL — `Failed to resolve import "./chart-series"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/dashboard/lib/chart-series.ts`:

```ts
export type SeriesKey = "portfolio" | "savings" | "cpf" | "property" | "creditCards" | "loans";

// Stack order matters: recharts stacks in render order, assets up and liabilities down.
export const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "var(--chart-1)", stack: "pos" },
  { key: "savings", label: "Savings", color: "var(--chart-2)", stack: "pos" },
  { key: "cpf", label: "CPF", color: "var(--chart-3)", stack: "pos" },
  { key: "property", label: "Property", color: "var(--chart-4)", stack: "pos" },
  { key: "creditCards", label: "Credit Cards", color: "var(--chart-5)", stack: "neg" },
  { key: "loans", label: "Loans", color: "var(--chart-6)", stack: "neg" },
] as const satisfies readonly { key: SeriesKey; label: string; color: string; stack: "pos" | "neg" }[];

const isSeriesKey = (v: unknown): v is SeriesKey =>
  typeof v === "string" && SERIES.some((s) => s.key === v);

// Anything we can't make sense of means "nothing hidden" — a corrupt value must never
// blank the chart.
export function parseHiddenSeries(raw: string | null): SeriesKey[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter(isSeriesKey))];
}

export const serializeHiddenSeries = (hidden: SeriesKey[]): string => JSON.stringify(hidden);

export const toggleSeries = (hidden: SeriesKey[], key: SeriesKey): SeriesKey[] =>
  hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];

// Liabilities are already negated on the chart point, so summing is enough.
export const visibleTotal = (point: Record<SeriesKey, number>, hidden: SeriesKey[]): number =>
  SERIES.reduce((sum, s) => (hidden.includes(s.key) ? sum : sum + point[s.key]), 0);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/dashboard/lib/chart-series.test.ts
```

Expected: PASS, 20 tests.

- [ ] **Step 5: Point the chart at the shared SERIES table**

In `src/features/dashboard/components/net-worth-chart.tsx`, delete the local `SERIES` const (lines 9–16) and import it. The import block at the top becomes:

```tsx
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MonthPicker } from "@/components/month-picker";
import { compactSgd, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChartPoint } from "../hooks/use-dashboard-data";
import { filterChartPoints, type ChartRange, type ChartRangePreset } from "../lib/chart-range";
import { SERIES } from "../lib/chart-series";
```

Nothing else in the file changes in this task.

- [ ] **Step 6: Verify the whole suite, lint, and typecheck are clean**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run lint && npx tsc -b
```

Expected: all pass, no output from `tsc -b`.

- [ ] **Step 7: Commit**

```bash
git add src/features/dashboard/lib/chart-series.ts src/features/dashboard/lib/chart-series.test.ts src/features/dashboard/components/net-worth-chart.tsx
git commit -m "refactor: extract chart series table and filtering logic into a lib"
```

---

### Task 2: Clickable legend, persistence, and filtered rendering

The feature becomes usable: chips toggle series, hidden series stop rendering, the choice survives a reload, and hiding everything shows a message. The tooltip footer is deliberately left alone until Task 3.

**Files:**
- Create: `src/features/dashboard/hooks/use-hidden-series.ts`
- Create: `src/features/dashboard/components/chart-legend.tsx`
- Modify: `src/features/dashboard/components/net-worth-chart.tsx` (the `NetWorthChart` function and the legend markup at lines 147–154)

**Interfaces:**
- Consumes: `SERIES`, `SeriesKey`, `parseHiddenSeries`, `serializeHiddenSeries`, `toggleSeries` from `../lib/chart-series` (Task 1).
- Produces:
  - `useHiddenSeries(): [SeriesKey[], (key: SeriesKey) => void]`
  - `<ChartLegend hidden={SeriesKey[]} onToggle={(key: SeriesKey) => void} />`

- [ ] **Step 1: Write the persistence hook**

Create `src/features/dashboard/hooks/use-hidden-series.ts`:

```ts
import { useState } from "react";
import {
  parseHiddenSeries,
  serializeHiddenSeries,
  toggleSeries,
  type SeriesKey,
} from "../lib/chart-series";

const KEY = "tothemoon:chart-hidden-series";

// Safari private mode throws on both reads and writes; a storage failure should
// cost the user their saved selection, not the dashboard.
const load = (): SeriesKey[] => {
  try {
    return parseHiddenSeries(localStorage.getItem(KEY));
  } catch {
    return [];
  }
};

const save = (hidden: SeriesKey[]) => {
  try {
    localStorage.setItem(KEY, serializeHiddenSeries(hidden));
  } catch {
    // Nothing to do — the in-memory selection still works for this session.
  }
};

export function useHiddenSeries(): [SeriesKey[], (key: SeriesKey) => void] {
  const [hidden, setHidden] = useState<SeriesKey[]>(load);
  const toggle = (key: SeriesKey) => {
    setHidden((current) => {
      const next = toggleSeries(current, key);
      save(next);
      return next;
    });
  };
  return [hidden, toggle];
}
```

Note: `useState(load)` — pass the function, don't call it. A lazy initialiser reads storage once on mount instead of on every render.

- [ ] **Step 2: Write the legend component**

Create `src/features/dashboard/components/chart-legend.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { SERIES, type SeriesKey } from "../lib/chart-series";

// Chips carry the colour key and the toggle. Hidden chips keep their slot so the
// row never reflows as you click through it.
export function ChartLegend({
  hidden,
  onToggle,
}: {
  hidden: SeriesKey[];
  onToggle: (key: SeriesKey) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-1 gap-y-1 text-xs text-muted-foreground">
      {SERIES.map((s) => {
        const visible = !hidden.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            aria-pressed={visible}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors outline-none",
              "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              !visible && "text-muted-foreground/50 line-through",
            )}
          >
            <span
              className="size-2 rounded-full border"
              style={{
                background: visible ? s.color : "transparent",
                borderColor: s.color,
              }}
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Wire both into the chart**

In `src/features/dashboard/components/net-worth-chart.tsx`:

Add to the imports:

```tsx
import { useHiddenSeries } from "../hooks/use-hidden-series";
import { ChartLegend } from "./chart-legend";
```

Replace the body of `NetWorthChart` from its first line through the closing `</div>`, so it reads:

```tsx
export function NetWorthChart({ points }: { points: ChartPoint[] }) {
  const [range, setRange] = useState<ChartRange>({ preset: "all" });
  const [hidden, toggleHidden] = useHiddenSeries();
  const filtered = filterChartPoints(points, range, currentMonth());
  const snapshotCount = filtered.filter((p) => p.month !== null).length;
  const visible = SERIES.filter((s) => !hidden.includes(s.key));

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
        {filtered.length === 0 || visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {filtered.length === 0 ? "No snapshots in this range" : "No categories selected"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                {visible.map((s) => (
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
              {visible.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stackId={s.stack} name={s.label}
                  stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <ChartLegend hidden={hidden} onToggle={toggleHidden} />
    </div>
  );
}
```

Three things changed: `visible` replaces `SERIES` in the `<defs>` and `<Area>` loops, the empty-state condition now covers all-hidden with range taking precedence, and the inline legend markup is replaced by `<ChartLegend>`.

- [ ] **Step 4: Verify the suite, lint, and typecheck are clean**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run lint && npx tsc -b
```

Expected: all pass. `npm run lint` in particular confirms `chart-legend.tsx` satisfies `react-refresh/only-export-components` (it exports only the component).

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/hooks/use-hidden-series.ts src/features/dashboard/components/chart-legend.tsx src/features/dashboard/components/net-worth-chart.tsx
git commit -m "feat: toggle chart categories from the legend and remember the choice"
```

---

### Task 3: Visible-only tooltip total

The tooltip's footer switches from the true net worth to the sum of what's on screen while anything is hidden.

**Files:**
- Modify: `src/features/dashboard/components/net-worth-chart.tsx:32-49` (the `ChartTooltip` function) and its `<Tooltip>` usage

**Interfaces:**
- Consumes: `visibleTotal`, `SeriesKey` from `../lib/chart-series` (Task 1); `hidden` from `useHiddenSeries` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Give the tooltip the hidden list**

In `src/features/dashboard/components/net-worth-chart.tsx`, extend the `chart-series` import to:

```tsx
import { SERIES, visibleTotal, type SeriesKey } from "../lib/chart-series";
```

Replace the `ChartTooltip` function (lines 32–49) with:

```tsx
function ChartTooltip(props: {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
  hidden?: SeriesKey[];
}) {
  if (!props.active || !props.payload?.length) return null;
  const point = props.payload[0]?.payload;
  const hidden = props.hidden ?? [];
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
        <span>{hidden.length > 0 ? "Visible total" : "Net worth"}</span>
        <span>{sgd(point ? visibleTotal(point, hidden) : 0)}</span>
      </div>
    </div>
  );
}
```

`hidden` is optional with a `[]` default so the component still type-checks if recharts renders it without the injected prop.

- [ ] **Step 2: Pass `hidden` at the call site**

In the same file, change the `<Tooltip>` line inside `<AreaChart>` from `content={<ChartTooltip />}` to:

```tsx
<Tooltip content={<ChartTooltip hidden={hidden} />} />
```

Recharts clones the element and injects `active`, `label`, and `payload` alongside the props already on it.

- [ ] **Step 3: Verify the suite, lint, and typecheck are clean**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run lint && npx tsc -b
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/dashboard/components/net-worth-chart.tsx
git commit -m "feat: total only the visible categories in the chart tooltip"
```

---

### Task 4: Manual verification against the acceptance criteria

The repo has no component tests, so the interaction, the persistence, and the visual treatment are confirmed in a real browser. This is the task that proves the feature, not a formality.

**Files:**
- No source changes expected. If a defect is found, fix it here and note the fix in the commit.

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: nothing.

- [ ] **Step 1: Protect the existing local data**

`.data/store.json` is gitignored local state that Raymond's own dev server reads. Back it up before seeding and restore it in Step 3:

```bash
cp .data/store.json .data/store.json.bak 2>/dev/null && echo "backed up" || echo "no existing store, nothing to back up"
```

- [ ] **Step 2: Start dev servers without disturbing Raymond's**

Check whether ports 5173/8787 are already taken:

```bash
lsof -nP -iTCP:5173 -iTCP:8787 -sTCP:LISTEN
```

If **nothing is listening**, just use `npm run dev` (web :5173, api :8787).

If **either port is held**, those are Raymond's long-running servers — **never kill them**, and never point a fresh web server at his stale API. Instead create two temporary untracked files and delete them in Step 3:

- `server/dev-verify.ts` — a copy of `server/dev.ts` with the port changed to 8788.
- `vite.verify.config.ts` — spreads the base config and overrides
  `server: { port: 5273, strictPort: true, proxy: { "/api": "http://localhost:8788" } }`.

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx tsx server/dev-verify.ts &
npx vite --config vite.verify.config.ts
```

Local API auth is off unless `APP_PASSWORD` and `SESSION_TOKEN` are set, so no login step is needed.

- [ ] **Step 3: Seed realistic data**

Write a tsx script that builds `.data/store.json` (shape `{draft, snapshots}` per `shared/schema.ts`) using `computeTotals` from `shared/totals.ts`. It needs at least three snapshots plus a draft, with a **non-zero value in every one of the six categories** — otherwise a hidden category is indistinguishable from an empty one.

Restart the API process after writing the file; it reads `.data/store.json` only at startup.

- [ ] **Step 4: Screenshot and check each acceptance criterion**

Use `playwright-core` from the scratchpad with `chromium.launch({ channel: "chrome", headless: true })` — `chromium-cli` is not installed, and no Playwright browsers are cached, so the system Chrome channel is required. Capture desktop and mobile widths and compare against the reference mocks in `screenshots/`.

Walk the spec's acceptance criteria in order:

1. Click each chip in turn — the series disappears; click again — it returns. All six visible on a first visit (clear `localStorage` first).
2. A hidden chip shows a hollow dot, dimmed struck-through text, and `aria-pressed="false"`. Tab through the chips and confirm the focus ring appears and Enter/Space toggles.
3. Hover a data point with two categories hidden: only visible categories are listed, the footer reads `Visible total`, and it equals the sum of the listed rows. Show all six: the footer reads `Net worth` and matches the hero figure.
4. Stacking and the Y axis rescale to the visible series.
5. Hide all six → `No categories selected`. Then set a custom range with no snapshots while categories are hidden → `No snapshots in this range` wins.
6. Reload with two categories hidden → still hidden. Then in devtools set the stored value to `"not json"` and reload → all six visible, no console error. Repeat with `'["cpf","bogus"]'` → only CPF hidden.
7. The range pills, the snapshot count, the hero, and the summary cards behave as before.

- [ ] **Step 5: Tear down**

Stop only the dev servers this task started — leave Raymond's 5173/8787 servers running. Then:

```bash
rm -f server/dev-verify.ts vite.verify.config.ts
mv .data/store.json.bak .data/store.json 2>/dev/null && echo "restored" || rm -f .data/store.json
git status --porcelain   # must show no stray untracked files
```

- [ ] **Step 6: Final green check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run lint && npm run build
```

Expected: all pass. Report the actual output — do not claim completion without it.

- [ ] **Step 7: Commit any fixes**

Only if Step 4 turned up defects:

```bash
git add -A
git commit -m "fix: <what the manual pass turned up>"
```

---

## Notes for the implementer

- **Why `hidden` is an array, not a `Set`:** six items make lookup cost irrelevant, and an array serialises straight to JSON and compares cleanly as React state.
- **Why liabilities sum rather than subtract:** `toPoint` in `use-dashboard-data.ts` already stores `creditCards` and `loans` negated for the chart's negative stack, so `visibleTotal` is a plain sum. Do not add sign handling.
- **Why no test for the hook or the legend:** vitest runs in the `node` environment with no DOM and the repo has no component-test framework. Adding one is out of scope for this plan. All the logic worth testing was deliberately pushed into `chart-series.ts`.
- **Out of scope** (from the spec): filtering the hero, summary cards, or draft card; breaking Portfolio down by strategy; URL/shareable filter state; cross-tab `storage` sync; isolate-on-double-click; reordering or recolouring series.
