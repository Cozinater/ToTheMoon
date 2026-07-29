# Portfolio Cash Asset Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the portfolio hold **cash** — readily deployable USD in a brokerage account — as a fourth asset type, while the portfolio page presents it as dry powder rather than as a strategy allocation.

**Architecture:** `"cash"` is added to `assetTypeSchema`, so a cash line is an ordinary `Holding` (`ticker` = short label, `quantity` = `valueUsd` = USD amount, `priceUsd` = 1, no `strategy`). That means the portfolio total, net worth, monthly snapshots, amend and the store need no changes. A new `quotableTypeSchema` (the enum minus `cash`) guards `/api/quote` so cash can never reach a price provider. On the page, `strategyMix` excludes cash and denominates on invested value, and cash appears as its own neutral chip.

**Tech Stack:** React 19 + TypeScript + Vite, TanStack Router/Query/Table, Zod 4, Hono (server), Vitest, Tailwind v4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-29-portfolio-cash-type-design.md` (commit `6937e3e`, branch `feat/portfolio-cash-type`). Read it with:
`git show feat/portfolio-cash-type:docs/superpowers/specs/2026-07-29-portfolio-cash-type-design.md`

---

## Global Constraints

- **Branch:** `feat/portfolio-cash-type`. This checkout is **shared with a concurrent session** — Raymond may switch branches or merge underneath you. Re-check `git branch --show-current` **in the same command as every commit** (each commit step below does this). Never merge, push, rebase or force-update a branch; leave integration to Raymond.
- **`node`/`npm` are not on PATH** in non-interactive shells. Prefix every command that runs node tooling with:
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"`
- **Verification trio** (all three must pass before every commit): `npm test`, `npm run build` (this is `tsc -b && vite build` — the only typecheck), `npm run lint`. **Note that `npx vitest run` does not typecheck**, so a green test run alone never justifies a commit.
- **Vitest environment is `node`** with includes `shared/**/*.test.ts`, `server/**/*.test.ts`, `src/**/*.test.ts` (see `vite.config.ts`). There is **no jsdom and no React testing library** — do **not** write component tests. `.tsx` files are never test files. UI correctness is covered by `npm run build` + `npm run lint` + the manual check named in each UI task.
- **Cash invariant** (every cash `Holding` must satisfy): `type: "cash"`, `priceUsd: 1`, `quantity === valueUsd === ` the USD amount, `strategy` absent.
- **Cash label cap is 12 characters** — it reuses `holdingSchema.ticker` (`z.string().min(1).max(12)`). Do not widen the schema.
- **Path aliases:** `@` → `src/`, `@shared` → `shared/` (both work in tests). Server files import shared code by relative path with an explicit `.ts` extension (e.g. `../shared/schema.ts`).
- **Commit style:** conventional prefixes as used in this repo (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `style:`, `chore:`). Every commit message ends with the `Co-Authored-By:` trailer shown in the commit steps.
- **No new dependencies.** No shadcn CLI invocations — there is no `tabs`/`toggle-group` primitive and none is to be added.
- **Do not add** a `priceUsd === 1` schema refinement, a `cashUsd` field on `totalsSchema`, per-line currency, cash strategies, or cash yield tracking. All explicitly out of scope.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `shared/schema.ts` | **Modify.** Add `"cash"` to `assetTypeSchema`; add `quotableTypeSchema`. | 1 |
| `shared/schema.test.ts` | **Modify.** Cash holding parses; `quotableTypeSchema` rejects cash. | 1 |
| `server/market.ts` | **Modify.** Narrow every `AssetType` to `QuotableType`. | 1 |
| `server/app.ts` | **Modify.** Validate `/api/quote` types with `quotableTypeSchema`. | 1 |
| `server/app.test.ts` | **Modify.** `type=cash` and `SYM:cash` return 400. | 1 |
| `src/features/portfolio/lib/cash.ts` | **Create** (T1) then **extend** (T2). Cash predicates, then `splitCash`. | 1, 2 |
| `src/features/portfolio/lib/cash.test.ts` | **Create** (T1) then **extend** (T2). | 1, 2 |
| `src/features/portfolio/types.ts` | **Modify.** `Quote.type` / `SearchResult.type` → `QuotableType`. | 1 |
| `src/features/portfolio/components/instrument-combobox.tsx` | **Modify.** `Record<QuotableType, …>` (else the build breaks). | 1 |
| `src/features/portfolio/components/holding-form.tsx` | **Modify** (T1, keep building) → **shell** (T6) → **+ toggle** (T7). | 1, 6, 7 |
| `src/features/portfolio/lib/strategy-mix.ts` | **Modify.** Exclude cash; shares denominate on invested value. | 3 |
| `src/features/portfolio/lib/strategy-mix.test.ts` | **Modify.** Cash excluded; cash-only → `[]`. | 3 |
| `src/features/portfolio/components/strategy-mix-bar.tsx` | **Modify.** Invested-only count + neutral `Cash` chip after a `‖` divider. | 4 |
| `src/features/portfolio/components/holdings-table.tsx` | **Modify.** `Cash` tab; `—` for cash qty/price. | 5 |
| `src/features/portfolio/components/instrument-fields.tsx` | **Create.** Today's instrument form body, extracted verbatim. | 6 |
| `src/features/portfolio/components/cash-fields.tsx` | **Create.** Label + amount + as-of cash body. | 7 |
| `src/routes/portfolio.tsx` | **Modify.** Keep cash out of refresh; update empty state. | 8 |

**Ordering rationale — do not reorder Tasks 1 and 2.** Widening the enum makes `Record<AssetType, string>` at `instrument-combobox.tsx:7` non-exhaustive, which is a hard `tsc` error. So the enum change, the client type narrowing and the server guard must all land in the *same* commit. Conversely, no test may use a `type: "cash"` fixture before Task 1 — vitest would pass while `npm run build` failed. Task 1 therefore comes first and every task after it ends on a fully green trio.

---

### Task 1: `"cash"` in the type system, with `/api/quote` guarded

Widens the enum and, in the same commit, narrows every price-fetching path to a type that
excludes cash. One commit by necessity: the enum change alone breaks `tsc`.

