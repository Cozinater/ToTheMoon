# Holding "Strategy" Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each holding an optional "Strategy" label chosen from a global, user-editable list, shown as a color-coded badge column in the portfolio table and a dropdown in the holding form.

**Architecture:** The per-holding value is a new optional field on `holdingSchema`, saved through the existing `PUT /api/draft` (no new endpoint). The editable list of options is new global state in a dedicated store record with its own `GET`/`PUT /api/settings`. The frontend reads the list via a new `useSettings` hook and colors badges by each strategy's index in that list.

**Tech Stack:** TypeScript, Zod, Hono (server), React 19 + TanStack Query/Table + Radix (`Select`) + Tailwind v4, Vitest.

## Global Constraints

- **Node not on PATH in non-interactive shells.** Prefix every `npm`/`npx`/`node` command with:
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; `
- **Test runner:** `npm test` runs `vitest run` (all tests). Target one file with `npx vitest run <path>`.
- **Full typecheck + build:** `npm run build` (`tsc -b && vite build`). Lint: `npm run lint`.
- **Strategy field is optional** on `holdingSchema` — never make it required (existing drafts/snapshots must stay valid).
- **The strategy options list is global** — it lives only in the settings record, never inside the draft or a snapshot.
- **Default strategies (exact, in order):** `["China", "Turn Around", "Speculative", "Long Term"]`.
- **Normalization rule (server + settings card):** trim each entry, drop blanks, dedupe case-insensitively (first occurrence wins), reject if the result is empty.
- Follow existing code style: 2-space indent, double quotes, no semicolon-free lines (match neighbors).

---

## File Structure

- `shared/schema.ts` (modify) — add `strategy` to `holdingSchema`; add `DEFAULT_STRATEGIES`, `settingsSchema`, `Settings`, `defaultSettings`.
- `shared/schema.test.ts` (modify) — tests for the above.
- `server/store.ts` (modify) — add `getSettings`/`putSettings` to interface + `MemoryStore`; clear settings in `reset()`.
- `server/file-store.ts` (modify) — persist `settings` in the JSON blob.
- `server/dynamo-store.ts` (modify) — `SETTINGS` row read/write.
- `server/store.test.ts` (modify) — settings round-trip + reset-clears-settings tests.
- `server/app.ts` (modify) — `GET`/`PUT /api/settings`.
- `server/app.test.ts` (modify) — settings endpoint tests.
- `src/hooks/use-settings.ts` (create) — `useSettings` + `useSaveSettings`.
- `src/features/portfolio/components/strategy-badge.tsx` (create) — color-coded pill.
- `src/features/portfolio/components/holdings-table.tsx` (modify) — Strategy column.
- `src/features/portfolio/components/holding-form.tsx` (modify) — Strategy dropdown.
- `src/features/settings/components/strategies-card.tsx` (create) — options editor.
- `src/routes/settings.tsx` (modify) — mount the card.

---

## Task 1: Shared schema — `strategy` field + settings types

**Files:**
- Modify: `shared/schema.ts`
- Test: `shared/schema.test.ts`

**Interfaces:**
- Consumes: nothing (leaf).
- Produces:
  - `holdingSchema` gains `strategy?: string` (1–40 chars).
  - `export const DEFAULT_STRATEGIES: readonly string[]`
  - `export const settingsSchema` → `{ strategies: string[] }` (1–20 items, each 1–40 chars).
  - `export type Settings = { strategies: string[] }`
  - `export function defaultSettings(): Settings`

- [ ] **Step 1: Write the failing tests**

Add to `shared/schema.test.ts`. Update the import on line 2–4 to include `settingsSchema, defaultSettings` from `./schema.ts`, then append:

```ts
describe("holdingSchema strategy", () => {
  it("accepts a holding with or without a strategy", () => {
    expect(holdingSchema.safeParse(holding()).success).toBe(true);
    expect(holdingSchema.safeParse({ ...holding(), strategy: "Long Term" }).success).toBe(true);
  });
  it("rejects an empty or over-long strategy", () => {
    expect(holdingSchema.safeParse({ ...holding(), strategy: "" }).success).toBe(false);
    expect(holdingSchema.safeParse({ ...holding(), strategy: "x".repeat(41) }).success).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("accepts the default settings", () => {
    expect(settingsSchema.safeParse(defaultSettings()).success).toBe(true);
    expect(defaultSettings().strategies).toEqual(["China", "Turn Around", "Speculative", "Long Term"]);
  });
  it("requires at least one strategy and caps the list at 20", () => {
    expect(settingsSchema.safeParse({ strategies: [] }).success).toBe(false);
    expect(settingsSchema.safeParse({
      strategies: Array.from({ length: 21 }, (_, i) => `s${i}`),
    }).success).toBe(false);
  });
  it("rejects blank or over-long entries", () => {
    expect(settingsSchema.safeParse({ strategies: [""] }).success).toBe(false);
    expect(settingsSchema.safeParse({ strategies: ["x".repeat(41)] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npx vitest run shared/schema.test.ts`
Expected: FAIL — `settingsSchema`/`defaultSettings` are not exported (import error / undefined).

- [ ] **Step 3: Implement in `shared/schema.ts`**

Add `strategy` to `holdingSchema` (after the `asOf` line, inside the object at lines 12–20):

```ts
  asOf: isoDate,
  strategy: z.string().min(1).max(40).optional(),
});
```

Add after the `Holding` type export (after line 21):

```ts
export const DEFAULT_STRATEGIES = ["China", "Turn Around", "Speculative", "Long Term"] as const;

export const settingsSchema = z.object({
  strategies: z.array(z.string().min(1).max(40)).min(1).max(20),
});
export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return { strategies: [...DEFAULT_STRATEGIES] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npx vitest run shared/schema.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts shared/schema.test.ts
git commit -m "feat(schema): add optional holding strategy + settings schema"
```

---

## Task 2: Store — settings persistence

**Files:**
- Modify: `server/store.ts`, `server/file-store.ts`, `server/dynamo-store.ts`
- Test: `server/store.test.ts`

**Interfaces:**
- Consumes: `Settings` from `../shared/schema.ts` (Task 1).
- Produces: `SnapshotStore.getSettings(): Promise<Settings | null>` and `SnapshotStore.putSettings(settings: Settings): Promise<void>` on all three stores. `reset()` also clears settings.

- [ ] **Step 1: Write the failing tests**

In `server/store.test.ts`, add these two `it` blocks inside `behavesLikeAStore` (after the existing `reset` test, before the closing brace on line 50):

```ts
  it("settings: null until put, then returned", async () => {
    expect(await store.getSettings()).toBeNull();
    const settings = { strategies: ["China", "Long Term"] };
    await store.putSettings(settings);
    expect(await store.getSettings()).toEqual(settings);
  });

  it("reset clears settings too", async () => {
    await store.putSettings({ strategies: ["China"] });
    await store.reset();
    expect(await store.getSettings()).toBeNull();
  });
```

And add a FileStore-specific persistence test inside the `describe("FileStore", ...)` block (after the "persists across instances" test, before its closing `});` on line 66):

```ts
  it("persists settings across instances", async () => {
    const file = join(dir, "settings.json");
    const a = new FileStore(file);
    await a.putSettings({ strategies: ["Long Term", "China"] });
    const b = new FileStore(file);
    expect((await b.getSettings())?.strategies).toEqual(["Long Term", "China"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npx vitest run server/store.test.ts`
Expected: FAIL — `store.getSettings`/`putSettings` are not functions (TS error / runtime undefined).

- [ ] **Step 3: Implement — `server/store.ts`**

Update the import (line 1) and interface:

```ts
import type { Draft, Settings, Snapshot } from "../shared/schema.ts";

export interface SnapshotStore {
  getDraft(): Promise<Draft | null>;
  putDraft(draft: Draft): Promise<void>;
  getSnapshot(month: string): Promise<Snapshot | null>;
  listSnapshots(): Promise<Snapshot[]>;
  createSnapshot(snap: Snapshot): Promise<boolean>;
  putSnapshot(snap: Snapshot): Promise<void>;
  getSettings(): Promise<Settings | null>;
  putSettings(settings: Settings): Promise<void>;
  reset(): Promise<number>;
}
```

In `MemoryStore`, add a field next to `draft`/`snapshots` (after line 15):

```ts
  protected settings: Settings | null = null;
```

Add the two methods (e.g. after `putSnapshot`, before `reset`):

```ts
  async getSettings() { return this.settings; }
  async putSettings(settings: Settings) { this.settings = settings; this.persist(); }
```

In `reset()`, clear settings without counting it (the count stays draft + snapshots):

```ts
  async reset() {
    const n = this.snapshots.size + (this.draft ? 1 : 0);
    this.draft = null; this.snapshots.clear(); this.settings = null; this.persist(); return n;
  }
```

- [ ] **Step 4: Implement — `server/file-store.ts`**

Update the imports and the persisted blob shape so `settings` round-trips:

```ts
import type { Draft, Settings, Snapshot } from "../shared/schema.ts";
import { MemoryStore } from "./store.ts";

export class FileStore extends MemoryStore {
  constructor(private filePath: string) {
    super();
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        draft: Draft | null; snapshots: Record<string, Snapshot>; settings?: Settings | null;
      };
      this.draft = raw.draft;
      this.snapshots = new Map(Object.entries(raw.snapshots));
      this.settings = raw.settings ?? null;
    }
  }
  protected override persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(
      { draft: this.draft, snapshots: Object.fromEntries(this.snapshots), settings: this.settings }, null, 2));
  }
}
```

- [ ] **Step 5: Implement — `server/dynamo-store.ts`**

Update the import (line 5) to add `Settings`:

```ts
import type { Draft, Settings, Snapshot } from "../shared/schema.ts";
```

Add the two methods (e.g. after `putDraft`, before `getSnapshot`):

```ts
  async getSettings(): Promise<Settings | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: "SETTINGS" } }));
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, ...settings } = res.Item;
    return settings as Settings;
  }

  async putSettings(settings: Settings): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: PK, sk: "SETTINGS", ...settings } }));
  }
