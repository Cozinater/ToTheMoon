# Holding "Strategy" field — design

**Date:** 2026-07-25
**Status:** Approved (pending spec review)

## Goal

Let each holding carry a **Strategy** label (e.g. "China", "Turn Around", "Speculative",
"Long Term"), chosen from a user-editable list. Surface it as a color-coded badge column in
the portfolio table and as a dropdown in the add/edit holding form. The list of strategy
options is managed in Settings and is **global** — one list shared by every draft and every
month, never scoped to or frozen inside a single draft.

## Key architectural facts (why this shape)

- There is **no per-holding API**. The whole portfolio (holdings + assets + liabilities) is one
  "draft" document, read with `GET /api/draft` and saved wholesale with `PUT /api/draft`
  (`server/app.ts`). So the per-holding strategy **value** rides along on the existing draft
  PUT — no new endpoint is needed for it.
- The **editable list of options** is genuinely new persistent state (there is no
  settings/config object today). It gets its own dedicated store record and two new endpoints.
- Holdings are also embedded in monthly snapshots via `holdingSchema`. Making the new field
  **optional** keeps every existing draft and closed snapshot valid.

## Decisions

- **Name:** "Strategy" (column header and form field label).
- **Storage:** dedicated global settings record — *not* embedded in the draft.
- **Cardinality:** one strategy per holding (single-select dropdown).
- **Default:** new holdings default to "Long Term" if present in the list, else the first option.
- **Badge:** color-coded pills — each strategy gets a stable color from the chart palette
  (`--chart-1`…`--chart-6`) by its index in the Settings list; orphaned values use a neutral pill.

## Scope boundaries (YAGNI)

- No strategy filter tabs on the table — the Type tabs stay as-is; the Strategy column is
  sortable only. (Easy follow-up later.)
- Single strategy per holding, not multi-select.
- The strategy *list* is live config and is **not** copied into monthly snapshots. Only the
  per-holding value is frozen into a snapshot when a month closes.
- No new dependency for the badge — a lightweight inline pill using existing design tokens.

## Changes by layer

### 1. Shared schema — `shared/schema.ts`

- Add to `holdingSchema`:
  ```ts
  strategy: z.string().min(1).max(40).optional(),
  ```
- Add settings type + default:
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
  Uniqueness (case-insensitive, trimmed) is enforced when saving via the API, not in the base
  schema, so the schema stays a simple structural check.

### 2. Store — `server/store.ts`, `server/file-store.ts`, `server/dynamo-store.ts`

- Extend the `SnapshotStore` interface:
  ```ts
  getSettings(): Promise<Settings | null>;
  putSettings(settings: Settings): Promise<void>;
  ```
- **MemoryStore:** add `protected settings: Settings | null = null;` with getter/setter that call
  `this.persist()`. `reset()` also sets `settings = null` (so defaults return afterward); the
  returned count stays draft + snapshots (settings not counted).
- **FileStore:** include `settings` in the persisted JSON blob; read back with a `?? null`
  fallback so pre-existing files load cleanly.
- **DynamoStore:** same `pk: "USER"`, new `sk: "SETTINGS"` row — mirrors the DRAFT row exactly.
  `reset()` already deletes every row under the PK, so settings clear with everything else.

### 3. API — `server/app.ts`

Two new routes on the existing `api` sub-app (so they inherit origin-secret + auth middleware):

- `GET /api/settings` → `c.json(await store.getSettings() ?? defaultSettings())`.
- `PUT /api/settings` → parse with `settingsSchema`; then normalize: trim each entry, drop
  blanks, dedupe case-insensitively; reject if the result is empty (400 VALIDATION); save and
  return the normalized settings.

### 4. Frontend

- **New hook `src/hooks/use-settings.ts`** — mirrors `use-draft.ts`:
  - `useSettings()` → `useQuery(["settings"], () => api<Settings>("/api/settings"))`.
  - `useSaveSettings()` → `useMutation` PUT with optimistic update + rollback + invalidate.

- **Holding form — `src/features/portfolio/components/holding-form.tsx`:**
  - Read options via `useSettings()`.
  - Add a `strategy` state + a `Strategy` dropdown (`src/components/ui/select.tsx`), placed in the
    Quantity / As-of-date grid row (or directly below it).
  - Default on open: existing holding's strategy → else "Long Term" if in the list → else the
    first option. If the editing holding's stored strategy is no longer in the list, add it to the
    dropdown as an extra option so editing doesn't silently change it.
  - Include `strategy` in the saved `Holding` object.

- **Holdings table — `src/features/portfolio/components/holdings-table.tsx`:**
  - New sortable `strategy` column **after `type`**.
  - `CELL_CLASS.strategy = "hidden px-5 py-4 sm:table-cell"` (hidden on mobile, matching Type/Price).
  - Cell renders a color-coded pill via a small `StrategyBadge` helper (new file
    `src/features/portfolio/components/strategy-badge.tsx`), which takes the strategy string and
    its color index. Color index comes from the strategy's position in the Settings list
    (`index % 6` → `--chart-{n}`); strings not in the list render as a neutral pill. Missing
    strategy renders as `—`.
  - Update the "No holdings match" `colSpan` (now 7 read-only / 8 editable).
  - Bonus: History reuses this table, so closed snapshots show the column automatically
    (pre-feature holdings show `—`).

- **Settings — `src/routes/settings.tsx` + new `src/features/settings/components/strategies-card.tsx`:**
  - Card matching the existing `surface rounded-3xl p-6` + icon-header pattern (see
    `close-month-card.tsx`).
  - Editable list of options: each row is an `Input` + delete (`Trash2`) button; an "Add"
    button appends a blank row; an explicit "Save strategies" button PUTs the whole list via
    `useSaveSettings()`.
  - Client guards mirror the server: block saving an empty list (min 1) and surface a note on
    duplicates/blanks. Delete is disabled when only one option remains.
  - Add `<StrategiesCard />` to the settings page grid.

## Badge color mapping

- Build a lookup from the Settings `strategies` array: `strategy -> index`.
- Pill classes: `bg-chart-{(index % 6) + 1}/15 text-chart-{(index % 6) + 1}`, plus
  `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium`.
- Orphaned value (not in list): `border border-border/60 bg-secondary/50 text-muted-foreground`.

## Edge cases

- **Deleting/renaming an in-use strategy:** holdings keep their stored string and keep
  displaying it (neutral pill if orphaned). The historical record is never rewritten.
- **Pre-feature holdings:** show `—` until edited; every new/edited holding gets a value.
- **Empty/duplicate options:** normalized and rejected server-side; guarded client-side.

## Testing

Test-first for the non-UI layers:

- `shared/schema.test.ts`: `settingsSchema` (min 1, max 20, item length); `holdingSchema` valid
  with and without `strategy`.
- `server/store.test.ts`: `getSettings`/`putSettings` round-trip on MemoryStore and FileStore;
  `reset()` clears settings.
- `server/app.test.ts`: `GET /api/settings` returns defaults when unset; `PUT` validates,
  normalizes (trim/dedupe/drop-blanks), rejects empty, and round-trips.

UI wiring verified manually / via existing lightweight patterns (no heavy new component tests).