**Files:**
- Modify: `shared/schema.ts:9-10`
- Modify: `shared/schema.test.ts` (imports at `:2-4`, plus two new `describe` blocks)
- Modify: `server/market.ts` (all 8 `AssetType` occurrences: `:1, :18, :26, :29, :49, :50, :64, :75, :108`)
- Modify: `server/app.ts:5-6, :168, :171, :179`
- Modify: `server/app.test.ts:2, :12`, plus a new case
- Create: `src/features/portfolio/lib/cash.ts`
- Test: `src/features/portfolio/lib/cash.test.ts`
- Modify: `src/features/portfolio/types.ts`
- Modify: `src/features/portfolio/components/instrument-combobox.tsx:4, :7, :8, :12`
- Modify: `src/features/portfolio/components/holding-form.tsx:14-15, :25-26, :44-64, :72`

**Interfaces:**
- Produces:
  - `quotableTypeSchema` — `z.ZodEnum` whose `.options === ["stock", "etf", "crypto"]`
  - `type QuotableType = "stock" | "etf" | "crypto"`
  - `isCash(h: Holding): boolean`
  - `type InstrumentHolding = Holding & { type: QuotableType }`
  - `isInstrument(h: Holding): h is InstrumentHolding`
- Consumed by: Task 2 (`isCash`), Task 3 (`isCash`), Task 5 (`isCash`), Tasks 6-7 (`isInstrument`, `InstrumentHolding`, `isCash`).

- [ ] **Step 1: Write the failing tests**

In `shared/schema.test.ts`, add `quotableTypeSchema` to the import list on lines 2-4 so it reads:

```ts
import {
  amendInputSchema, defaultSettings, draftInputSchema, emptyDraft, holdingSchema,
  quotableTypeSchema, settingsSchema,
} from "./schema.ts";
```

Then append to the end of the file:

```ts
describe("cash holdings", () => {
  const cash = () => ({
    id: crypto.randomUUID(), ticker: "IBKR USD", type: "cash" as const,
    quantity: 23000, priceUsd: 1, valueUsd: 23000, asOf: "2026-07-01",
  });

  it("accepts a cash line as an ordinary holding", () => {
    expect(holdingSchema.safeParse(cash()).success).toBe(true);
  });

  it("accepts a draft containing cash", () => {
    const parsed = draftInputSchema.parse({ ...emptyDraft(), holdings: [cash()] });
    expect(parsed.holdings[0]!.type).toBe("cash");
  });

  it("still rejects an unknown holding type", () => {
    expect(holdingSchema.safeParse({ ...cash(), type: "bond" }).success).toBe(false);
  });
});

describe("quotableTypeSchema", () => {
  it("is the asset types a price provider can quote", () => {
    expect(quotableTypeSchema.options).toEqual(["stock", "etf", "crypto"]);
  });

  it("rejects cash", () => {
    expect(quotableTypeSchema.safeParse("cash").success).toBe(false);
  });

  it.each(["stock", "etf", "crypto"])("accepts %s", (t) => {
    expect(quotableTypeSchema.safeParse(t).success).toBe(true);
  });
});
```

Create `src/features/portfolio/lib/cash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Holding } from "@shared/schema";
import { isCash, isInstrument } from "./cash";

const stock = (valueUsd: number): Holding => ({
  id: crypto.randomUUID(),
  ticker: "AAA",
  type: "stock",
  quantity: 1,
  priceUsd: valueUsd,
  valueUsd,
  asOf: "2026-07-01",
});

const cashLine = (valueUsd: number, ticker = "IBKR USD"): Holding => ({
  id: crypto.randomUUID(),
  ticker,
  type: "cash",
  quantity: valueUsd,
  priceUsd: 1,
  valueUsd,
  asOf: "2026-07-01",
});

describe("isCash", () => {
  it("distinguishes cash lines from instruments", () => {
    expect(isCash(cashLine(1))).toBe(true);
    expect(isCash(stock(1))).toBe(false);
  });
});

describe("isInstrument", () => {
  it("is the inverse of isCash", () => {
    expect(isInstrument(stock(1))).toBe(true);
    expect(isInstrument(cashLine(1))).toBe(false);
  });
});
```

In `server/app.test.ts`, change the import on line 2 from `type AssetType` to `type QuotableType`:

```ts
import { emptyDraft, type QuotableType, type Draft } from "../shared/schema.ts";
```

and line 12's mock signature:

```ts
  quoteBatch: vi.fn(async (reqs: Array<{ symbol: string; type: QuotableType }>) => ({
```

Then, inside the existing `describe("quote / fx / reset", …)` block, add:

```ts
  it("rejects cash as a quotable type", async () => {
    const app = makeApp();
    expect((await app.request("/api/quote?symbol=IBKR%20USD&type=cash")).status).toBe(400);
    expect((await app.request("/api/quote?symbols=VOO:etf,IBKR:cash")).status).toBe(400);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run shared/schema.test.ts server/app.test.ts src/features/portfolio/lib/cash.test.ts
```

Expected: FAIL on all three — `shared/schema.test.ts` errors on the missing `quotableTypeSchema` export, `cash.test.ts` cannot resolve `./cash`, and the new `app.test.ts` case fails because `type=cash` currently returns 200.

- [ ] **Step 3: Widen the enum and add the quotable type**

In `shared/schema.ts`, replace lines 9-10:

```ts
export const assetTypeSchema = z.enum(["stock", "etf", "crypto", "cash"]);
export type AssetType = z.infer<typeof assetTypeSchema>;

/**
 * The asset types a price provider can quote. Cash has no market price, so it must
 * never reach `/api/quote` or a market client — this is the type that enforces it.
 */
export const quotableTypeSchema = assetTypeSchema.exclude(["cash"]);
export type QuotableType = z.infer<typeof quotableTypeSchema>;
```

`holdingSchema` is unchanged: a cash line satisfies it already (`ticker` 1-12 chars as the label,
`quantity` positive, `priceUsd` nonnegative).

- [ ] **Step 4: Create the cash predicates**

Create `src/features/portfolio/lib/cash.ts`:

```ts
import type { Holding, QuotableType } from "@shared/schema";

/** Cash lines are dry powder, not an instrument — no ticker to quote, no strategy. */
export const isCash = (h: Holding) => h.type === "cash";

/** A holding that has a real market price — i.e. anything that is not cash. */
export type InstrumentHolding = Holding & { type: QuotableType };

/** Narrowing counterpart to `isCash`, so instrument-only code paths stay type-safe. */
export const isInstrument = (h: Holding): h is InstrumentHolding => h.type !== "cash";
```