```

(No change needed to `DynamoStore.reset()` — it already deletes every row under the PK, including `SETTINGS`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npx vitest run server/store.test.ts`
Expected: PASS (existing tests still green; new settings tests green for MemoryStore + FileStore).

- [ ] **Step 7: Commit**

```bash
git add server/store.ts server/file-store.ts server/dynamo-store.ts server/store.test.ts
git commit -m "feat(store): persist global strategy settings across all store impls"
```

---

## Task 3: API — `GET`/`PUT /api/settings`

**Files:**
- Modify: `server/app.ts`
- Test: `server/app.test.ts`

**Interfaces:**
- Consumes: `settingsSchema`, `defaultSettings` (Task 1); `store.getSettings`/`putSettings` (Task 2).
- Produces: `GET /api/settings` → `Settings`; `PUT /api/settings` → normalized `Settings` (400 `VALIDATION` on bad/empty input).

- [ ] **Step 1: Write the failing tests**

Append to `server/app.test.ts`:

```ts
describe("settings", () => {
  it("GET returns the default strategies when none saved", async () => {
    const res = await makeApp().request("/api/settings");
    expect(res.status).toBe(200);
    expect((await json(res)).strategies).toEqual(["China", "Turn Around", "Speculative", "Long Term"]);
  });

  it("PUT normalizes: trims, drops blanks, dedupes case-insensitively, then persists", async () => {
    const app = makeApp();
    const res = await app.request("/api/settings", jsonReq("PUT", {
      strategies: [" China ", "china", "Long Term"],
    }));
    expect(res.status).toBe(200);
    expect((await json(res)).strategies).toEqual(["China", "Long Term"]);
    expect((await json(await app.request("/api/settings"))).strategies).toEqual(["China", "Long Term"]);
  });

  it("PUT rejects an empty list with VALIDATION", async () => {
    const res = await makeApp().request("/api/settings", jsonReq("PUT", { strategies: [] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("VALIDATION");
  });

  it("PUT rejects a list that normalizes to empty (all blanks)", async () => {
    const res = await makeApp().request("/api/settings", jsonReq("PUT", { strategies: ["   "] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("VALIDATION");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npx vitest run server/app.test.ts`
