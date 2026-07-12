# Instrument Search Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text ticker + Type select + "Fetch price" button in the Add-holding dialog with a search combobox that resolves real instruments (equities via Twelve Data, crypto via CoinGecko) and auto-fetches the price on selection.

**Architecture:** New `GET /api/search?q=` merges Twelve Data `symbol_search` and CoinGecko `/search` in the market client (exact-symbol matches first, cap 8, partial results if one source fails). The client gains an `InstrumentCombobox` component; `HoldingForm` selection locks symbol+type and immediately calls the existing `/api/quote`. Spec: `docs/superpowers/specs/2026-07-11-instrument-search-picker-design.md`.

**Tech Stack:** Hono + zod (server), Vitest (server tests), React 19 + TanStack (client), Playwright + system Chrome for browser verification. No new dependencies.

## Global Constraints

- Prefix every shell command with `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"` (nvm node is not on PATH in non-interactive shells). Run all commands from the repo root.
- Coverage is **USD-quoted listings on any exchange**: non-USD results are returned by the API (with their `currency`) and rendered disabled client-side. Never filter them server-side.
- Search results capped at **8**; client debounce **300 ms**; client minimum query **2 chars**; server accepts `q` of 1–24 chars (trimmed).
- Copy (exact strings): disabled-row note `USD listings only`; fallback row prefix `Use "<SYMBOL>" as`; search-failure server message `Search unavailable — try again`.
- Follow existing file style: double quotes, 2-space indent, `.ts` extensions in server imports.
- The repo has pre-existing lint errors (`react-hooks/set-state-in-effect`, route-file `only-export-components`, etc.). Do not add NEW lint errors: in the combobox, never call `setState` synchronously in an effect body — only inside the debounce timeout callback or event handlers.
- Existing tests must keep passing: `npm test` runs 5 files / 46 tests today.

---

### Task 1: Twelve Data symbol search (`tdSymbolSearch`)

**Files:**
- Modify: `server/twelve-data.ts` (append at end)
- Test: `server/market.test.ts` (append at end)

**Interfaces:**
- Consumes: existing `get(path, params, key)` helper in `twelve-data.ts`; existing `stubFetch`/`json` helpers in `market.test.ts`.
- Produces: `tdSymbolSearch(key: string, q: string): Promise<EquitySearchHit[]>` with `EquitySearchHit = { symbol: string; name: string; type: "stock" | "etf"; exchange: string; currency: string }`. Task 3 merges these into `SearchResult`s.

- [ ] **Step 1: Write the failing test**

Append to `server/market.test.ts` (add `tdSymbolSearch` to a new import line at the top: `import { tdSymbolSearch } from "./twelve-data.ts";`):

```ts
describe("symbol search (Twelve Data)", () => {
  it("maps instrument types and keeps non-USD currency", async () => {
    stubFetch({
      "/symbol_search?symbol=VO": { status: "ok", data: [
        { symbol: "VOO", instrument_name: "Vanguard S&P 500 ETF", instrument_type: "ETF", exchange: "NYSE", currency: "USD" },
        { symbol: "VOD", instrument_name: "Vodafone Group Plc", instrument_type: "Common Stock", exchange: "LSE", currency: "GBp" },
      ] },
    });
    expect(await tdSymbolSearch("test-key", "VO")).toEqual([
      { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "etf", exchange: "NYSE", currency: "USD" },
      { symbol: "VOD", name: "Vodafone Group Plc", type: "stock", exchange: "LSE", currency: "GBp" },
    ]);
  });

  it("returns [] when the payload has no data array", async () => {
    stubFetch({ "/symbol_search?symbol=ZZZZ": { status: "ok" } });
    expect(await tdSymbolSearch("test-key", "ZZZZ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/market.test.ts`
Expected: FAIL — `tdSymbolSearch` is not exported from `./twelve-data.ts`.

- [ ] **Step 3: Write minimal implementation**

Append to `server/twelve-data.ts`:

```ts
export type EquitySearchHit = {
  symbol: string; name: string; type: "stock" | "etf"; exchange: string; currency: string;
};

type SymbolSearchPayload = {
  data?: { symbol?: string; instrument_name?: string; instrument_type?: string;
    exchange?: string; currency?: string }[];
};

/** symbol_search is a credit-free utility endpoint on the free tier. */
export async function tdSymbolSearch(key: string, q: string): Promise<EquitySearchHit[]> {
  const body = await get("/symbol_search", { symbol: q, outputsize: "8" }, key) as SymbolSearchPayload;
  return (body.data ?? [])
    .filter((d) => d.symbol && d.instrument_name)
    .map((d) => ({
      symbol: d.symbol!.toUpperCase(),
      name: d.instrument_name!,
      type: d.instrument_type === "ETF" ? "etf" as const : "stock" as const,
      exchange: d.exchange ?? "",
      currency: d.currency ?? "USD",
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/market.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add server/twelve-data.ts server/market.test.ts
git commit -m "feat: twelve data symbol search"
```

---

### Task 2: CoinGecko search (`cgSearch`)

**Files:**
- Modify: `server/coingecko.ts` (append at end)
- Test: `server/market.test.ts` (append at end)

**Interfaces:**
- Consumes: existing `get(path)` helper in `coingecko.ts`.
- Produces: `cgSearch(q: string): Promise<CryptoSearchHit[]>` with `CryptoSearchHit = { symbol: string; name: string }`. Task 3 stamps `type: "crypto"` and `currency: "USD"` onto these.

- [ ] **Step 1: Write the failing test**

Append to `server/market.test.ts` (add import: `import { cgSearch } from "./coingecko.ts";`):

```ts
describe("crypto search (CoinGecko)", () => {
  it("maps coins to upper-case symbol and name", async () => {
    stubFetch({ "/search?query=bitc": { coins: [
      { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
      { id: "bitcoin-cash", symbol: "bch", name: "Bitcoin Cash" },
    ] } });
    expect(await cgSearch("bitc")).toEqual([
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "BCH", name: "Bitcoin Cash" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/market.test.ts`
Expected: FAIL — `cgSearch` is not exported from `./coingecko.ts`.

- [ ] **Step 3: Write minimal implementation**

Append to `server/coingecko.ts`:

```ts
export type CryptoSearchHit = { symbol: string; name: string };

export async function cgSearch(q: string): Promise<CryptoSearchHit[]> {
  const body = await get(`/search?query=${encodeURIComponent(q)}`) as
    { coins: { symbol: string; name: string }[] };
  return body.coins.slice(0, 8).map((c) => ({ symbol: c.symbol.toUpperCase(), name: c.name }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/market.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/coingecko.ts server/market.test.ts
git commit -m "feat: coingecko symbol search"
```

---

### Task 3: Merge policy — `MarketClient.search`

**Files:**
- Modify: `server/market.ts`
- Modify: `server/app.test.ts:10-18` (the `stubMarket` helper must satisfy the widened interface)
- Test: `server/market.test.ts` (append at end)

**Interfaces:**
- Consumes: `tdSymbolSearch` (Task 1), `cgSearch` (Task 2).
- Produces: `SearchResult = { symbol: string; name: string; type: AssetType; exchange?: string; currency: string }` exported from `server/market.ts`, and `search(q: string): Promise<SearchResult[]>` on the `MarketClient` interface. Task 4's route and test stub call exactly this.

- [ ] **Step 1: Write the failing tests**

Append to `server/market.test.ts`:

```ts
describe("search", () => {
  it("merges equities and crypto, exact symbol matches first", async () => {
    stubFetch({
      "/symbol_search?symbol=UNI": { status: "ok", data: [
        { symbol: "UNIT", instrument_name: "Uniti Group", instrument_type: "Common Stock", exchange: "NASDAQ", currency: "USD" },
        { symbol: "UNI", instrument_name: "Universal Corp", instrument_type: "Common Stock", exchange: "NYSE", currency: "USD" },
      ] },
      "/search?query=UNI": { coins: [{ id: "uniswap", symbol: "uni", name: "Uniswap" }] },
    });
    const results = await client().search("UNI");
    expect(results.map((r) => `${r.symbol}:${r.type}`)).toEqual(
      ["UNI:stock", "UNI:crypto", "UNIT:stock"]);
  });

  it("returns partial results when one source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/symbol_search")) throw new Error("network down");
      if (u.includes("/search?query=BTC")) return json({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] });
      throw new Error(`unexpected fetch: ${u}`);
    }));
    expect(await client().search("BTC")).toEqual(
      [{ symbol: "BTC", name: "Bitcoin", type: "crypto", currency: "USD" }]);
  });

  it("throws UPSTREAM when both sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(client().search("BTC")).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/market.test.ts`
Expected: FAIL — `search` does not exist on the market client.

- [ ] **Step 3: Implement**

In `server/market.ts`:

1. Change the coingecko import to `import { cgQuotes, cgSearch } from "./coingecko.ts";` and the twelve-data import to `import { tdEodBatch, tdFx, tdSymbolSearch } from "./twelve-data.ts";`
2. Below the `Fx` type add:

```ts
export type SearchResult = {
  symbol: string; name: string; type: AssetType; exchange?: string; currency: string;
};
```

3. Add to the `MarketClient` interface:

```ts
  search(q: string): Promise<SearchResult[]>;
```

4. Inside `createMarketClient`, add the function and return it (`return { quoteBatch, search, ... }`):

```ts
  async function search(q: string): Promise<SearchResult[]> {
    const upper = q.trim().toUpperCase();
    const [equities, cryptos] = await Promise.allSettled([
      tdSymbolSearch(twelveDataKey, q),
      cgSearch(q),
    ]);
    if (equities.status === "rejected" && cryptos.status === "rejected") {
      throw new MarketError("UPSTREAM", "Search unavailable — try again");
    }
    const eq: SearchResult[] = equities.status === "fulfilled" ? equities.value : [];
    const cg: SearchResult[] = (cryptos.status === "fulfilled" ? cryptos.value : [])
      .map((h) => ({ ...h, type: "crypto" as const, currency: "USD" }));
    const exact = (r: SearchResult) => r.symbol === upper;
    return [
      ...eq.filter(exact), ...cg.filter(exact),
      ...eq.filter((r) => !exact(r)), ...cg.filter((r) => !exact(r)),
    ].slice(0, 8);
  }
```

5. In `server/app.test.ts`, add one line to the `stubMarket` object (before `...over`):

```ts
  search: vi.fn(async () => []),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/market.test.ts server/app.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add server/market.ts server/market.test.ts server/app.test.ts
git commit -m "feat: market client search with merge policy"
```

---

### Task 4: `GET /api/search` route

**Files:**
- Modify: `server/app.ts` (route next to the existing `/quote` route, `server/app.ts:134`)
- Test: `server/app.test.ts` (append at end)

**Interfaces:**
- Consumes: `market.search(q)` from Task 3; existing `invalid(c, issues)` helper and `MarketError` → 502 mapping in `app.onError`.
- Produces: `GET /api/search?q=` returning `{ results: SearchResult[] }`; 400 `VALIDATION` for bad `q`; 502 for upstream failure. Task 5's client types mirror this shape.

- [ ] **Step 1: Write the failing tests**

Append to `server/app.test.ts`:

```ts
describe("search", () => {
  it("returns results from the market client", async () => {
    const results = [{ symbol: "MSFT", name: "Microsoft Corporation", type: "stock" as const,
      exchange: "NASDAQ", currency: "USD" }];
    const app = makeApp({ search: vi.fn(async () => results) });
    const res = await app.request("/api/search?q=msft");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ results });
  });

  it("rejects a missing or oversized q with VALIDATION", async () => {
    expect((await makeApp().request("/api/search")).status).toBe(400);
    expect((await makeApp().request(`/api/search?q=${"A".repeat(25)}`)).status).toBe(400);
  });

  it("maps upstream failure to 502", async () => {
    const app = makeApp({
      search: vi.fn(async () => { throw new MarketError("UPSTREAM", "Search unavailable — try again"); }),
    });
    expect((await app.request("/api/search?q=btc")).status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/app.test.ts`
Expected: FAIL — `/api/search` returns 404.

- [ ] **Step 3: Implement the route**

In `server/app.ts`: add `import { z } from "zod";` to the imports, then add above the `/quote` route:

```ts
  const searchQuerySchema = z.string().trim().min(1).max(24);

  api.get("/search", async (c) => {
    const parsed = searchQuerySchema.safeParse(c.req.query("q") ?? "");
    if (!parsed.success) return invalid(c, parsed.error.issues);
    return c.json({ results: await market.search(parsed.data) });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/app.test.ts
git commit -m "feat: /api/search endpoint"
```

---

### Task 5: Client types + `InstrumentCombobox` component

**Files:**
- Modify: `src/features/portfolio/types.ts` (append)
- Create: `src/features/portfolio/components/instrument-combobox.tsx`

**Interfaces:**
- Consumes: `api<T>()` from `@/lib/api`; `Input` from `@/components/ui/input`; `AssetType` from `@shared/schema`.
- Produces: `<InstrumentCombobox selected={SearchResult | null} onSelect={(r: SearchResult | null) => void} />`. Selecting a search row or manual-fallback row calls `onSelect(result)`; editing the text after a selection calls `onSelect(null)`. Task 6 wires this into `HoldingForm`.