- [ ] **Step 5: Narrow the server to `QuotableType`**

In `server/market.ts`, replace **every** occurrence of `AssetType` with `QuotableType` — 8 sites,
including the import on line 1:

```ts
import type { QuotableType } from "../shared/schema.ts";
```

The affected declarations become:

```ts
const quoteCacheKey = (symbol: string, type: QuotableType) => `Q:${type}:${symbol.toUpperCase()}`;

export type Quote = { symbol: string; type: QuotableType; priceUsd: number; asOf: string };
export type SearchResult = {
  symbol: string; name: string; type: QuotableType; exchange?: string; currency: string;
};

export interface MarketClient {
  quote(symbol: string, type: QuotableType): Promise<Quote>;
  quoteBatch(reqs: { symbol: string; type: QuotableType }[]): Promise<QuoteBatchResult>;
  fx(): Promise<Fx>;
  search(q: string): Promise<SearchResult[]>;
}
```

plus the two internal sites inside `createMarketClient` (the provider-resolving helper's `reqs`
parameter and its `const uncached: { symbol: string; type: QuotableType }[] = []`) and the
`async function quoteBatch(reqs: { symbol: string; type: QuotableType }[])` implementation
signature. Verify none remain:

```bash
grep -n "AssetType" server/market.ts   # expected: no output
```

In `server/app.ts`, change the import on lines 5-6 to bring in `quotableTypeSchema` /
`QuotableType` in place of `assetTypeSchema` / `AssetType`:

```ts
  amendInputSchema, closeInputSchema, defaultSettings, draftInputSchema,
  emptyDraft, quotableTypeSchema, settingsSchema, type QuotableType, type Snapshot,
```

Then in the `/quote` handler, line 168 becomes:

```ts
      const reqs: { symbol: string; type: QuotableType }[] = [];
```

and both validation sites (lines 171 and 179) switch schema:

```ts
        const parsedType = quotableTypeSchema.safeParse(t);
```

```ts
    const parsedType = quotableTypeSchema.safeParse(type);
```

Leave the 400 message `"symbol and type=stock|etf|crypto required"` exactly as it is — it is still
accurate. Verify no stale references:

```bash
grep -n "assetTypeSchema\|AssetType" server/app.ts   # expected: no output
```

- [ ] **Step 6: Narrow the client types**

Replace `src/features/portfolio/types.ts` in full:

```ts
import type { QuotableType } from "@shared/schema";

export type Quote = { symbol: string; type: QuotableType; priceUsd: number; asOf: string };
export type QuoteBatch = { quotes: Quote[]; failed: string[]; rateLimited: string[] };
export type FxResponse = { pair: "USD/SGD"; rate: number; asOf: string };
export type SearchResult = { symbol: string; name: string; type: QuotableType; exchange?: string; currency: string };
```

In `src/features/portfolio/components/instrument-combobox.tsx`, lines 4, 7, 8 and 12 become — this
is the change that keeps `tsc` green, since `Record<AssetType, string>` is now missing a `cash` key:

```ts
import type { QuotableType } from "@shared/schema";
```

```ts
const TYPE_LABEL: Record<QuotableType, string> = { stock: "Stock", etf: "ETF", crypto: "Crypto" };
const MANUAL_TYPES: QuotableType[] = ["stock", "etf", "crypto"];
```

```ts
  | { kind: "manual"; type: QuotableType };
```

- [ ] **Step 7: Keep `holding-form.tsx` compiling**

It no longer compiles, because `fromHolding` puts a possibly-`"cash"` type into a `QuotableType`
field. Replace the two type imports on lines 14-15:

```ts
import { round2 } from "@shared/totals";
import type { Holding, QuotableType } from "@shared/schema";
import { isInstrument, type InstrumentHolding } from "../lib/cash";
```

Lines 25-26 — `fromHolding` now takes an instrument:

```ts
const fromHolding = (h: InstrumentHolding): SearchResult =>
  ({ symbol: h.ticker, name: h.ticker, type: h.type, currency: "USD" });
```

Replace the body of the `props.open` effect (lines 44-64) so the instrument-only paths are guarded.
A cash `initial` cannot occur yet (nothing creates one until Task 7), but the guard is what makes
the file typecheck:

```ts
    if (!props.open) return;
    const instrument = props.initial && isInstrument(props.initial) ? props.initial : undefined;
    setSelected(instrument ? fromHolding(instrument) : null);
    setQuantityStr(props.initial ? String(props.initial.quantity) : "");
    setAsOf(props.initial?.asOf ?? "");
    setStrategy(props.initial?.strategy ?? "");
    initialisedRef.current = Boolean(props.initial?.strategy);
    if (instrument) {
      setQuote({
        status: "ok",
        quote: {
          symbol: instrument.ticker,
          type: instrument.type,
          priceUsd: instrument.priceUsd,
          asOf: instrument.asOf,
        },
        fxRate: undefined,
      });
    } else {
      setQuote({ status: "idle" });
    }
```

And line 72's signature:

```ts
  async function fetchQuote(symbol: string, type: QuotableType) {
```

- [ ] **Step 8: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all tests PASS (including the new cash and `quotableTypeSchema` cases), build succeeds,
lint clean.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add shared/schema.ts shared/schema.test.ts server/market.ts server/app.ts server/app.test.ts \
        src/features/portfolio/lib/cash.ts src/features/portfolio/lib/cash.test.ts \
        src/features/portfolio/types.ts \
        src/features/portfolio/components/instrument-combobox.tsx \
        src/features/portfolio/components/holding-form.tsx
git commit -F - <<'EOF'
feat: add cash asset type, guarded out of every price path

Widens assetTypeSchema with "cash" and introduces quotableTypeSchema (the enum
minus cash) so /api/quote and the market client cannot be handed something that
has no market price. Client Quote/SearchResult narrow to match.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: `splitCash` partition helper

**Files:**
- Modify: `src/features/portfolio/lib/cash.ts` (append)
- Test: `src/features/portfolio/lib/cash.test.ts` (append)

**Interfaces:**
- Consumes: `isCash` (Task 1), `round2` from `@shared/totals`.
- Produces:
  - `type CashSplit = { invested: Holding[]; cash: Holding[]; investedUsd: number; cashUsd: number }`
  - `splitCash(holdings: Holding[]): CashSplit`