Expected: FAIL — `/api/settings` returns 404 (route not defined).

- [ ] **Step 3: Implement in `server/app.ts`**

Add `defaultSettings, settingsSchema` to the schema import (lines 4–7):

```ts
import {
  amendInputSchema, assetTypeSchema, closeInputSchema, defaultSettings, draftInputSchema,
  emptyDraft, settingsSchema, type AssetType, type Snapshot,
} from "../shared/schema.ts";
```

Add the routes right after the `/draft` PUT handler (after line 87):

```ts
  api.get("/settings", async (c) => c.json(await store.getSettings() ?? defaultSettings()));

  api.put("/settings", async (c) => {
    const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const seen = new Set<string>();
    const strategies: string[] = [];
    for (const raw of parsed.data.strategies) {
      const s = raw.trim();
      const key = s.toLowerCase();
      if (s === "" || seen.has(key)) continue;
      seen.add(key);
      strategies.push(s);
    }
    if (strategies.length === 0) {
      return c.json({ error: "VALIDATION", message: "At least one strategy is required" }, 400);
    }
    const settings = { strategies };
    await store.putSettings(settings);
    return c.json(settings);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npx vitest run server/app.test.ts`
Expected: PASS (new `settings` describe green; all prior tests still green).

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/app.test.ts
git commit -m "feat(api): add GET/PUT /api/settings for strategy list"
```

---

## Task 4: Frontend hook — `useSettings` / `useSaveSettings`

**Files:**
- Create: `src/hooks/use-settings.ts`

**Interfaces:**
- Consumes: `Settings` (Task 1); `GET`/`PUT /api/settings` (Task 3); existing `api` helper (`src/lib/api.ts`).
- Produces: `useSettings()` (React Query for `Settings`) and `useSaveSettings()` (mutation taking `Settings`). Query key: `settingsKey = ["settings"]`.

> No component-test infra exists in this repo (only pure-function Vitest tests). Verify this task with a typecheck/build. It's consumed by Tasks 5–7.

- [ ] **Step 1: Create `src/hooks/use-settings.ts`**

Mirror `src/hooks/use-draft.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@shared/schema";
import { api } from "@/lib/api";