There is no React unit-test infrastructure in this repo (all Vitest suites are server-side); this component is verified in Task 7's browser run. Type-check with `npx tsc -b` instead of a unit test.

- [ ] **Step 1: Add client types**

Append to `src/features/portfolio/types.ts`:

```ts
export type SearchResult = { symbol: string; name: string; type: AssetType; exchange?: string; currency: string };
export type SearchResponse = { results: SearchResult[] };
```

- [ ] **Step 2: Create the component**

Create `src/features/portfolio/components/instrument-combobox.tsx`. Design notes baked into this code: the listbox renders **in-flow** (not absolutely positioned) so it can't be clipped by the dialog or the mobile drawer's `overflow-y-auto`; rows use `onMouseDown={preventDefault}` so the input keeps focus; all `setState` happens in the debounce callback or event handlers (repo lint rule); a `seq` counter discards stale responses.

```tsx
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { AssetType } from "@shared/schema";
import type { SearchResponse, SearchResult } from "../types";

const TYPE_LABEL: Record<AssetType, string> = { stock: "Stock", etf: "ETF", crypto: "Crypto" };
const MANUAL_TYPES: AssetType[] = ["stock", "etf", "crypto"];

type Row =
  | { kind: "result"; result: SearchResult; disabled: boolean }
  | { kind: "manual"; type: AssetType };

const rowEnabled = (row: Row) => row.kind !== "result" || !row.disabled;

export function InstrumentCombobox(props: {
  selected: SearchResult | null;
  onSelect: (r: SearchResult | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  const q = query.trim();
  const eligible = !props.selected && q.length >= 2;

  useEffect(() => {
    if (!eligible) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      let next: Row[];
      try {
        const { results } = await api<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`);
        next = results.length > 0
          ? results.map((r) => ({ kind: "result" as const, result: r, disabled: r.currency !== "USD" }))
          : MANUAL_TYPES.map((type) => ({ kind: "manual" as const, type }));
      } catch {
        next = MANUAL_TYPES.map((type) => ({ kind: "manual" as const, type }));
      }
      if (seq.current !== id) return; // stale response
      setRows(next);
      setActive(Math.max(0, next.findIndex(rowEnabled)));
      setOpen(true);
    }, 300);
    return () => clearTimeout(t);
  }, [q, eligible]);

  function choose(row: Row) {
    if (!rowEnabled(row)) return;
    props.onSelect(row.kind === "result"
      ? row.result
      : { symbol: q.toUpperCase(), name: "Manual entry", type: row.type, currency: "USD" });
    setOpen(false);
    setRows([]);
  }

  function move(delta: number) {
    if (!open || rows.length === 0) return;
    let i = active;
    do { i = (i + delta + rows.length) % rows.length; } while (!rowEnabled(rows[i]!) && i !== active);
    setActive(i);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && open && rows[active]) { e.preventDefault(); choose(rows[active]!); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  }

  const showList = open && eligible && rows.length > 0;

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          id="instrument" role="combobox" aria-expanded={showList} aria-controls={listId}
          autoCapitalize="characters" autoComplete="off" placeholder="Search ticker or name…"
          value={props.selected ? props.selected.symbol : query}
          onChange={(e) => { props.onSelect(null); setQuery(e.target.value); }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          className={props.selected ? "pr-16" : undefined}
        />
        {props.selected && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-primary">
            {TYPE_LABEL[props.selected.type]}
          </span>
        )}
      </div>
      {props.selected && props.selected.name !== "Manual entry" && (
        <p className="text-xs text-muted-foreground">
          {props.selected.name}{props.selected.exchange ? ` · ${props.selected.exchange}` : ""}
        </p>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto rounded-xl border border-border bg-popover py-1">
          {rows.map((row, i) => {
            const key = row.kind === "result"
              ? `${row.result.symbol}-${row.result.type}-${row.result.exchange ?? ""}` : `manual-${row.type}`;
            return (
              <li
                key={key} role="option" aria-selected={i === active} aria-disabled={!rowEnabled(row)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row)}
                onMouseEnter={() => rowEnabled(row) && setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${
                  !rowEnabled(row) ? "cursor-not-allowed opacity-45"
                  : i === active ? "bg-primary/10 text-primary" : ""}`}
              >
                {row.kind === "result" ? (
                  <>
                    <span className="truncate">
                      <span className="font-semibold">{row.result.symbol}</span>
                      <span className="text-muted-foreground"> — {row.result.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {TYPE_LABEL[row.result.type]}
                      {row.result.exchange ? ` · ${row.result.exchange}` : ""}
                      {row.result.currency !== "USD" ? " · USD listings only" : ""}
                    </span>
                  </>
                ) : (
                  <span>
                    Use &quot;{q.toUpperCase()}&quot; as{" "}
                    <span className="font-semibold">{TYPE_LABEL[row.type]}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/portfolio/types.ts src/features/portfolio/components/instrument-combobox.tsx
git commit -m "feat: instrument search combobox component"
```

---

### Task 6: Rework `HoldingForm` around the combobox

**Files:**
- Modify: `src/features/portfolio/components/holding-form.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `InstrumentCombobox` + `SearchResult` (Task 5); existing `/api/quote` and `/api/fx`; existing `ResponsiveModal`, `Button`, `Input`, `Label`, `Skeleton`.
- Produces: unchanged external contract — `<HoldingForm open onOpenChange initial? onSave(holding, fxRate?) />` (used by `src/routes/portfolio.tsx`, which needs **no changes**).

Behavior deltas: Type `Select` and "Fetch price" button removed; selection auto-fetches the quote and fills the as-of date; editing text clears selection and resets the quote box. Note this file currently carries a pre-existing `react-hooks/set-state-in-effect` lint error on the reset-on-open effect — keep that effect as-is (same pattern), don't add new violations.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/features/portfolio/components/holding-form.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/responsive-modal";
import { api, ApiError } from "@/lib/api";
import { dateLabel, usd } from "@/lib/format";
import { round2 } from "@shared/totals";
import type { AssetType, Holding } from "@shared/schema";
import { InstrumentCombobox } from "./instrument-combobox";
import type { FxResponse, Quote, SearchResult } from "../types";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; quote: Quote; fxRate?: number }
  | { status: "error"; message: string };

const fromHolding = (h: Holding): SearchResult =>
  ({ symbol: h.ticker, name: h.ticker, type: h.type, currency: "USD" });

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate?: number) => void;
}) {
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantityStr, setQuantityStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });

  useEffect(() => {
    if (!props.open) return;
    setSelected(props.initial ? fromHolding(props.initial) : null);
    setQuantityStr(props.initial ? String(props.initial.quantity) : "");
    setAsOf(props.initial?.asOf ?? "");
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

  async function fetchQuote(symbol: string, type: AssetType) {
    setQuote({ status: "loading" });
    try {
      const [q, fx] = await Promise.all([
        api<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`),
        api<FxResponse>("/api/fx"),
      ]);
      setQuote({ status: "ok", quote: q, fxRate: fx.rate });
      setAsOf(q.asOf); // keep the holding's as-of consistent with the fetched EOD price
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
    selected !== null && quote.status === "ok" && asOf !== "" &&
    Number.isFinite(quantity) && quantity > 0;

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
      },
      quote.fxRate,
    );
    props.onOpenChange(false);
  }

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.initial ? `Edit ${props.initial.ticker}` : "Add holding"}
      description="Pick an instrument and we'll fetch its end-of-day USD price."
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="instrument">Instrument</Label>
          <InstrumentCombobox selected={selected} onSelect={handleSelect} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity" type="number" inputMode="decimal" min="0" step="any" placeholder="25"
              value={quantityStr} onChange={(e) => setQuantityStr(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asOf">As-of date</Label>
            <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
          {quote.status === "idle" && <span className="text-muted-foreground">Search for an instrument to fetch its end-of-day price.</span>}
          {quote.status === "loading" && <Skeleton className="h-5 w-40" />}
          {quote.status === "ok" && (
            <span>
              {usd(quote.quote.priceUsd)}
              <span className="text-muted-foreground">
                {" · EOD "}{dateLabel(quote.quote.asOf)}
                {quote.fxRate !== undefined ? ` · USD/SGD ${quote.fxRate}` : ""}
              </span>
            </span>
          )}
          {quote.status === "error" && <span className="text-negative">{quote.message}</span>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save holding</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 2: Type-check and run the server suite (guards against accidental shared-type drift)**

Run: `npx tsc -b && npm test`
Expected: tsc exit 0; all Vitest suites pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/portfolio/components/holding-form.tsx
git commit -m "feat: search-first add-holding flow, drop type select and fetch button"
```

---

### Task 7: Browser verification + full suite

**Files:**
- Create (scratchpad only, NOT committed): `<scratchpad>/verify-picker.mjs`
- No repo files change unless verification finds a bug.

**Interfaces:**
- Consumes: dev server (`npm run dev`: web :5173, api :8787), `playwright-core` already installed in the scratchpad (`npm i playwright-core` there if missing), system Chrome via `channel: "chrome"`.

- [ ] **Step 1: Start the dev server (if not already running)**

```bash
(npm run dev > /tmp/ttm-dev.log 2>&1 &); for i in $(seq 1 45); do curl -sf http://localhost:5173 >/dev/null && break; sleep 1; done
```

- [ ] **Step 2: Write the verification script**

Create `verify-picker.mjs` in the scratchpad (mocks both API routes at the browser level so no external network or API keys are needed):

```js
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1720, height: 1030 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.route('**/api/search**', (route) => route.fulfill({ json: { results: [
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'MSF', name: 'Some GBP Listing', type: 'stock', exchange: 'LSE', currency: 'GBp' },
] } }));
await page.route('**/api/quote**', (route) => route.fulfill({ json:
  { symbol: 'MSFT', type: 'stock', priceUsd: 482.02, asOf: '2026-07-10' } }));
await page.route('**/api/fx**', (route) => route.fulfill({ json:
  { pair: 'USD/SGD', rate: 1.29134, asOf: '2026-07-10' } }));

await page.goto('http://localhost:5173/portfolio', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Add Holding|Add your first holding/ }).first().click();

// 1. search → rows appear; non-USD row disabled
await page.locator('#instrument').fill('msf');
await page.waitForSelector('text=Microsoft Corporation');
const disabledRow = await page.locator('[role=option][aria-disabled="true"]').count();

// 2. pick the USD row → price + as-of populate, Save enables
await page.getByRole('option', { name: /Microsoft Corporation/ }).click();
await page.waitForSelector('text=USD/SGD 1.29134');
const asOf = await page.locator('#asOf').inputValue();
const saveDisabled = await page.getByRole('button', { name: 'Save holding' }).isDisabled();
await page.locator('#quantity').fill('18');
const saveDisabledAfterQty = await page.getByRole('button', { name: 'Save holding' }).isDisabled();

console.log(JSON.stringify({ disabledRow, asOf, saveDisabled, saveDisabledAfterQty }, null, 2));
await page.screenshot({ path: 'verify-picker.png' });

// 3. fallback: search API down → manual rows
await page.unroute('**/api/search**');
await page.route('**/api/search**', (route) => route.abort());
await page.locator('#instrument').fill('zzz');
await page.waitForSelector('text=/Use "ZZZ" as/');
console.log('fallback rows OK');
await page.screenshot({ path: 'verify-picker-fallback.png' });
await browser.close();
```

- [ ] **Step 3: Run it and check the output AND the screenshots**

Run: `node verify-picker.mjs` (from the scratchpad)
Expected output: `disabledRow: 1`, `asOf: "2026-07-10"`, `saveDisabled: true` (no quantity yet), `saveDisabledAfterQty: false`, then `fallback rows OK`. Open both PNGs and confirm the dropdown styling matches the app (dark popover, gold active row) and the fallback rows render.

- [ ] **Step 4: Full suite + lint delta**

Run: `npm test && npm run build && npm run lint`
Expected: all tests pass; build succeeds; lint shows only the pre-existing 19 problems (18 errors, 1 warning) — compare against `git stash` baseline if unsure. `holding-form.tsx` keeps exactly one pre-existing `set-state-in-effect` error; `instrument-combobox.tsx` must contribute zero.

- [ ] **Step 5: Commit any verification-driven fixes**

```bash
git add -A && git status --short   # review first — only commit intended files
git commit -m "fix: instrument picker verification fixes"   # ONLY if fixes were needed
```

---

## Self-review notes (already applied)

- Spec coverage: search endpoint (T4), merge/cap/partial-failure (T3), USD-any-exchange with greyed rows (T3 keeps currency, T5 disables), auto-fetch on selection incl. as-of fill (T6), Type select + Fetch price removed (T6), manual fallback rows (T5), edit mode via `fromHolding` (T6), keyboard nav (T5), tests (T1–T4, T7).
- `SearchResult` field names identical in `server/market.ts` and `src/features/portfolio/types.ts`.
- `stubMarket` widening folded into Task 3 so the interface change never leaves the build red between tasks.