- Consumed by: Task 4 (`invested`, `investedUsd`, `cashUsd`), Task 8 (`invested`).

- [ ] **Step 1: Write the failing test**

Append to `src/features/portfolio/lib/cash.test.ts`, and extend its import to
`import { isCash, isInstrument, splitCash } from "./cash";`:

```ts
describe("splitCash", () => {
  it("partitions holdings and totals each side", () => {
    const split = splitCash([stock(700), cashLine(200), stock(100)]);
    expect(split.invested.map((h) => h.valueUsd)).toEqual([700, 100]);
    expect(split.cash.map((h) => h.valueUsd)).toEqual([200]);
    expect(split.investedUsd).toBe(800);
    expect(split.cashUsd).toBe(200);
  });

  it("preserves input order within each side", () => {
    const split = splitCash([cashLine(1, "A"), cashLine(2, "B"), cashLine(3, "C")]);
    expect(split.cash.map((h) => h.ticker)).toEqual(["A", "B", "C"]);
  });

  it("returns zeroed totals for no holdings", () => {
    expect(splitCash([])).toEqual({ invested: [], cash: [], investedUsd: 0, cashUsd: 0 });
  });

  it("handles a cash-only portfolio", () => {
    const split = splitCash([cashLine(5000)]);
    expect(split.invested).toEqual([]);
    expect(split.investedUsd).toBe(0);
    expect(split.cashUsd).toBe(5000);
  });

  it("rounds each side to cents, like computeTotals", () => {
    const split = splitCash([stock(0.005), stock(0.005), cashLine(0.004)]);
    expect(split.investedUsd).toBe(0.01);
    expect(split.cashUsd).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/portfolio/lib/cash.test.ts
```

Expected: FAIL — `splitCash is not a function` (or an unresolved-export error) on all five new cases.

- [ ] **Step 3: Write the implementation**

Append to `src/features/portfolio/lib/cash.ts`, and extend its imports with
`import { round2 } from "@shared/totals";`:

```ts
export type CashSplit = {
  invested: Holding[];
  cash: Holding[];
  investedUsd: number;
  cashUsd: number;
};

/**
 * Partitions holdings into invested positions and cash lines, with each side's USD
 * total. Both totals are rounded to cents the same way `computeTotals` rounds the
 * portfolio, so the two never disagree by a fraction of a cent.
 */
export function splitCash(holdings: Holding[]): CashSplit {
  const invested: Holding[] = [];
  const cash: Holding[] = [];
  for (const h of holdings) (isCash(h) ? cash : invested).push(h);
  const total = (hs: Holding[]) => round2(hs.reduce((acc, h) => acc + h.valueUsd, 0));
  return { invested, cash, investedUsd: total(invested), cashUsd: total(cash) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/portfolio/lib/cash.test.ts
```

Expected: PASS — 7 tests (2 from Task 1, 5 new).

- [ ] **Step 5: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/features/portfolio/lib/cash.ts src/features/portfolio/lib/cash.test.ts
git commit -F - <<'EOF'
feat: add splitCash to partition cash from invested holdings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Strategy mix denominates on invested value

**Files:**
- Modify: `src/features/portfolio/lib/strategy-mix.ts`
- Test: `src/features/portfolio/lib/strategy-mix.test.ts`

**Interfaces:**
- Consumes: `isCash` from `./cash` (Task 1).
- Produces: `strategyMix(holdings, strategies?)` — same signature, but shares are now a fraction of **invested** USD value and cash never appears as a slice.

- [ ] **Step 1: Write the failing tests**

In `src/features/portfolio/lib/strategy-mix.test.ts`, add a cash fixture directly below the
existing `holding` helper:

```ts
const cashLine = (valueUsd: number, strategy?: string): Holding => ({
  id: crypto.randomUUID(),
  ticker: "IBKR USD",
  type: "cash",
  quantity: valueUsd,
  priceUsd: 1,
  valueUsd,
  asOf: "2026-07-01",
  ...(strategy ? { strategy } : {}),
});
```

and add these cases inside the existing `describe("strategyMix", …)` block:

```ts
  it("excludes cash from the slices and from the denominator", () => {
    const mix = strategyMix([holding(100, "China"), cashLine(300)], STRATEGIES);
    expect(mix).toEqual([{ label: "China", valueUsd: 100, share: 1, colorIndex: 0 }]);
  });

  it("does not collapse cash into Unassigned", () => {
    const mix = strategyMix([holding(100, "China"), cashLine(300)], STRATEGIES);
    expect(mix.map((s) => s.label)).not.toContain(UNASSIGNED);
  });

  it("ignores a strategy that somehow ended up on a cash line", () => {
    const mix = strategyMix([holding(100, "China"), cashLine(300, "China")], STRATEGIES);
    expect(mix).toEqual([{ label: "China", valueUsd: 100, share: 1, colorIndex: 0 }]);
  });

  it("returns nothing for a cash-only portfolio", () => {
    expect(strategyMix([cashLine(5000)], STRATEGIES)).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/portfolio/lib/strategy-mix.test.ts
```

Expected: FAIL — the first case returns two slices (`China` at 0.25 and `Unassigned` at 0.75), the
stray-strategy case folds 300 of cash into `China`, and the cash-only case returns a slice instead
of `[]`.

- [ ] **Step 3: Exclude cash inside `strategyMix`**

In `src/features/portfolio/lib/strategy-mix.ts`, add the import:

```ts
import { isCash } from "./cash";
```

Update the `share` field comment in `StrategySlice`:

```ts
  share: number;      // 0–1 fraction of the portfolio's INVESTED USD value
```

Replace the doc comment and the first half of the function body:

```ts
/**
 * Groups invested holdings by strategy and returns each group's share of total
 * invested USD value, heaviest first. Holdings without a strategy collapse into
 * "Unassigned" so the shares always add up to 100% of invested value.
 *
 * Cash is filtered out here rather than by callers: it is dry powder, not an
 * allocation, and letting it through would both invent an "Unassigned" slice and
 * shrink every real strategy's share. Filtering on type (not on the absence of a
 * strategy) also means a stray strategy on a cash line is ignored rather than
 * silently counted. The portfolio's cash share is a separate number — see
 * `splitCash` and `StrategyMixBar`.
 */
export function strategyMix(holdings: Holding[], strategies: string[] = []): StrategySlice[] {
  const invested = holdings.filter((h) => !isCash(h));
  const total = invested.reduce((acc, h) => acc + h.valueUsd, 0);
  if (total <= 0) return [];

  const byStrategy = new Map<string, number>();
  for (const h of invested) {
    const label = h.strategy ?? UNASSIGNED;
    byStrategy.set(label, (byStrategy.get(label) ?? 0) + h.valueUsd);
  }
```