export const settingsKey = ["settings"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => api<Settings>("/api/settings") });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) =>
      api<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
    onMutate: async (settings) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      const previous = qc.getQueryData<Settings>(settingsKey);
      qc.setQueryData<Settings>(settingsKey, settings);
      return { previous };
    },
    onError: (_err, _settings, ctx) => {
      if (ctx?.previous) qc.setQueryData(settingsKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKey }),
  });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npm run build`
Expected: build succeeds with no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-settings.ts
git commit -m "feat(web): add useSettings/useSaveSettings hook"
```

---

## Task 5: Strategy badge + table column

**Files:**
- Create: `src/features/portfolio/components/strategy-badge.tsx`
- Modify: `src/features/portfolio/components/holdings-table.tsx`

**Interfaces:**
- Consumes: `useSettings` (Task 4); `cn` (`src/lib/utils.ts`); the `strategy` field on `Holding` (Task 1).
- Produces: `<StrategyBadge value={string} colorIndex={number} />` (colorIndex < 0 → neutral pill); a sortable `strategy` column in `HoldingsTable`.

> Verified via build + lint + manual UI check (no component tests in repo).

- [ ] **Step 1: Create `src/features/portfolio/components/strategy-badge.tsx`**

```tsx
import { cn } from "@/lib/utils";

// Six chart tokens (see App.css @theme), cycled by the strategy's index in the Settings list.
const CHART_TINTS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
  "bg-chart-6/15 text-chart-6",
];
const NEUTRAL = "border border-border/60 bg-secondary/50 text-muted-foreground";

export function StrategyBadge({ value, colorIndex }: { value: string; colorIndex: number }) {
  const tint = colorIndex >= 0 ? CHART_TINTS[colorIndex % CHART_TINTS.length] : NEUTRAL;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tint)}>
      {value}
    </span>
  );
}
```

- [ ] **Step 2: Wire the column into `holdings-table.tsx`**

Add imports at the top (near the other feature imports):

```ts
import { useSettings } from "@/hooks/use-settings";
import { StrategyBadge } from "./strategy-badge";
```

Add a `strategy` entry to `CELL_CLASS` (after the `type` line, ~line 24) so it hides on mobile like Type/Price:

```ts
  strategy: "hidden px-5 py-4 sm:table-cell",
```

Inside `HoldingsTable`, before the `columns` useMemo (~line 45), build the color-index map:

```ts
  const { data: settings } = useSettings();
  const strategyIndex = useMemo(
    () => new Map((settings?.strategies ?? []).map((s, i) => [s, i] as const)),
    [settings],
  );
```

Insert the column into the `columns` array immediately after the `type` accessor (after line 56):

```ts
      col.accessor("strategy", {
        header: "Strategy",
        cell: (c) => {
          const v = c.getValue();
          return v
            ? <StrategyBadge value={v} colorIndex={strategyIndex.get(v) ?? -1} />
            : <span className="text-muted-foreground">—</span>;
        },
      }),
```

Add `strategyIndex` to the `columns` useMemo dependency array (line 94): `}, [total, readOnly, onEdit, onDelete, strategyIndex]);`

Update the empty-state `colSpan` (line 163) from `readOnly ? 6 : 7` to:

```tsx
                  <td colSpan={readOnly ? 7 : 8} className="px-4 py-6 text-center text-muted-foreground">
```

- [ ] **Step 3: Verify build + lint**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/features/portfolio/components/strategy-badge.tsx src/features/portfolio/components/holdings-table.tsx
git commit -m "feat(web): add color-coded Strategy column to holdings table"
```

---

## Task 6: Strategy dropdown in the holding form

**Files:**
- Modify: `src/features/portfolio/components/holding-form.tsx`

**Interfaces:**
- Consumes: `useSettings` (Task 4); `Select*` components (`src/components/ui/select.tsx`); `strategy` on `Holding` (Task 1).
- Produces: the saved `Holding` now includes `strategy` (or omits it when unset). Defaults to "Long Term" (or first option) for new holdings; pre-fills + preserves an orphaned value when editing.

> Verified via build + lint + manual UI check.

- [ ] **Step 1: Add imports**

At the top of `holding-form.tsx`:

```ts
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
```

- [ ] **Step 2: Add state + default logic**

Inside `HoldingForm`, add near the other `useState` calls (after line 34):

```ts
  const { data: settings } = useSettings();
  const [strategy, setStrategy] = useState("");
```

In the existing open-effect (the `useEffect` at lines 36–55), add this line alongside the other field resets (e.g. after `setAsOf(...)`):

```ts
    setStrategy(props.initial?.strategy ?? "");
```

Add a new effect right after that open-effect to fill the default once settings load and nothing is selected yet:

```ts
  useEffect(() => {
    if (!props.open || strategy !== "" || !settings) return;
    setStrategy(settings.strategies.includes("Long Term") ? "Long Term" : settings.strategies[0] ?? "");
  }, [props.open, strategy, settings]);
```

Add the options list (includes an orphaned current value so editing never silently changes it). Put it near `const quantity = Number(quantityStr);` (~line 80):

```ts
  const strategyOptions = useMemo(() => {
    const base = settings?.strategies ?? [];
    return strategy && !base.includes(strategy) ? [...base, strategy] : base;
  }, [settings, strategy]);
```

Add `useMemo` to the React import on line 1: `import { useEffect, useMemo, useState } from "react";`

- [ ] **Step 3: Include `strategy` in the saved holding**

In `save()` (the object passed to `props.onSave`, lines 88–96), add:

```ts
        asOf,
        strategy: strategy || undefined,
```

- [ ] **Step 4: Render the dropdown**

Insert this block after the Quantity / As-of grid `</div>` (after line 128), before the quote summary box:

```tsx
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
```

- [ ] **Step 5: Verify build + lint**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/features/portfolio/components/holding-form.tsx
git commit -m "feat(web): add Strategy dropdown to the holding form"
```

---

## Task 7: Strategies editor in Settings

**Files:**
- Create: `src/features/settings/components/strategies-card.tsx`
- Modify: `src/routes/settings.tsx`

**Interfaces:**
- Consumes: `useSettings`/`useSaveSettings` (Task 4); `Button`, `Input` (ui).
- Produces: `<StrategiesCard />` — add/rename/delete rows + explicit Save; enforces the normalization rule client-side and blocks emptying the list.

> Verified via build + lint + manual UI check.

- [ ] **Step 1: Create `src/features/settings/components/strategies-card.tsx`**

Uses stable local row ids (not array index) so editing/deleting middle rows doesn't scramble inputs:

```tsx
import { useEffect, useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveSettings, useSettings } from "@/hooks/use-settings";

type Row = { id: string; value: string };

export function StrategiesCard() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (settings) setRows(settings.strategies.map((value) => ({ id: crypto.randomUUID(), value })));
  }, [settings]);

  const setValue = (id: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRows((prev) => [...prev, { id: crypto.randomUUID(), value: "" }]);

  function save() {
    setNote(null);
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const { value } of rows) {
      const s = value.trim();
      const key = s.toLowerCase();
      if (s === "" || seen.has(key)) continue;
      seen.add(key);
      cleaned.push(s);
    }
    if (cleaned.length === 0) {
      setNote({ kind: "err", text: "Add at least one strategy." });
      return;
    }
    saveSettings.mutate({ strategies: cleaned }, {
      onSuccess: (s) => {
        setRows(s.strategies.map((value) => ({ id: crypto.randomUUID(), value })));
        setNote({ kind: "ok", text: "Strategies saved." });
      },
      onError: (err) => setNote({ kind: "err", text: err.message }),
    });
  }

  return (
    <section className="surface rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-3.5">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Tag className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Strategies</h2>
          <p className="text-sm text-muted-foreground">
            Labels you can assign to holdings. Shared across every draft and month.
          </p>
        </div>
      </div>

      <ul className="grid gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2">
            <Input
              value={r.value}
              onChange={(e) => setValue(r.id, e.target.value)}
              placeholder="Strategy name"
              maxLength={40}
            />
            <Button
              variant="ghost" size="icon" aria-label={`Remove strategy ${i + 1}`}
              onClick={() => removeRow(r.id)} disabled={rows.length <= 1}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost" size="sm" onClick={addRow}
        className="mt-2 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="size-4" /> Add strategy
      </Button>

      {note && (
        <p className={note.kind === "ok" ? "mt-3 text-sm text-positive" : "mt-3 text-sm text-negative"}>
          {note.text}
        </p>
      )}

      <div className="mt-5">
        <Button onClick={save} disabled={saveSettings.isPending}>
          {saveSettings.isPending ? "Saving…" : "Save strategies"}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it in `src/routes/settings.tsx`**

Add the import:

```ts
import { StrategiesCard } from "@/features/settings/components/strategies-card";
```

Add `<StrategiesCard />` to the grid (after `<CloseMonthCard />`, before `<SessionCard />`):

```tsx
      <div className="grid gap-6">
        <CloseMonthCard />
        <StrategiesCard />
        <SessionCard />
        <DangerZone />
      </div>
```

- [ ] **Step 3: Verify build + lint**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 4: Full test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"; npm test`
Expected: all tests pass.

- [ ] **Step 5: Manual acceptance check**

Optional but recommended (start dev server on the alternate ports so it doesn't collide with a running instance — web `5273`, api `8788`):
1. Settings → Strategies: add "Value", rename one, delete one, Save → note "Strategies saved."
2. Portfolio → Add Holding: the Strategy dropdown defaults to "Long Term" and lists your options; pick one and save.
3. Portfolio table: the new holding shows a color-coded Strategy badge (after the Type column; hidden on a narrow viewport).
4. Delete a strategy that a holding uses → that holding still shows the value as a neutral pill.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/components/strategies-card.tsx src/routes/settings.tsx
git commit -m "feat(web): add Strategies editor to Settings"
```

---

## Self-Review Notes

- **Spec coverage:** schema field (T1), settings storage across all 3 stores (T2), GET/PUT endpoints (T3), hook (T4), color-coded badge column after Type (T5), form dropdown w/ default + orphan handling (T6), global editable list in Settings + normalization guards (T7). Snapshot/History behavior is covered implicitly — HoldingsTable is reused and `strategy` is optional, so closed months render the column with `—` for pre-feature holdings.
- **Type consistency:** `Settings = { strategies: string[] }` used identically in schema, store, api, hook, and components. `StrategyBadge` prop names (`value`, `colorIndex`) match usage in the table. `settingsKey`, `useSettings`, `useSaveSettings` names consistent across T4–T7.
- **Normalization** is duplicated intentionally in the server (authoritative, T3) and the settings card (T7, immediate UX); both follow the identical rule in Global Constraints.