The `return [...byStrategy]…` block below is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npx vitest run src/features/portfolio/lib/strategy-mix.test.ts
```

Expected: PASS — 10 tests, including the 6 pre-existing ones (they contain no cash, so they are
unaffected).

- [ ] **Step 5: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/features/portfolio/lib/strategy-mix.ts src/features/portfolio/lib/strategy-mix.test.ts
git commit -F - <<'EOF'
feat: denominate strategy shares on invested value, excluding cash

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Dry powder chip in the mix bar

**Files:**
- Modify: `src/features/portfolio/components/strategy-mix-bar.tsx`

**Interfaces:**
- Consumes: `splitCash` (Task 2), `strategyMix` (Task 3), `strategyTint`, `pct`.
- Produces: no exported API change — `StrategyMixBar({ holdings })`.

No unit test: this is a `.tsx` component and the suite has no DOM environment (see Global
Constraints). Verified by the trio plus the manual check in Step 3.

- [ ] **Step 1: Replace the component**

Replace `src/features/portfolio/components/strategy-mix-bar.tsx` in full:

```tsx
import { useMemo } from "react";
import { useSettings } from "@/hooks/use-settings";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Holding } from "@shared/schema";
import { splitCash } from "../lib/cash";
import { strategyMix } from "../lib/strategy-mix";
import { strategyTint } from "../lib/strategy-tint";

const LABEL_CLASS = "text-[11px] font-medium uppercase tracking-[0.14em]";

/**
 * One line under the portfolio total: each strategy's share of INVESTED USD value,
 * heaviest first, then cash as a separate dry-powder chip measured against the whole
 * portfolio.
 *
 * The two denominators differ on purpose — "of my invested money 41% is Long Term,
 * and 17.9% of the portfolio is dry powder" — so the chips are not meant to sum to
 * 100% across the divider. The cash chip stays on the neutral tint (never a
 * text-chart-* token) and sits behind a heavier divider so it cannot be misread as
 * one of the strategies.
 */
export function StrategyMixBar({ holdings }: { holdings: Holding[] }) {
  const { data: settings } = useSettings();
  const mix = useMemo(() => strategyMix(holdings, settings?.strategies), [holdings, settings]);
  const { invested, investedUsd, cashUsd } = useMemo(() => splitCash(holdings), [holdings]);
  const totalUsd = investedUsd + cashUsd;

  return (
    <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground sm:gap-x-3">
      <span>{invested.length} holdings</span>
      {mix.map((slice) => (
        <span key={slice.label} className="flex items-center gap-1.5 sm:gap-2">
          {/* Dividers only once the row fits on one line — when it wraps they'd strand a pipe at each line start. */}
          <span aria-hidden className="hidden text-border sm:inline">|</span>
          <span className={cn(LABEL_CLASS, strategyTint(slice.colorIndex).text)}>{slice.label}</span>
          <span className="tabular-nums text-foreground">{pct(slice.share)}</span>
        </span>
      ))}
      {cashUsd > 0 && totalUsd > 0 && (
        <span className="flex items-center gap-1.5 sm:gap-2">
          {/* Heavier divider: cash is outside the strategy set, not another slice of it. */}
          <span aria-hidden className="hidden text-border sm:inline">‖</span>
          <span className={cn(LABEL_CLASS, "text-muted-foreground")}>Cash</span>
          <span className="tabular-nums text-foreground">{pct(cashUsd / totalUsd)}</span>
        </span>
      )}
    </div>
  );
}
```

The cash chip's condition is independent of `mix`, so a cash-only portfolio still renders it
(`0 holdings ‖ CASH 100%`).

- [ ] **Step 2: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 3: Manual check**

Nothing can create a cash line through the UI until Task 7, so verify the **no-cash** case is
unchanged: the bar must still read `N holdings | LONG TERM …%` with no trailing chip and no stray
`‖`, and the count must still match the number of table rows.

Use `/run` or the project's normal dev flow to view `/portfolio`. If you start a dev server
yourself, use ports **5273/8788** — 5173/8787 belong to Raymond's own servers and must not be
killed.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/features/portfolio/components/strategy-mix-bar.tsx
git commit -F - <<'EOF'
feat: show cash as a dry-powder chip beside the strategy mix

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Cash tab and blank qty/price cells in the table

**Files:**
- Modify: `src/features/portfolio/components/holdings-table.tsx:12, :16-21, :74-75`

**Interfaces:**
- Consumes: `isCash` (Task 1).
- Produces: no API change. Because History (`snapshot-detail.tsx`) and the amend dialog reuse this table, both inherit the change.

No unit test (`.tsx`, no DOM environment). Verified by the trio plus the manual check in Step 3.

- [ ] **Step 1: Add the tab and the cash-aware cells**

In `src/features/portfolio/components/holdings-table.tsx`, add `isCash` beside the existing type
import on line 12:

```ts
import type { AssetType, Holding } from "@shared/schema";
import { isCash } from "../lib/cash";
```

Add the Cash tab to `TYPE_TABS` (lines 16-21):

```ts
const TYPE_TABS: { value: "all" | AssetType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stock", label: "Stocks" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
  { value: "cash", label: "Cash" },
];
```

Replace the `quantity` and `priceUsd` columns (lines 74-75). `23,000 × $1.00` is noise for cash, so
both read `—`:

```ts
      col.accessor("quantity", {
        header: "Qty",
        cell: (c) => (isCash(c.row.original)
          ? <span className="text-muted-foreground">—</span>
          : qty(c.getValue())),
      }),
      col.accessor("priceUsd", {
        header: "Price (USD)",
        cell: (c) => (isCash(c.row.original)
          ? <span className="text-muted-foreground">—</span>
          : usd(c.getValue())),
      }),
```

Leave everything else alone: the `%` column stays share-of-total (so it reconciles with the page
header), sorting still works off the raw accessor values, and `CELL_CLASS` / `colSpan` are
unaffected.

- [ ] **Step 2: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 3: Manual check**

On `/portfolio`, confirm a fifth **Cash** tab appears after Crypto and that selecting it filters to
an empty table (nothing can create cash yet). Confirm the other four tabs and the ticker filter
behave exactly as before.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/features/portfolio/components/holdings-table.tsx
git commit -F - <<'EOF'
feat: add a Cash tab and blank qty/price for cash rows

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Extract the instrument form body (pure refactor)

**No behaviour change.** `holding-form.tsx` carries quote state, FX and strategy defaults in ~190
lines; the cash body in Task 7 would push it well past what stays readable. Extract first, so Task
7's diff is additive and a reviewer can reject one without the other.

**Files:**
- Create: `src/features/portfolio/components/instrument-fields.tsx`
- Modify: `src/features/portfolio/components/holding-form.tsx` (becomes the shell)

**Interfaces:**
- Consumes: `isInstrument`, `InstrumentHolding` (Task 1).
- Produces:
  ```ts
  function InstrumentFields(props: {
    open: boolean;
    initial?: InstrumentHolding;
    onListOpenChange: (open: boolean) => void;
    onSave: (holding: Holding, fxRate?: number) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  `HoldingForm`'s own props are **unchanged** (`open`, `onOpenChange`, `initial?`, `onSave`), so
  `amend-dialog.tsx` and `portfolio.tsx` need no edits.

- [ ] **Step 1: Create `instrument-fields.tsx`**

This is the current `holding-form.tsx` with the `ResponsiveModal` wrapper removed, `listOpen` state
lifted to the shell (now the `onListOpenChange` prop), and `props.onOpenChange(false)` replaced by
`props.onClose()`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
import { api, ApiError } from "@/lib/api";
import { qty, usd } from "@/lib/format";
import { round2 } from "@shared/totals";
import type { Holding, QuotableType } from "@shared/schema";
import type { InstrumentHolding } from "../lib/cash";
import { InstrumentCombobox } from "./instrument-combobox";
import type { FxResponse, Quote, SearchResult } from "../types";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; quote: Quote; fxRate?: number }
  | { status: "error"; message: string };

const fromHolding = (h: InstrumentHolding): SearchResult =>
  ({ symbol: h.ticker, name: h.ticker, type: h.type, currency: "USD" });

/** Add/edit a priced holding: search an instrument, fetch its USD quote, pick a strategy. */
export function InstrumentFields(props: {
  open: boolean;
  initial?: InstrumentHolding;
  onListOpenChange: (open: boolean) => void;
  onSave: (holding: Holding, fxRate?: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantityStr, setQuantityStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const { data: settings } = useSettings();
  const [strategy, setStrategy] = useState("");
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!props.open) return;
    setSelected(props.initial ? fromHolding(props.initial) : null);
    setQuantityStr(props.initial ? String(props.initial.quantity) : "");
    setAsOf(props.initial?.asOf ?? "");
    setStrategy(props.initial?.strategy ?? "");
    initialisedRef.current = Boolean(props.initial?.strategy);
    if (props.initial) {
      setQuote({
        status: "ok",
        quote: {
          symbol: props.initial.ticker,
          type: props.initial.type,
          priceUsd: props.initial.priceUsd,
          asOf: props.initial.asOf,
        },
        fxRate: undefined,
      });
    } else {
      setQuote({ status: "idle" });
    }
  }, [props.open, props.initial]);

  useEffect(() => {
    if (!props.open || initialisedRef.current || !settings) return;
    const def = settings.strategies.includes("Long Term") ? "Long Term" : settings.strategies[0] ?? "";
    if (def) { setStrategy(def); initialisedRef.current = true; }
  }, [props.open, settings]);

  async function fetchQuote(symbol: string, type: QuotableType) {
    setQuote({ status: "loading" });
    try {
      const [q, fx] = await Promise.all([
        api<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`),
        api<FxResponse>("/api/fx"),
      ]);
      setQuote({ status: "ok", quote: q, fxRate: fx.rate });
      setAsOf(q.asOf); // keep the holding's as-of consistent with the fetched price's date
    } catch (err) {
      setQuote({
        status: "error",
        message: err instanceof ApiError ? err.message : "Couldn't fetch the price — try again",
      });
    }
  }

  function handleSelect(r: SearchResult | null) {
    setSelected(r);
    if (r) void fetchQuote(r.symbol, r.type);
    else setQuote({ status: "idle" });
  }

  const quantity = Number(quantityStr);
  const canSave =
    selected !== null && quote.status === "ok" && quote.quote.symbol === selected.symbol &&
    asOf !== "" && Number.isFinite(quantity) && quantity > 0;

  const strategyOptions = useMemo(() => {
    const base = settings?.strategies ?? [];
    return strategy && !base.includes(strategy) ? [...base, strategy] : base;
  }, [settings, strategy]);

  function save() {
    if (!selected || quote.status !== "ok" || !canSave) return;
    props.onSave(
      {
        id: props.initial?.id ?? crypto.randomUUID(),
        ticker: quote.quote.symbol,
        type: selected.type,
        quantity,
        priceUsd: quote.quote.priceUsd,
        valueUsd: round2(quantity * quote.quote.priceUsd),
        asOf,
        strategy: strategy || undefined,
      },
      quote.fxRate,
    );
    props.onClose();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="instrument">Instrument</Label>
        <InstrumentCombobox selected={selected} onSelect={handleSelect} onOpenChange={props.onListOpenChange} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity" type="number" inputMode="decimal" min="0" step="any" placeholder="0"
            value={quantityStr} onChange={(e) => setQuantityStr(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="asOf">As-of date</Label>
          <DatePicker id="asOf" value={asOf} onChange={setAsOf} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="strategy">Strategy</Label>
        <Select value={strategy} onValueChange={setStrategy}>
          <SelectTrigger id="strategy">
            <SelectValue placeholder="Select a strategy" />
          </SelectTrigger>
          <SelectContent>
            {strategyOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
        {quote.status === "idle" && <span className="text-muted-foreground">Search for an instrument to fetch its latest price.</span>}
        {quote.status === "loading" && <Skeleton className="h-5 w-40" />}
        {quote.status === "ok" && (
          Number.isFinite(quantity) && quantity > 0 ? (
            <span>
              {usd(quote.quote.priceUsd)}
              <span className="text-muted-foreground">{" × "}{qty(quantity)}{" = "}</span>
              <span className="font-medium">{usd(round2(quantity * quote.quote.priceUsd))}</span>
            </span>
          ) : (
            <span>{usd(quote.quote.priceUsd)}</span>
          )
        )}
        {quote.status === "error" && <span className="text-negative">{quote.message}</span>}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
        <Button onClick={save} disabled={!canSave}>Save holding</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reduce `holding-form.tsx` to the shell**

Replace `src/features/portfolio/components/holding-form.tsx` in full:

```tsx
import { useState } from "react";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Holding } from "@shared/schema";
import { isInstrument } from "../lib/cash";
import { InstrumentFields } from "./instrument-fields";

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  // Owned by the shell because it gates the modal's own Escape handling: with the
  // combobox list open, Escape should close the list, not the whole dialog.
  const [listOpen, setListOpen] = useState(false);
  const initial = props.initial;

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      onEscapeKeyDown={(e) => { if (listOpen) e.preventDefault(); }}
      title={initial ? `Edit ${initial.ticker}` : "Add holding"}
      description="Pick an instrument and we'll fetch its latest USD price."
    >
      <InstrumentFields
        open={props.open}
        initial={initial && isInstrument(initial) ? initial : undefined}
        onListOpenChange={setListOpen}
        onSave={props.onSave}
        onClose={() => props.onOpenChange(false)}
      />
    </ResponsiveModal>
  );
}
```

- [ ] **Step 3: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 4: Manual check — this is a refactor, so nothing may change**

On `/portfolio`: add a holding (search a ticker, confirm the price box populates and the
`price × qty = value` line is right), save it, edit it (combobox pre-filled, strategy preserved),
and confirm Escape with the search list open closes only the list. Then open the amend dialog from
`/history` on a closed month and confirm add/edit of a holding still works there.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/features/portfolio/components/holding-form.tsx src/features/portfolio/components/instrument-fields.tsx
git commit -F - <<'EOF'
refactor: split the instrument body out of holding-form

No behaviour change. holding-form becomes the modal shell so a second body can
be added beside the instrument one without the file growing unreadable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Cash form body and the mode toggle

**Files:**
- Create: `src/features/portfolio/components/cash-fields.tsx`
- Modify: `src/features/portfolio/components/holding-form.tsx`

**Interfaces:**
- Consumes: `isCash`, `isInstrument` (Task 1), `InstrumentFields` (Task 6), `round2`.
- Produces:
  ```ts
  function CashFields(props: {
    open: boolean;
    initial?: Holding;
    onSave: (holding: Holding) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  `HoldingForm`'s props stay unchanged, so the amend dialog gains cash editing with no edits of its own.

- [ ] **Step 1: Create `cash-fields.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { round2 } from "@shared/totals";
import type { Holding } from "@shared/schema";

/** holdingSchema.ticker caps at 12 chars, and cash reuses that field as its label. */
const LABEL_MAX = 12;

/**
 * Add/edit a cash line: readily deployable USD sitting in a brokerage account.
 * Nothing to quote, so there is no price box, no FX call and no strategy — cash is
 * dry powder, not an allocation.
 */
export function CashFields(props: {
  open: boolean;
  initial?: Holding;
  onSave: (holding: Holding) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setLabel(props.initial?.ticker ?? "");
    setAmountStr(props.initial ? String(props.initial.valueUsd) : "");
    setAsOf(props.initial?.asOf ?? "");
  }, [props.open, props.initial]);

  const amount = Number(amountStr);
  const trimmed = label.trim();
  const canSave =
    trimmed !== "" && trimmed.length <= LABEL_MAX &&
    asOf !== "" && Number.isFinite(amount) && amount > 0;

  function save() {
    if (!canSave) return;
    // USD cash: one "unit" is one dollar, so quantity, price × quantity and value agree.
    const value = round2(amount);
    props.onSave({
      id: props.initial?.id ?? crypto.randomUUID(),
      ticker: trimmed,
      type: "cash",
      quantity: value,
      priceUsd: 1,
      valueUsd: value,
      asOf,
    });
    props.onClose();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="cash-label">Label</Label>
        <Input
          id="cash-label" maxLength={LABEL_MAX} autoComplete="off" placeholder="e.g. IBKR USD"
          value={label} onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cash-amount">Amount (USD)</Label>
          <Input
            id="cash-amount" type="number" inputMode="decimal" min="0" step="any" placeholder="0"
            value={amountStr} onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cash-asOf">As-of date</Label>
          <DatePicker id="cash-asOf" value={asOf} onChange={setAsOf} />
        </div>
      </div>

      <p className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Brokerage cash only — bank balances belong under Assets.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
        <Button onClick={save} disabled={!canSave}>Save cash</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the toggle to the shell**

Replace `src/features/portfolio/components/holding-form.tsx` in full:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Holding } from "@shared/schema";
import { isCash, isInstrument } from "../lib/cash";
import { CashFields } from "./cash-fields";
import { InstrumentFields } from "./instrument-fields";

type Mode = "instrument" | "cash";

const MODES: { value: Mode; label: string }[] = [
  { value: "instrument", label: "Instrument" },
  { value: "cash", label: "Cash" },
];

const DESCRIPTION: Record<Mode, string> = {
  instrument: "Pick an instrument and we'll fetch its latest USD price.",
  cash: "Record deployable cash sitting in your brokerage account.",
};

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  // Owned by the shell because it gates the modal's own Escape handling: with the
  // combobox list open, Escape should close the list, not the whole dialog.
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("instrument");
  const initial = props.initial;

  // Editing is locked to the row's own kind — a stock never becomes cash.
  useEffect(() => {
    if (props.open) setMode(initial && isCash(initial) ? "cash" : "instrument");
  }, [props.open, initial]);

  const close = () => props.onOpenChange(false);

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      onEscapeKeyDown={(e) => { if (listOpen) e.preventDefault(); }}
      title={initial ? `Edit ${initial.ticker}` : "Add holding"}
      description={DESCRIPTION[mode]}
    >
      <div className="grid gap-4">
        {/* Two buttons rather than a new shadcn primitive — same active/inactive
            pattern as the holdings table's type tabs. Hidden when editing, since
            the mode is fixed by the row being edited. */}
        {!initial && (
          <div className="flex gap-1">
            {MODES.map((m) => (
              <Button
                key={m.value} size="sm" variant={mode === m.value ? "secondary" : "ghost"}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        )}

        {mode === "cash" ? (
          <CashFields open={props.open} initial={initial} onSave={props.onSave} onClose={close} />
        ) : (
          <InstrumentFields
            open={props.open}
            initial={initial && isInstrument(initial) ? initial : undefined}
            onListOpenChange={setListOpen}
            onSave={props.onSave}
            onClose={close}
          />
        )}
      </div>
    </ResponsiveModal>
  );
}
```

Switching mode unmounts one body and mounts the other, so each initialises from its own
`props.open` effect and no state leaks across the toggle.

- [ ] **Step 3: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 4: Manual check — the feature is now usable end to end**

On `/portfolio`, click **Add Holding**:
1. The `Instrument | Cash` toggle appears with Instrument active; the instrument flow still works.
2. Switch to **Cash** — the description changes, and the search + price box are replaced by Label /
   Amount / As-of plus the Assets hint. Save is disabled until label, a positive amount and a date
   are all present.
3. Save `IBKR USD` / `23000` / today. The row appears with type `Cash`, `—` for Qty and Price,
   `$23,000.00` value, and `—` for Strategy.
4. The page total rises by 23,000, and the mix bar gains a trailing `‖ CASH n%` chip while the
   strategy percentages **re-base upward** (they now divide by invested value only).
5. Edit the cash row — the toggle is hidden, the fields are pre-filled, and the label is capped at
   12 characters.
6. Confirm the **Cash** tab filters to just that row, and the `%` column value matches
   `23,000 ÷ total`.
7. Check `/` (dashboard) net worth moved by 23,000 × the USD/SGD rate.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/features/portfolio/components/cash-fields.tsx src/features/portfolio/components/holding-form.tsx
git commit -F - <<'EOF'
feat: add a cash body and Instrument/Cash toggle to the holding form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Keep cash out of price refreshes

**Files:**
- Modify: `src/routes/portfolio.tsx:18-22, :49, :62-67, :97, :109-115`

**Interfaces:**
- Consumes: `splitCash` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Filter cash out of the refresh**

In `src/routes/portfolio.tsx`, add the import beside the other portfolio-feature imports:

```ts
import { splitCash } from "@/features/portfolio/lib/cash";
```

Below the existing `totalUsd` line (49), derive the invested rows. Leave `totalUsd` itself exactly
as it is — it must keep summing every holding, cash included, because it is the portfolio total the
header shows:

```ts
  const totalUsd = round2(draft.holdings.reduce((acc, h) => acc + h.valueUsd, 0));
  const { invested } = splitCash(draft.holdings);
```

In `refreshPrices`, gate on the invested count and build `symbols` from invested rows only:

```ts
  async function refreshPrices() {
    if (!draft || invested.length === 0 || refreshing) return;
    setRefreshing(true);
    setNote(null);
    try {
      // Cash has no market price — never send it to /api/quote, or it comes back
      // in `failed` and reads as a broken refresh.
      const symbols = invested.map((h) => `${h.ticker}:${h.type}`).join(",");
```

The rest of the function is unchanged: the `draft.holdings.map` that applies quotes leaves cash rows
untouched, because no returned quote matches them.

Update the Refresh button's disabled condition (line 97) — a cash-only portfolio has nothing to
refresh:

```tsx
            <Button variant="outline" onClick={refreshPrices} disabled={invested.length === 0 || refreshing}>
```

- [ ] **Step 2: Update the empty state**

Replace the `hint` on the `EmptyState` (line 113) so cash is discoverable from an empty portfolio,
without implying cash gets a fetched price:

```tsx
          hint="Add a stock, ETF or crypto holding and we'll fetch its latest USD price — or record the cash you have ready to deploy."
```

- [ ] **Step 3: Run the full verification trio**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
```

Expected: all PASS.

- [ ] **Step 4: Manual check**

1. With cash **and** instruments present, click **Refresh prices**: instrument prices/as-of dates
   update, the cash row's value and as-of are untouched, and no note mentions the cash label under
   "Couldn't refresh".
2. Delete every instrument so only cash remains: **Refresh prices** is disabled, and the mix bar
   reads `0 holdings ‖ CASH 100%`.
3. Delete the cash row too: the empty state shows the new hint.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # MUST print feat/portfolio-cash-type — stop and report if not
git add src/routes/portfolio.tsx
git commit -F - <<'EOF'
feat: exclude cash from price refreshes and mention it in the empty state

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Final verification

- [ ] **Full suite, build and lint from a clean tree**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm test && npm run build && npm run lint
git status --short   # expected: empty
```

- [ ] **Confirm cash cannot reach a price provider**

```bash
grep -rn "AssetType" server/ | grep -v "\.test\.ts"   # expected: no output
```

Every server price path is typed `QuotableType`, so this returning nothing is the check that the
guard is complete.

- [ ] **Close a month with cash present, then confirm history**

On `/settings`, close the month. Then on `/history`, open the new snapshot: the cash row must appear
in the table with `—` for Qty and Price, and the snapshot's portfolio total must include the cash.
Open **Amend** on it and confirm the cash row can be edited (the form opens in cash mode with the
toggle hidden) and deleted.

This is the end-to-end proof that reusing `Holding` gave snapshots and amend cash support with no
schema work.

- [ ] **Report to Raymond, do not merge**

Summarise what shipped and leave integration to him — this checkout is shared, and merging or
pushing a branch is his call.

---

## Notes for the implementer

- **Nothing in `shared/totals.ts`, `server/store.ts`, `server/file-store.ts` or
  `server/dynamo-store.ts` changes.** If you find yourself editing them, stop — a cash line is an
  ordinary `Holding`, and `computeTotals` already sums `holdings[].valueUsd`.
- **No server rebuild or deploy is part of this plan.** Server changes here are type-level only. If
  Raymond wants them live, the Lambda flow is `npm run build:lambda` then `terraform apply` — and
  **he** runs it.
- **If a step's "Expected" does not match what you see, stop and report** rather than adjusting the
  plan to fit. A surprise here usually means the shared checkout moved.
