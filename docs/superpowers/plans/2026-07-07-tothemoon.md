# ToTheMoon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal net-worth tracker: edit a live draft of holdings (USD) and SGD balances, close each month into a read-only snapshot, view net worth history in SGD — SPA on CloudFront/S3, one Lambda API, DynamoDB, Terraform.

**Architecture:** Single DynamoDB table holds one `DRAFT` item plus one item per closed month (`sk="YYYY-MM"`). One Hono app serves all `/api/*` routes, runs locally via `@hono/node-server` (JSON-file store) and in Lambda (DynamoDB store). Shared Zod schemas + totals math in `shared/` are imported by both the SPA and the server so shapes/math cannot drift. Spec: `docs/superpowers/specs/2026-07-07-tothemoon-design.md` (has full API bodies + example stored documents). Visual reference: `screenshots/*.png`.

**Tech Stack:** React 19 + Vite + TS, TanStack Router/Query, React Hook Form, Tailwind v4 + shadcn/ui, motion, Recharts, Hono, Zod 4, AWS SDK v3, esbuild, Vitest, Terraform.

## Global Constraints

- Section limits (Zod-enforced): bankSavings ≤ 5, cpf ≤ 4, property ≤ 1, creditCards ≤ 5, loans unlimited.
- Field names: `asOf` = date a value refers to; `updatedAt` only on the draft; Totals keys carry currency suffix (`netWorthSgd`, `portfolioUsd`, `portfolioSgd`, `savingsSgd`, `cpfSgd`, `propertySgd`, `creditCardsSgd`, `loansSgd`).
- IDs inside documents: `crypto.randomUUID()` (built-in; no uuid library).
- Dates are never auto-filled in forms — the user must pick every `asOf`/`snapshotDate`.
- Liability balances stored **positive**, subtracted in math, displayed negative.
- Totals are recomputed server-side at close/amend; client-supplied totals are never trusted.
- The Twelve Data API key exists only server-side (`server/.env` locally, Lambda env via Terraform). Never in frontend code.
- Error body shape everywhere: `{ error: CODE, message }` (`VALIDATION` 400 also carries `issues`).
- All price/FX calls go through the API (`/api/quote`, `/api/fx`) — the browser never calls Twelve Data/CoinGecko.
- Money display: `Intl.NumberFormat` (`en-SG`/SGD, `en-US`/USD). Round money with `round2` from `shared/totals.ts`.
- Animations respect `prefers-reduced-motion` (motion handles this via `useReducedMotion` — gate custom count-up/stagger).
- Mobile-first; no horizontal scrolling at 375 px.
- Commit after every task (messages given per task).

---

## File structure (end state)

```
shared/schema.ts            Zod schemas + TS types + emptyDraft() + SECTION_LIMITS
shared/totals.ts            computeTotals(), round2()
shared/{schema,totals}.test.ts
server/store.ts             SnapshotStore interface + MemoryStore
server/file-store.ts        FileStore (local dev persistence, .data/store.json)
server/dynamo-store.ts      DynamoStore (prod)
server/market.ts            MarketClient interface, MarketError, createMarketClient()
server/twelve-data.ts       stock/ETF quotes + FX (Twelve Data)
server/coingecko.ts         crypto quotes (CoinGecko)
server/app.ts               createApp({store, market, originSecret?}) — all routes
server/dev.ts               local entry (port 8787)
server/lambda.ts            Lambda entry (Function URL handler)
server/*.test.ts            store, market, route tests
src/lib/api.ts              fetch wrapper + ApiError
src/lib/format.ts           sgd/usd/pct/monthLabel/dateLabel
src/hooks/use-draft.ts      useDraft(), useSaveDraft()
src/hooks/use-snapshots.ts  useSnapshots(), useSnapshot(), useCloseMonth(), useAmendSnapshot(), useResetAll()
src/components/layout/app-shell.tsx     sidebar (md+) + bottom tabs (mobile)
src/components/page-header.tsx          eyebrow + display title
src/components/responsive-modal.tsx     Dialog ≥sm / Drawer below
src/components/empty-state.tsx, error-state.tsx
src/features/portfolio/…    holdings table, holding form (quote fetch), refresh prices
src/features/assets/…       section cards, entry form, section configs
src/features/dashboard/…    hero, chart, summary cards, draft card
src/features/history/…      snapshot rows, detail, amend dialog
src/features/settings/…     close-month card, danger zone
src/routes/{__root,index,portfolio,assets,history,settings}.tsx
scripts/build-lambda.mjs    esbuild → dist-server/lambda.zip
scripts/deploy.sh           build → terraform apply → s3 sync → invalidation
infra/*.tf                  providers, dynamodb, lambda, s3, cloudfront, variables, outputs
infra/basic-auth.js.tftpl   CloudFront Function (basic auth + SPA rewrite)
```

Deleted: `src/assets/` (empty; frees the name for `features/assets`).

---

### Task 1: Project plumbing (deps, configs, test runner)

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `.gitignore`
- Create: `tsconfig.server.json`, `server/.env.example`
- Delete: `src/assets/` (folder with `.gitkeep`)

**Interfaces:**
- Produces: `@shared/*` alias (src → `shared/`), Vitest wired to `shared/**` + `server/**` tests, `/api` dev proxy → `localhost:8787`, npm scripts `dev`, `dev:web`, `dev:api`, `test`, `build:lambda`.

- [ ] **Step 1: Install dependencies**

```bash
npm i zod hono @hono/node-server motion recharts @fontsource/instrument-serif @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
npm i -D tsx esbuild vitest concurrently @types/aws-lambda
```

- [ ] **Step 2: Update configs**

`vite.config.ts` — replace entire file:

```ts
/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
  },
});
```

`tsconfig.app.json` — in `"paths"` add `"@shared/*": ["./shared/*"]`; change `"include"` to `["src", "shared"]`.

`tsconfig.server.json` — create:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["server", "shared", "scripts"]
}
```

`tsconfig.json` — add `{ "path": "./tsconfig.server.json" }` to `"references"`.

**Import style rule (used by every later task):** files under `server/` and `shared/` import each other with relative paths *including the `.ts` extension* (e.g. `import { draftSchema } from "../shared/schema.ts"`) — required by nodenext + tsx. Files under `src/` import shared code as `@shared/schema` (no extension).

`package.json` — replace the `"scripts"` block:

```json
"scripts": {
  "dev": "concurrently -n web,api -c auto \"vite\" \"tsx watch server/dev.ts\"",
  "dev:web": "vite",
  "dev:api": "tsx watch server/dev.ts",
  "build": "tsc -b && vite build",
  "build:lambda": "node scripts/build-lambda.mjs",
  "test": "vitest run",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

`.gitignore` — append:

```
.data/
server/.env
dist-server/
*.tfvars
.terraform/
terraform.tfstate*
```

`server/.env.example` — create:

```
TWELVE_DATA_API_KEY=paste-your-key-here
```

- [ ] **Step 3: Delete the empty static-assets folder**

```bash
git rm -r src/assets
```

- [ ] **Step 4: Verify**

Run: `npm run test` → expected: Vitest exits 0 reporting "No test files found" (passWithNoTests not needed — if it exits non-zero, add `passWithNoTests: true` to the `test` block).
Run: `npm run build` → expected: builds cleanly.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: deps, shared/server tsconfig, vitest, api proxy"
```

---

### Task 2: Shared schemas + totals math (TDD)

**Files:**
- Create: `shared/schema.ts`, `shared/totals.ts`
- Test: `shared/schema.test.ts`, `shared/totals.test.ts`

**Interfaces:**
- Produces (imported by everything else):
  - Types: `AssetType`, `Holding`, `Entry`, `Assets`, `Liabilities`, `Draft`, `DraftInput`, `Totals`, `Snapshot`, `CloseInput`, `AmendInput`
  - Schemas: `holdingSchema`, `entrySchema`, `assetsSchema`, `liabilitiesSchema`, `draftSchema`, `draftInputSchema`, `totalsSchema`, `snapshotSchema`, `closeInputSchema`, `amendInputSchema`
  - `emptyDraft(): Draft`, `SECTION_LIMITS` (`{ bankSavings: 5, cpf: 4, property: 1, creditCards: 5 }`)
  - `computeTotals(doc: { holdings: Holding[]; assets: Assets; liabilities: Liabilities }, fxRate: number): Totals`, `round2(n: number): number`

- [ ] **Step 1: Write failing tests**

`shared/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  amendInputSchema, draftInputSchema, emptyDraft, holdingSchema,
} from "./schema.ts";

const entry = (name: string) => ({
  id: crypto.randomUUID(), name, balanceSgd: 100, asOf: "2026-07-01",
});
const holding = () => ({
  id: crypto.randomUUID(), ticker: "VOO", type: "etf" as const,
  quantity: 25, priceUsd: 603.79, valueUsd: 15094.75, asOf: "2026-07-01",
});

describe("draftInputSchema", () => {
  it("accepts a valid draft and strips unknown keys", () => {
    const parsed = draftInputSchema.parse({
      ...emptyDraft(), holdings: [holding()], fxRate: 1.328,
      updatedAt: "2026-07-01T00:00:00Z", // unknown on input → stripped
    });
    expect(parsed.holdings).toHaveLength(1);
    expect("updatedAt" in parsed).toBe(false);
  });

  it.each([
    ["bankSavings", 6], ["cpf", 5], ["property", 2],
  ] as const)("rejects %s over its limit", (key, count) => {
    const draft = emptyDraft();
    draft.assets[key] = Array.from({ length: count }, (_, i) => entry(`a${i}`));
    expect(draftInputSchema.safeParse(draft).success).toBe(false);
  });

  it("rejects a 6th credit card but allows 6 loans", () => {
    const six = Array.from({ length: 6 }, (_, i) => entry(`x${i}`));
    const bad = { ...emptyDraft(), liabilities: { creditCards: six, loans: [] } };
    const ok = { ...emptyDraft(), liabilities: { creditCards: [], loans: six } };
    expect(draftInputSchema.safeParse(bad).success).toBe(false);
    expect(draftInputSchema.safeParse(ok).success).toBe(true);
  });
});

describe("holdingSchema", () => {
  it("rejects non-uuid id, bad date, zero quantity", () => {
    expect(holdingSchema.safeParse({ ...holding(), id: "nope" }).success).toBe(false);
    expect(holdingSchema.safeParse({ ...holding(), asOf: "01/07/2026" }).success).toBe(false);
    expect(holdingSchema.safeParse({ ...holding(), quantity: 0 }).success).toBe(false);
  });
});

describe("amendInputSchema", () => {
  it("requires snapshotDate and fxRate, refuses totals", () => {
    const base = { ...emptyDraft(), snapshotDate: "2026-06-26", fxRate: 1.328 };
    expect(amendInputSchema.safeParse(base).success).toBe(true);
    expect(amendInputSchema.safeParse({ ...base, fxRate: undefined }).success).toBe(false);
    const withTotals = amendInputSchema.parse({ ...base, totals: { netWorthSgd: 1 } });
    expect("totals" in withTotals).toBe(false); // stripped, recomputed server-side
  });
});
```

`shared/totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyDraft } from "./schema.ts";
import { computeTotals, round2 } from "./totals.ts";

it("round2 rounds half up to cents", () => {
  expect(round2(1.005)).toBe(1.01);
  expect(round2(109350.014)).toBe(109350.01);
});

describe("computeTotals", () => {
  it("returns zeros for an empty draft", () => {
    expect(computeTotals(emptyDraft(), 1.3280)).toEqual({
      netWorthSgd: 0, portfolioUsd: 0, portfolioSgd: 0, savingsSgd: 0,
      cpfSgd: 0, propertySgd: 0, creditCardsSgd: 0, loansSgd: 0,
    });
  });

  it("converts portfolio at fx and subtracts liabilities", () => {
    const doc = {
      holdings: [
        { id: crypto.randomUUID(), ticker: "VOO", type: "etf" as const,
          quantity: 25, priceUsd: 603.79, valueUsd: 15094.75, asOf: "2026-07-01" },
        { id: crypto.randomUUID(), ticker: "BTC", type: "crypto" as const,
          quantity: 0.42, priceUsd: 106535, valueUsd: 44744.7, asOf: "2026-07-01" },
      ],
      assets: {
        bankSavings: [{ id: crypto.randomUUID(), name: "DBS", balanceSgd: 49646, asOf: "2026-07-01" }],
        cpf: [{ id: crypto.randomUUID(), name: "CPF", balanceSgd: 146544, asOf: "2026-07-01" }],
        property: [],
      },
      liabilities: {
        creditCards: [{ id: crypto.randomUUID(), name: "DBS Altitude", balanceSgd: 1757.5, asOf: "2026-07-01" }],
        loans: [{ id: crypto.randomUUID(), name: "HDB", balanceSgd: 391400, asOf: "2026-07-01" }],
      },
    };
    const t = computeTotals(doc, 1.328);
    expect(t.portfolioUsd).toBe(59839.45);
    expect(t.portfolioSgd).toBe(79466.79);          // 59839.45 × 1.328
    expect(t.savingsSgd).toBe(49646);
    expect(t.cpfSgd).toBe(146544);
    expect(t.creditCardsSgd).toBe(1757.5);
    expect(t.loansSgd).toBe(391400);
    expect(t.netWorthSgd).toBe(round2(79466.79 + 49646 + 146544 - 1757.5 - 391400));
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test` → expected: FAIL — cannot resolve `./schema.ts` / `./totals.ts`.

- [ ] **Step 3: Implement**

`shared/schema.ts`:

```ts
import { z } from "zod";

export const SECTION_LIMITS = { bankSavings: 5, cpf: 4, property: 1, creditCards: 5 } as const;

const isoDate = z.iso.date();       // "YYYY-MM-DD"
const isoDateTime = z.iso.datetime();
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

export const assetTypeSchema = z.enum(["stock", "etf", "crypto"]);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const holdingSchema = z.object({
  id: z.uuid(),
  ticker: z.string().min(1).max(12),
  type: assetTypeSchema,
  quantity: z.number().positive(),
  priceUsd: z.number().nonnegative(),
  valueUsd: z.number().nonnegative(),
  asOf: isoDate,
});
export type Holding = z.infer<typeof holdingSchema>;

export const entrySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  balanceSgd: z.number().nonnegative(),
  asOf: isoDate,
});
export type Entry = z.infer<typeof entrySchema>;

export const assetsSchema = z.object({
  bankSavings: z.array(entrySchema).max(SECTION_LIMITS.bankSavings),
  cpf: z.array(entrySchema).max(SECTION_LIMITS.cpf),
  property: z.array(entrySchema).max(SECTION_LIMITS.property),
});
export type Assets = z.infer<typeof assetsSchema>;

export const liabilitiesSchema = z.object({
  creditCards: z.array(entrySchema).max(SECTION_LIMITS.creditCards),
  loans: z.array(entrySchema),
});
export type Liabilities = z.infer<typeof liabilitiesSchema>;

export const draftInputSchema = z.object({
  holdings: z.array(holdingSchema),
  assets: assetsSchema,
  liabilities: liabilitiesSchema,
  fxRate: z.number().positive().optional(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

export const draftSchema = draftInputSchema.extend({
  updatedAt: isoDateTime.optional(),
});
export type Draft = z.infer<typeof draftSchema>;

export const totalsSchema = z.object({
  netWorthSgd: z.number(), portfolioUsd: z.number(), portfolioSgd: z.number(),
  savingsSgd: z.number(), cpfSgd: z.number(), propertySgd: z.number(),
  creditCardsSgd: z.number(), loansSgd: z.number(),
});
export type Totals = z.infer<typeof totalsSchema>;

export const snapshotSchema = z.object({
  month: monthSchema,
  snapshotDate: isoDate,
  fxRate: z.number().positive(),
  closedAt: isoDateTime,
  holdings: z.array(holdingSchema),
  assets: assetsSchema,
  liabilities: liabilitiesSchema,
  totals: totalsSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const closeInputSchema = z.object({
  snapshotDate: isoDate,
  fxRate: z.number().positive().optional(),
});
export type CloseInput = z.infer<typeof closeInputSchema>;

export const amendInputSchema = z.object({
  snapshotDate: isoDate,
  fxRate: z.number().positive(),
  holdings: z.array(holdingSchema),
  assets: assetsSchema,
  liabilities: liabilitiesSchema,
});
export type AmendInput = z.infer<typeof amendInputSchema>;

export function emptyDraft(): Draft {
  return {
    holdings: [],
    assets: { bankSavings: [], cpf: [], property: [] },
    liabilities: { creditCards: [], loans: [] },
  };
}
```

`shared/totals.ts`:

```ts
import type { Assets, Holding, Liabilities, Totals } from "./schema.ts";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const sum = (entries: { balanceSgd: number }[]) =>
  round2(entries.reduce((acc, e) => acc + e.balanceSgd, 0));

export function computeTotals(
  doc: { holdings: Holding[]; assets: Assets; liabilities: Liabilities },
  fxRate: number,
): Totals {
  const portfolioUsd = round2(doc.holdings.reduce((acc, h) => acc + h.valueUsd, 0));
  const portfolioSgd = round2(portfolioUsd * fxRate);
  const savingsSgd = sum(doc.assets.bankSavings);
  const cpfSgd = sum(doc.assets.cpf);
  const propertySgd = sum(doc.assets.property);
  const creditCardsSgd = sum(doc.liabilities.creditCards);
  const loansSgd = sum(doc.liabilities.loans);
  return {
    portfolioUsd, portfolioSgd, savingsSgd, cpfSgd, propertySgd,
    creditCardsSgd, loansSgd,
    netWorthSgd: round2(portfolioSgd + savingsSgd + cpfSgd + propertySgd - creditCardsSgd - loansSgd),
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test` → expected: all schema + totals tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared && git commit -m "feat: shared zod schemas and totals math"
```

---

### Task 3: Store interface + Memory/File stores (TDD)

**Files:**
- Create: `server/store.ts`, `server/file-store.ts`
- Test: `server/store.test.ts`

**Interfaces:**
- Produces:

```ts
interface SnapshotStore {
  getDraft(): Promise<Draft | null>;
  putDraft(draft: Draft): Promise<void>;
  getSnapshot(month: string): Promise<Snapshot | null>;
  listSnapshots(): Promise<Snapshot[]>;              // newest first
  createSnapshot(snap: Snapshot): Promise<boolean>;  // false if month already exists
  putSnapshot(snap: Snapshot): Promise<void>;        // unconditional (amend)
  reset(): Promise<number>;                          // items deleted
}
class MemoryStore implements SnapshotStore { … }
class FileStore extends MemoryStore { constructor(filePath: string) }
```

- [ ] **Step 1: Write failing tests**

`server/store.test.ts`:

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyDraft, type Snapshot } from "../shared/schema.ts";
import { computeTotals } from "../shared/totals.ts";
import { FileStore } from "./file-store.ts";
import { MemoryStore, type SnapshotStore } from "./store.ts";

const snap = (month: string): Snapshot => ({
  month, snapshotDate: `${month}-26`, fxRate: 1.328,
  closedAt: "2026-06-26T14:03:00Z", ...emptyDraft(),
  holdings: [], totals: computeTotals(emptyDraft(), 1.328),
});

function behavesLikeAStore(make: () => SnapshotStore) {
  let store: SnapshotStore;
  beforeEach(() => { store = make(); });

  it("draft: null until put, then returned", async () => {
    expect(await store.getDraft()).toBeNull();
    const draft = { ...emptyDraft(), fxRate: 1.3, updatedAt: "2026-07-01T00:00:00Z" };
    await store.putDraft(draft);
    expect(await store.getDraft()).toEqual(draft);
  });

  it("createSnapshot is create-only; putSnapshot overwrites", async () => {
    expect(await store.createSnapshot(snap("2026-06"))).toBe(true);
    expect(await store.createSnapshot(snap("2026-06"))).toBe(false);
    await store.putSnapshot({ ...snap("2026-06"), fxRate: 1.4 });
    expect((await store.getSnapshot("2026-06"))?.fxRate).toBe(1.4);
  });

  it("lists snapshots newest first, draft excluded", async () => {
    await store.putDraft(emptyDraft());
    await store.createSnapshot(snap("2026-04"));
    await store.createSnapshot(snap("2026-06"));
    await store.createSnapshot(snap("2026-05"));
    expect((await store.listSnapshots()).map((s) => s.month))
      .toEqual(["2026-06", "2026-05", "2026-04"]);
  });

  it("reset deletes everything and reports the count", async () => {
    await store.putDraft(emptyDraft());
    await store.createSnapshot(snap("2026-06"));
    expect(await store.reset()).toBe(2);
    expect(await store.getDraft()).toBeNull();
    expect(await store.listSnapshots()).toEqual([]);
  });
}

describe("MemoryStore", () => behavesLikeAStore(() => new MemoryStore()));

describe("FileStore", () => {
  const dir = mkdtempSync(join(tmpdir(), "ttm-"));
  behavesLikeAStore(() => new FileStore(join(dir, `${crypto.randomUUID()}.json`)));

  it("persists across instances", async () => {
    const file = join(dir, "persist.json");
    const a = new FileStore(file);
    await a.createSnapshot(snap("2026-06"));
    const b = new FileStore(file);
    expect((await b.getSnapshot("2026-06"))?.month).toBe("2026-06");
    expect(JSON.parse(readFileSync(file, "utf8")).snapshots["2026-06"]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test` → expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`server/store.ts`:

```ts
import type { Draft, Snapshot } from "../shared/schema.ts";

export interface SnapshotStore {
  getDraft(): Promise<Draft | null>;
  putDraft(draft: Draft): Promise<void>;
  getSnapshot(month: string): Promise<Snapshot | null>;
  listSnapshots(): Promise<Snapshot[]>;
  createSnapshot(snap: Snapshot): Promise<boolean>;
  putSnapshot(snap: Snapshot): Promise<void>;
  reset(): Promise<number>;
}

export class MemoryStore implements SnapshotStore {
  protected draft: Draft | null = null;
  protected snapshots = new Map<string, Snapshot>();

  async getDraft() { return this.draft; }
  async putDraft(draft: Draft) { this.draft = draft; this.persist(); }
  async getSnapshot(month: string) { return this.snapshots.get(month) ?? null; }
  async listSnapshots() {
    return [...this.snapshots.values()].sort((a, b) => b.month.localeCompare(a.month));
  }
  async createSnapshot(snap: Snapshot) {
    if (this.snapshots.has(snap.month)) return false;
    this.snapshots.set(snap.month, snap); this.persist(); return true;
  }
  async putSnapshot(snap: Snapshot) { this.snapshots.set(snap.month, snap); this.persist(); }
  async reset() {
    const n = this.snapshots.size + (this.draft ? 1 : 0);
    this.draft = null; this.snapshots.clear(); this.persist(); return n;
  }
  protected persist() {} // no-op in memory; FileStore overrides
}
```

`server/file-store.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Draft, Snapshot } from "../shared/schema.ts";
import { MemoryStore } from "./store.ts";

export class FileStore extends MemoryStore {
  constructor(private filePath: string) {
    super();
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        draft: Draft | null; snapshots: Record<string, Snapshot>;
      };
      this.draft = raw.draft;
      this.snapshots = new Map(Object.entries(raw.snapshots));
    }
  }
  protected override persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(
      { draft: this.draft, snapshots: Object.fromEntries(this.snapshots) }, null, 2));
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test` → expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat: snapshot store interface with memory and file backends"
```

---

### Task 4: Market clients — Twelve Data + CoinGecko (TDD)

**Files:**
- Create: `server/market.ts`, `server/twelve-data.ts`, `server/coingecko.ts`
- Test: `server/market.test.ts`

**Interfaces:**
- Consumes: `AssetType` from `../shared/schema.ts`
- Produces (used by `server/app.ts` Task 6, `server/dev.ts` Task 7, `server/lambda.ts` Task 15):

```ts
export type Quote = { symbol: string; type: AssetType; priceUsd: number; asOf: string };
export type Fx = { pair: "USD/SGD"; rate: number; asOf: string };
export class MarketError extends Error {
  constructor(public code: "TICKER_NOT_FOUND" | "UPSTREAM", message: string);
}
export interface MarketClient {
  quote(symbol: string, type: AssetType): Promise<Quote>;        // throws MarketError
  quoteBatch(reqs: { symbol: string; type: AssetType }[]): Promise<{ quotes: Quote[]; failed: string[] }>;
  fx(): Promise<Fx>;                                              // throws MarketError
}
export function createMarketClient(opts: { twelveDataKey: string }): MarketClient;
```

Upstream API facts (verified against docs; free tier = 8 credits/min, 800/day):
- Twelve Data EOD: `GET https://api.twelvedata.com/eod?symbol=AAPL&apikey=K` → `{ symbol, currency: "USD", datetime: "2026-07-03", close: "255.75" }`. Errors come back HTTP 200 with `{ code: 404, status: "error", message }`. Multi-symbol `?symbol=AAPL,MSFT` returns an object keyed by symbol (each value a payload or an error payload); a single symbol returns the flat payload.
- Twelve Data FX: `GET /exchange_rate?symbol=USD/SGD&apikey=K` → `{ symbol: "USD/SGD", rate: 1.328, timestamp: 1782115200 }` (unix seconds → `asOf` date).
- CoinGecko search: `GET https://api.coingecko.com/api/v3/search?query=btc` → `{ coins: [{ id: "bitcoin", symbol: "btc", … }] }` (sorted by relevance/market cap — take the first exact symbol match, case-insensitive).
- CoinGecko price: `GET /api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd` → `{ bitcoin: { usd: 106535 } }`. Spot price → `asOf` = today (UTC `YYYY-MM-DD`).

- [ ] **Step 1: Write failing tests**

`server/market.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketError, createMarketClient } from "./market.ts";

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});

/** Routes fetch calls by URL substring; throws on anything unmatched. */
function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    const u = String(url);
    for (const [needle, body] of Object.entries(routes)) {
      if (u.includes(needle)) return json(body);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }));
}
afterEach(() => vi.unstubAllGlobals());

const client = () => createMarketClient({ twelveDataKey: "test-key" });

describe("stock/etf quotes (Twelve Data)", () => {
  it("returns a USD quote", async () => {
    stubFetch({ "/eod?symbol=AAPL": { symbol: "AAPL", currency: "USD", datetime: "2026-07-03", close: "255.75" } });
    expect(await client().quote("AAPL", "stock")).toEqual(
      { symbol: "AAPL", type: "stock", priceUsd: 255.75, asOf: "2026-07-03" });
  });

  it("maps upstream 404 payload to TICKER_NOT_FOUND", async () => {
    stubFetch({ "/eod?symbol=VOOO": { code: 404, status: "error", message: "symbol not found" } });
    await expect(client().quote("VOOO", "etf")).rejects.toMatchObject(
      { code: "TICKER_NOT_FOUND" } satisfies Partial<MarketError>);
  });

  it("rejects non-USD listings", async () => {
    stubFetch({ "/eod?symbol=D05": { symbol: "D05", currency: "SGD", datetime: "2026-07-03", close: "35.10" } });
    await expect(client().quote("D05", "stock")).rejects.toMatchObject({ code: "TICKER_NOT_FOUND" });
  });
});

describe("crypto quotes (CoinGecko)", () => {
  it("resolves symbol via search then prices it", async () => {
    stubFetch({
      "/search?query=BTC": { coins: [{ id: "bitcoin", symbol: "btc" }] },
      "/simple/price?ids=bitcoin": { bitcoin: { usd: 106535 } },
    });
    const q = await client().quote("BTC", "crypto");
    expect(q.priceUsd).toBe(106535);
    expect(q.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("unknown symbol → TICKER_NOT_FOUND", async () => {
    stubFetch({ "/search?query=NOPE": { coins: [] } });
    await expect(client().quote("NOPE", "crypto")).rejects.toMatchObject({ code: "TICKER_NOT_FOUND" });
  });
});

describe("fx", () => {
  it("returns USD/SGD with asOf date", async () => {
    stubFetch({ "/exchange_rate?symbol=USD%2FSGD": { symbol: "USD/SGD", rate: 1.328, timestamp: 1782115200 } });
    expect(await client().fx()).toEqual({ pair: "USD/SGD", rate: 1.328, asOf: "2026-06-22" });
  });
});

describe("quoteBatch", () => {
  it("mixes types, one call per provider, collects failures", async () => {
    stubFetch({
      "/eod?symbol=VOO%2CXXX": {
        VOO: { symbol: "VOO", currency: "USD", datetime: "2026-07-03", close: "603.79" },
        XXX: { code: 404, status: "error", message: "not found" },
      },
      "/search?query=BTC": { coins: [{ id: "bitcoin", symbol: "btc" }] },
      "/simple/price?ids=bitcoin": { bitcoin: { usd: 106535 } },
    });
    const { quotes, failed } = await client().quoteBatch([
      { symbol: "VOO", type: "etf" }, { symbol: "XXX", type: "stock" }, { symbol: "BTC", type: "crypto" },
    ]);
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["BTC", "VOO"]);
    expect(failed).toEqual(["XXX"]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test` → expected: FAIL — `./market.ts` not found.

- [ ] **Step 3: Implement**

`server/market.ts`:

```ts
import type { AssetType } from "../shared/schema.ts";
import { cgQuotes } from "./coingecko.ts";
import { tdEodBatch, tdFx } from "./twelve-data.ts";

export type Quote = { symbol: string; type: AssetType; priceUsd: number; asOf: string };
export type Fx = { pair: "USD/SGD"; rate: number; asOf: string };

export class MarketError extends Error {
  constructor(public code: "TICKER_NOT_FOUND" | "UPSTREAM", message: string) { super(message); }
}

export interface MarketClient {
  quote(symbol: string, type: AssetType): Promise<Quote>;
  quoteBatch(reqs: { symbol: string; type: AssetType }[]): Promise<{ quotes: Quote[]; failed: string[] }>;
  fx(): Promise<Fx>;
}

export function createMarketClient({ twelveDataKey }: { twelveDataKey: string }): MarketClient {
  async function quoteBatch(reqs: { symbol: string; type: AssetType }[]) {
    const quotes: Quote[] = [];
    const failed: string[] = [];
    const equities = reqs.filter((r) => r.type !== "crypto");
    const cryptos = reqs.filter((r) => r.type === "crypto");

    if (equities.length > 0) {
      const bySymbol = await tdEodBatch(twelveDataKey, equities.map((r) => r.symbol));
      for (const r of equities) {
        const hit = bySymbol.get(r.symbol.toUpperCase());
        if (hit) quotes.push({ symbol: r.symbol.toUpperCase(), type: r.type, ...hit });
        else failed.push(r.symbol.toUpperCase());
      }
    }
    if (cryptos.length > 0) {
      const bySymbol = await cgQuotes(cryptos.map((r) => r.symbol));
      for (const r of cryptos) {
        const hit = bySymbol.get(r.symbol.toUpperCase());
        if (hit) quotes.push({ symbol: r.symbol.toUpperCase(), type: "crypto", ...hit });
        else failed.push(r.symbol.toUpperCase());
      }
    }
    return { quotes, failed };
  }

  return {
    quoteBatch,
    async quote(symbol, type) {
      const { quotes, failed } = await quoteBatch([{ symbol, type }]);
      if (failed.length > 0 || !quotes[0]) {
        throw new MarketError("TICKER_NOT_FOUND", `No data for '${symbol.toUpperCase()}' — check the symbol`);
      }
      return quotes[0];
    },
    fx: () => tdFx(twelveDataKey),
  };
}
```

`server/twelve-data.ts`:

```ts
import { MarketError, type Fx } from "./market.ts";

const BASE = "https://api.twelvedata.com";

type EodPayload = {
  symbol?: string; currency?: string; datetime?: string; close?: string;
  code?: number; status?: string; message?: string;
};

async function get(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const qs = new URLSearchParams({ ...params, apikey: key });
  let res: Response;
  try { res = await fetch(`${BASE}${path}?${qs}`); }
  catch { throw new MarketError("UPSTREAM", "Twelve Data unreachable — try again"); }
  if (!res.ok) throw new MarketError("UPSTREAM", `Twelve Data error (HTTP ${res.status}) — try again`);
  return res.json();
}

function toQuote(p: EodPayload): { priceUsd: number; asOf: string } | null {
  if (p.status === "error" || !p.close || !p.datetime) return null;
  if (p.currency && p.currency !== "USD") return null; // only USD-quoted tickers supported
  return { priceUsd: Number(p.close), asOf: p.datetime };
}

/** One request for all symbols (1 credit each, one HTTP call — free tier is 8 credits/min). */
export async function tdEodBatch(key: string, symbols: string[]): Promise<Map<string, { priceUsd: number; asOf: string }>> {
  const upper = symbols.map((s) => s.toUpperCase());
  const body = await get("/eod", { symbol: upper.join(",") }, key) as Record<string, EodPayload> | EodPayload;
  const out = new Map<string, { priceUsd: number; asOf: string }>();
  if (upper.length === 1) {
    const q = toQuote(body as EodPayload);
    if (q) out.set(upper[0]!, q);
    return out;
  }
  for (const s of upper) {
    const q = toQuote((body as Record<string, EodPayload>)[s] ?? {});
    if (q) out.set(s, q);
  }
  return out;
}

export async function tdFx(key: string): Promise<Fx> {
  const body = await get("/exchange_rate", { symbol: "USD/SGD" }, key) as
    { rate?: number; timestamp?: number; status?: string; message?: string };
  if (body.status === "error" || typeof body.rate !== "number" || !body.timestamp) {
    throw new MarketError("UPSTREAM", body.message ?? "FX rate unavailable — try again");
  }
  return { pair: "USD/SGD", rate: body.rate, asOf: new Date(body.timestamp * 1000).toISOString().slice(0, 10) };
}
```

`server/coingecko.ts`:

```ts
import { MarketError } from "./market.ts";

const BASE = "https://api.coingecko.com/api/v3";

async function get(path: string): Promise<unknown> {
  let res: Response;
  try { res = await fetch(`${BASE}${path}`); }
  catch { throw new MarketError("UPSTREAM", "CoinGecko unreachable — try again"); }
  if (!res.ok) throw new MarketError("UPSTREAM", `CoinGecko error (HTTP ${res.status}) — try again`);
  return res.json();
}

async function resolveId(symbol: string): Promise<string | null> {
  const body = await get(`/search?query=${encodeURIComponent(symbol)}`) as
    { coins: { id: string; symbol: string }[] };
  return body.coins.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase())?.id ?? null;
}

/** Resolves each symbol via /search, then one /simple/price call for all of them. */
export async function cgQuotes(symbols: string[]): Promise<Map<string, { priceUsd: number; asOf: string }>> {
  const out = new Map<string, { priceUsd: number; asOf: string }>();
  const ids = new Map<string, string>(); // symbol (upper) → coingecko id
  for (const s of symbols) {
    const id = await resolveId(s);
    if (id) ids.set(s.toUpperCase(), id);
  }
  if (ids.size === 0) return out;
  const prices = await get(`/simple/price?ids=${[...ids.values()].join(",")}&vs_currencies=usd`) as
    Record<string, { usd?: number }>;
  const today = new Date().toISOString().slice(0, 10);
  for (const [symbol, id] of ids) {
    const usd = prices[id]?.usd;
    if (typeof usd === "number") out.set(symbol, { priceUsd: usd, asOf: today });
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test` → expected: PASS (market suite green, earlier suites still green).

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat: twelve data and coingecko market clients"
```

---

### Task 5: API routes (TDD) — draft, close, snapshots, amend, quote, fx, reset

**Files:**
- Create: `server/app.ts`
- Test: `server/app.test.ts`

**Interfaces:**
- Consumes: `SnapshotStore`/`MemoryStore` (Task 3), `MarketClient`/`MarketError` (Task 4), schemas + `computeTotals` (Task 2)
- Produces: `createApp(deps: { store: SnapshotStore; market: MarketClient; originSecret?: string }): Hono` — the exact HTTP contract in the spec §API (used by Tasks 7/15 entries and by every frontend hook)

- [ ] **Step 1: Write failing tests**

`server/app.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { emptyDraft, type Draft } from "../shared/schema.ts";
import { createApp } from "./app.ts";
import { MarketError, type MarketClient } from "./market.ts";
import { MemoryStore } from "./store.ts";

const stubMarket = (over: Partial<MarketClient> = {}): MarketClient => ({
  quote: vi.fn(async (symbol, type) => ({ symbol, type, priceUsd: 100, asOf: "2026-07-01" })),
  quoteBatch: vi.fn(async (reqs) => ({
    quotes: reqs.map((r) => ({ symbol: r.symbol, type: r.type, priceUsd: 100, asOf: "2026-07-01" })),
    failed: [],
  })),
  fx: vi.fn(async () => ({ pair: "USD/SGD" as const, rate: 1.3, asOf: "2026-07-01" })),
  ...over,
});

function makeApp(over: Partial<MarketClient> = {}, originSecret?: string) {
  return createApp({ store: new MemoryStore(), market: stubMarket(over), originSecret });
}

const jsonReq = (method: string, body: unknown) => ({
  method, body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

const sampleDraft = (): Draft => ({
  ...emptyDraft(),
  holdings: [{ id: crypto.randomUUID(), ticker: "VOO", type: "etf",
    quantity: 10, priceUsd: 600, valueUsd: 6000, asOf: "2026-06-25" }],
  assets: { bankSavings: [{ id: crypto.randomUUID(), name: "DBS", balanceSgd: 1000, asOf: "2026-06-25" }],
    cpf: [], property: [] },
  liabilities: { creditCards: [], loans: [{ id: crypto.randomUUID(), name: "HDB", balanceSgd: 500, asOf: "2026-06-25" }] },
});

describe("draft", () => {
  it("GET returns an empty draft when none saved", async () => {
    const res = await makeApp().request("/api/draft");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(emptyDraft());
  });

  it("PUT validates, stamps updatedAt, persists", async () => {
    const app = makeApp();
    const res = await app.request("/api/draft", jsonReq("PUT", { ...sampleDraft(), fxRate: 1.31 }));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.updatedAt).toBeTruthy();
    expect((await (await app.request("/api/draft")).json()).fxRate).toBe(1.31);
  });

  it("PUT rejects over-limit sections with VALIDATION", async () => {
    const bad = sampleDraft();
    bad.assets.property = [0, 1].map((i) => ({
      id: crypto.randomUUID(), name: `p${i}`, balanceSgd: 1, asOf: "2026-06-25" }));
    const res = await makeApp().request("/api/draft", jsonReq("PUT", bad));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION");
  });
});

describe("close month", () => {
  async function closed(app = makeApp()) {
    await app.request("/api/draft", jsonReq("PUT", sampleDraft()));
    const res = await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-26" }));
    return { app, res };
  }

  it("locks the month with server-computed totals and stub fx", async () => {
    const { res } = await closed();
    expect(res.status).toBe(200);
    const snap = await res.json();
    expect(snap.month).toBe("2026-06");
    expect(snap.fxRate).toBe(1.3);
    // 6000 USD × 1.3 + 1000 − 500
    expect(snap.totals.netWorthSgd).toBe(8300);
  });

  it("uses an explicit fxRate without calling the market", async () => {
    const fx = vi.fn();
    const app = makeApp({ fx });
    await app.request("/api/draft", jsonReq("PUT", sampleDraft()));
    const res = await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-26", fxRate: 1.35 }));
    expect((await res.json()).fxRate).toBe(1.35);
    expect(fx).not.toHaveBeenCalled();
  });

  it("closing the same month twice → 409 MONTH_EXISTS", async () => {
    const { app } = await closed();
    const res = await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-28" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("MONTH_EXISTS");
  });

  it("carries the draft forward with the locked fx", async () => {
    const { app } = await closed();
    const draft = await (await app.request("/api/draft")).json();
    expect(draft.holdings).toHaveLength(1);
    expect(draft.fxRate).toBe(1.3);
  });
});

describe("snapshots", () => {
  it("lists summaries newest first and serves full detail", async () => {
    const app = makeApp();
    await app.request("/api/draft", jsonReq("PUT", sampleDraft()));
    await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-05-28" }));
    await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-26" }));
    const list = (await (await app.request("/api/snapshots")).json()).snapshots;
    expect(list.map((s: { month: string }) => s.month)).toEqual(["2026-06", "2026-05"]);
    expect(list[0].totals.netWorthSgd).toBe(8300);
    expect(list[0].holdings).toBeUndefined(); // summaries only
    const detail = await (await app.request("/api/snapshots/2026-05")).json();
    expect(detail.holdings).toHaveLength(1);
    expect((await app.request("/api/snapshots/2031-01")).status).toBe(404);
  });

  it("amend recomputes totals and preserves closedAt", async () => {
    const app = makeApp();
    await app.request("/api/draft", jsonReq("PUT", sampleDraft()));
    const snap = await (await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-26" }))).json();
    const amended = await (await app.request("/api/snapshots/2026-06", jsonReq("PUT", {
      snapshotDate: "2026-06-26", fxRate: 1.4,
      holdings: snap.holdings, assets: snap.assets, liabilities: snap.liabilities,
    }))).json();
    expect(amended.totals.portfolioSgd).toBe(8400); // 6000 × 1.4
    expect(amended.closedAt).toBe(snap.closedAt);
    expect((await app.request("/api/snapshots/2031-01", jsonReq("PUT", {
      snapshotDate: "2031-01-26", fxRate: 1.3, ...emptyDraft(),
    }))).status).toBe(404);
  });
});

describe("quote / fx / reset", () => {
  it("single quote and batch quotes", async () => {
    const app = makeApp();
    const q = await (await app.request("/api/quote?symbol=AAPL&type=stock")).json();
    expect(q.priceUsd).toBe(100);
    const batch = await (await app.request("/api/quote?symbols=VOO:etf,BTC:crypto")).json();
    expect(batch.quotes).toHaveLength(2);
    expect(batch.failed).toEqual([]);
  });

  it("maps MarketError to status codes", async () => {
    const app = makeApp({ quote: vi.fn(async () => { throw new MarketError("TICKER_NOT_FOUND", "no"); }) });
    const res = await app.request("/api/quote?symbol=XXXX&type=stock");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("TICKER_NOT_FOUND");
    const app2 = makeApp({ fx: vi.fn(async () => { throw new MarketError("UPSTREAM", "down"); }) });
    expect((await app2.request("/api/fx")).status).toBe(502);
  });

  it("bad type param → 400", async () => {
    expect((await makeApp().request("/api/quote?symbol=AAPL&type=bond")).status).toBe(400);
  });

  it("reset wipes everything", async () => {
    const app = makeApp();
    await app.request("/api/draft", jsonReq("PUT", sampleDraft()));
    await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-26" }));
    expect((await (await app.request("/api/reset", { method: "POST" })).json()).deleted).toBe(2);
    expect((await (await app.request("/api/snapshots")).json()).snapshots).toEqual([]);
  });
});

describe("origin secret", () => {
  it("403 without the header, 200 with it", async () => {
    const app = makeApp({}, "s3cret");
    expect((await app.request("/api/draft")).status).toBe(403);
    expect((await app.request("/api/draft", { headers: { "x-origin-secret": "s3cret" } })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test` → expected: FAIL — `./app.ts` not found.

- [ ] **Step 3: Implement**

`server/app.ts`:

```ts
import { Hono, type Context } from "hono";
import {
  amendInputSchema, assetTypeSchema, closeInputSchema, draftInputSchema,
  emptyDraft, type AssetType, type Snapshot,
} from "../shared/schema.ts";
import { computeTotals } from "../shared/totals.ts";
import { MarketError, type MarketClient } from "./market.ts";
import type { SnapshotStore } from "./store.ts";

export type AppDeps = { store: SnapshotStore; market: MarketClient; originSecret?: string };

export function createApp({ store, market, originSecret }: AppDeps) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof MarketError) {
      const status = err.code === "TICKER_NOT_FOUND" ? 404 : 502;
      return c.json({ error: err.code, message: err.message }, status);
    }
    console.error(err);
    return c.json({ error: "INTERNAL", message: "Something went wrong" }, 500);
  });

  const api = new Hono();

  if (originSecret) {
    api.use("*", async (c, next) => {
      if (c.req.header("x-origin-secret") !== originSecret) {
        return c.json({ error: "FORBIDDEN", message: "Missing origin secret" }, 403);
      }
      await next();
    });
  }

  const invalid = (c: Context, issues: unknown) =>
    c.json({ error: "VALIDATION", message: "Invalid payload", issues }, 400);

  api.get("/draft", async (c) => c.json(await store.getDraft() ?? emptyDraft()));

  api.put("/draft", async (c) => {
    const parsed = draftInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const draft = { ...parsed.data, updatedAt: new Date().toISOString() };
    await store.putDraft(draft);
    return c.json(draft);
  });

  api.post("/close", async (c) => {
    const parsed = closeInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const draft = await store.getDraft() ?? emptyDraft();
    const fxRate = parsed.data.fxRate ?? (await market.fx()).rate;
    const { holdings, assets, liabilities } = draft;
    const snapshot: Snapshot = {
      month: parsed.data.snapshotDate.slice(0, 7),
      snapshotDate: parsed.data.snapshotDate,
      fxRate,
      closedAt: new Date().toISOString(),
      holdings, assets, liabilities,
      totals: computeTotals(draft, fxRate),
    };
    if (!await store.createSnapshot(snapshot)) {
      return c.json({ error: "MONTH_EXISTS", message: `${snapshot.month} is already closed` }, 409);
    }
    await store.putDraft({ holdings, assets, liabilities, fxRate, updatedAt: snapshot.closedAt });
    return c.json(snapshot);
  });

  api.get("/snapshots", async (c) => {
    const snapshots = (await store.listSnapshots()).map(
      ({ month, snapshotDate, fxRate, totals }) => ({ month, snapshotDate, fxRate, totals }));
    return c.json({ snapshots });
  });

  api.get("/snapshots/:month", async (c) => {
    const snap = await store.getSnapshot(c.req.param("month"));
    return snap ? c.json(snap) : c.json({ error: "NOT_FOUND", message: "No such snapshot" }, 404);
  });

  api.put("/snapshots/:month", async (c) => {
    const month = c.req.param("month");
    const existing = await store.getSnapshot(month);
    if (!existing) return c.json({ error: "NOT_FOUND", message: "No such snapshot" }, 404);
    const parsed = amendInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const snapshot: Snapshot = {
      ...parsed.data, month, closedAt: existing.closedAt,
      totals: computeTotals(parsed.data, parsed.data.fxRate),
    };
    await store.putSnapshot(snapshot);
    return c.json(snapshot);
  });

  api.get("/quote", async (c) => {
    const { symbol, type, symbols } = c.req.query();
    if (symbols) {
      const reqs: { symbol: string; type: AssetType }[] = [];
      for (const pair of symbols.split(",")) {
        const [s, t] = pair.split(":");
        const parsedType = assetTypeSchema.safeParse(t);
        if (!s || !parsedType.success) {
          return c.json({ error: "VALIDATION", message: `Bad symbols entry '${pair}'` }, 400);
        }
        reqs.push({ symbol: s, type: parsedType.data });
      }
      return c.json(await market.quoteBatch(reqs));
    }
    const parsedType = assetTypeSchema.safeParse(type);
    if (!symbol || !parsedType.success) {
      return c.json({ error: "VALIDATION", message: "symbol and type=stock|etf|crypto required" }, 400);
    }
    return c.json(await market.quote(symbol, parsedType.data));
  });

  api.get("/fx", async (c) => c.json(await market.fx()));

  api.post("/reset", async (c) => c.json({ deleted: await store.reset() }));

  app.route("/api", api);
  return app;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test` → expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add server && git commit -m "feat: hono api - draft, close, snapshots, amend, quote, fx, reset"
```

---

### Task 6: Local dev server + end-to-end smoke

**Files:**
- Create: `server/dev.ts`

**Interfaces:**
- Consumes: `createApp` (Task 5), `FileStore` (Task 3), `createMarketClient` (Task 4)
- Produces: `npm run dev:api` on port 8787 with file persistence at `.data/store.json`; the Vite proxy from Task 1 makes `/api/*` same-origin for the SPA.

- [ ] **Step 1: Implement**

`server/dev.ts`:

```ts
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { FileStore } from "./file-store.ts";
import { createMarketClient } from "./market.ts";

try { process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); } catch { /* no .env yet */ }

const twelveDataKey = process.env.TWELVE_DATA_API_KEY ?? "";
if (!twelveDataKey) {
  console.warn("[api] TWELVE_DATA_API_KEY not set (copy server/.env.example to server/.env) — quotes/fx will fail");
}

const app = createApp({
  store: new FileStore(fileURLToPath(new URL("../.data/store.json", import.meta.url))),
  market: createMarketClient({ twelveDataKey }),
});

serve({ fetch: app.fetch, port: 8787 }, (info) =>
  console.log(`[api] listening on http://localhost:${info.port}`));
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev:api &` then:

```bash
curl -s localhost:8787/api/draft
# expected: {"holdings":[],"assets":{"bankSavings":[],"cpf":[],"property":[]},"liabilities":{"creditCards":[],"loans":[]}}
curl -s -X PUT localhost:8787/api/draft -H 'content-type: application/json' \
  -d '{"holdings":[],"assets":{"bankSavings":[{"id":"11111111-1111-4111-8111-111111111111","name":"DBS","balanceSgd":100,"asOf":"2026-07-01"}],"cpf":[],"property":[]},"liabilities":{"creditCards":[],"loans":[]}}'
# expected: same document back with an updatedAt; .data/store.json now exists
```

Kill the background server afterwards. (If a real key is in `server/.env`, also try `curl -s "localhost:8787/api/quote?symbol=AAPL&type=stock"` — expect a real price.)

- [ ] **Step 3: Typecheck + commit**

Run: `npm run build` → expected: clean.

```bash
git add server && git commit -m "feat: local api server with file-backed store"
```

---

### Task 7: Frontend foundation — theme, fonts, shell, routes, shared components

**Files:**
- Modify: `src/App.css`, `index.html`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`
- Create: `src/components/layout/app-shell.tsx`, `src/components/page-header.tsx`, `src/components/responsive-modal.tsx`, `src/components/empty-state.tsx`, `src/components/error-state.tsx`, `src/hooks/use-media-query.ts`, `src/routes/{portfolio,assets,history,settings}.tsx`
- shadcn CLI output in `src/components/ui/` (do not hand-edit)

**Interfaces:**
- Produces: `AppShell`, `PageHeader({ eyebrow, title, action? })`, `ResponsiveModal({ open, onOpenChange, title, description?, wide?, children })` (Dialog ≥640px / Drawer below), `EmptyState({ icon, title, hint, action? })`, `ErrorState({ message, onRetry })`, `useMediaQuery(query): boolean`, route objects `portfolioRoute/assetsRoute/historyRoute/settingsRoute`, `font-display` utility class, `glow` utility class.
- Route files created here render placeholders; Tasks 9–13 replace each file's component wholesale.

- [ ] **Step 1: Add shadcn primitives**

```bash
npx shadcn@latest add card dialog drawer input label select alert-dialog skeleton separator
```

- [ ] **Step 2: Theme + fonts**

`src/App.css` — append after the existing imports:

```css
@import "@fontsource/instrument-serif";

:root {
  --background: #0b120e;
  --foreground: #edeee8;
  --card: #101913;
  --card-foreground: #edeee8;
  --popover: #0f1712;
  --popover-foreground: #edeee8;
  --primary: #e3c878;
  --primary-foreground: #1a1607;
  --secondary: #1a241e;
  --secondary-foreground: #edeee8;
  --muted: #16201a;
  --muted-foreground: #9aa89e;
  --accent: #1c271f;
  --accent-foreground: #edeee8;
  --destructive: #e37878;
  --destructive-foreground: #2a0e0e;
  --border: #223028;
  --input: #223028;
  --ring: #e3c878;
  --radius: 1rem;
}

@theme inline {
  --font-display: "Instrument Serif", ui-serif, Georgia, serif;
}

body {
  background: radial-gradient(1200px 800px at 15% -10%, #13241a 0%, var(--background) 55%) fixed;
  color: var(--foreground);
}

@utility glow {
  text-shadow: 0 0 24px rgb(242 239 227 / 0.35), 0 0 64px rgb(242 239 227 / 0.15);
}
```

`index.html` — set `<title>ToTheMoon</title>`, add `class="dark"` to `<html>`, and `<meta name="theme-color" content="#0b120e" />`.

- [ ] **Step 3: Layout shell + shared components**

`src/hooks/use-media-query.ts`:

```ts
import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
  );
}
```

`src/components/layout/app-shell.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { ChartPie, Clock, LayoutGrid, Rocket, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/portfolio", label: "Portfolio", icon: ChartPie },
  { to: "/assets", label: "Assets", icon: Wallet },
  { to: "/history", label: "History", icon: Clock },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-8 border-r border-border/60 p-6 md:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <Rocket className="size-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">ToTheMoon</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Build wealth. Go further.
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "border border-primary/30 bg-primary/10 !text-primary" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/60 bg-background/85 backdrop-blur md:hidden">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground"
            activeProps={{ className: "!text-primary" }}
            activeOptions={{ exact: to === "/" }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl p-4 pb-24 md:p-10 md:pb-12">{children}</div>
      </main>
    </div>
  );
}
```

`src/components/page-header.tsx`:

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";

export function PageHeader(props: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{props.eyebrow}</div>
        <h1 className="font-display text-4xl text-foreground md:text-5xl">{props.title}</h1>
      </div>
      {props.action}
    </motion.header>
  );
}
```

`src/components/responsive-modal.tsx`:

```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { ReactNode } from "react";

export function ResponsiveModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  if (isDesktop) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className={props.wide ? "max-h-[85vh] overflow-y-auto sm:max-w-3xl" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            {props.description && <DialogDescription>{props.description}</DialogDescription>}
          </DialogHeader>
          {props.children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{props.title}</DrawerTitle>
          {props.description && <DrawerDescription>{props.description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{props.children}</div>
      </DrawerContent>
    </Drawer>
  );
}
```

`src/components/empty-state.tsx`:

```tsx
import { motion } from "motion/react";
import type { ComponentType, ReactNode } from "react";

export function EmptyState(props: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/80 px-6 py-14 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <div className="text-lg font-medium">{props.title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{props.hint}</p>
      {props.action}
    </motion.div>
  );
}
```

`src/components/error-state.tsx`:

```tsx
import { Button } from "@/components/ui/button";

export function ErrorState(props: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-6 py-10 text-center">
      <p className="text-sm text-destructive">{props.message}</p>
      <Button variant="outline" onClick={props.onRetry}>Retry</Button>
    </div>
  );
}
```

- [ ] **Step 4: Wire routes**

`src/routes/__root.tsx` — replace `RootLayout` body:

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AppShell } from "@/components/layout/app-shell";

export const rootRoute = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
      <TanStackRouterDevtools />
    </AppShell>
  );
}
```

Create `src/routes/portfolio.tsx` (and the same pattern for `assets.tsx` → `assetsRoute`/path `/assets`/eyebrow "ASSETS"/title "What you own", `history.tsx` → `historyRoute`/`/history`/"HISTORY"/"Monthly snapshots", `settings.tsx` → `settingsRoute`/`/settings`/"SETTINGS"/"Configuration"):

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";

export const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portfolio",
  component: PortfolioPage,
});

function PortfolioPage() {
  return <PageHeader eyebrow="PORTFOLIO (USD)" title="Portfolio" />;
}
```

`src/routes/index.tsx` — replace `HomePage` with `<PageHeader eyebrow="TOTAL NET WORTH" title="Dashboard" />` (same imports pattern).

`src/router.tsx` — register everything:

```ts
const routeTree = rootRoute.addChildren([
  indexRoute, portfolioRoute, assetsRoute, historyRoute, settingsRoute,
]);
```

(with the four new imports alongside `indexRoute`.)

- [ ] **Step 5: Verify + commit**

Run: `npm run build` → clean. Run `npm run dev`, open http://localhost:5173 → expected: dark theme, gold-accented sidebar at desktop width, 5-tab bottom bar at mobile width (devtools responsive mode, 375 px — no horizontal scroll), each route renders its serif page title.

```bash
git add -A && git commit -m "feat: dark theme, app shell with sidebar/bottom nav, route skeleton"
```

---

### Task 8: Frontend data layer — api client, formatting, query hooks

**Files:**
- Create: `src/lib/api.ts`, `src/lib/format.ts`, `src/hooks/use-draft.ts`, `src/hooks/use-snapshots.ts`

**Interfaces:**
- Consumes: shared types via `@shared/schema`, `@shared/totals`; `queryClient` from `src/lib/query-client.ts` (scaffold).
- Produces (used by all screen tasks):

```ts
// api.ts
class ApiError extends Error { status: number; code: string }
function api<T>(path: string, init?: RequestInit): Promise<T>
// format.ts
sgd(n), usd(n), compactSgd(n), pct(n), qty(n), monthLabel("2026-06") → "Jun 2026", dateLabel("2026-06-26") → "26 Jun 2026"
// use-draft.ts
useDraft(): UseQueryResult<Draft>
useSaveDraft(): UseMutationResult<Draft, ApiError, DraftInput>   // optimistic + rollback
// use-snapshots.ts
type SnapshotSummary = { month: string; snapshotDate: string; fxRate: number; totals: Totals }
useSnapshots(): UseQueryResult<SnapshotSummary[]>
useSnapshot(month: string, enabled?: boolean): UseQueryResult<Snapshot>
useCloseMonth(): UseMutationResult<Snapshot, ApiError, CloseInput>
useAmendSnapshot(month: string): UseMutationResult<Snapshot, ApiError, AmendInput>
useResetAll(): UseMutationResult<{ deleted: number }, ApiError, void>
```

- [ ] **Step 1: Implement**

`src/lib/api.ts`:

```ts
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "UNKNOWN", body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
```

`src/lib/format.ts`:

```ts
const sgdFmt = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactFmt = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", notation: "compact", maximumFractionDigits: 1 });
const qtyFmt = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 8 });

export const sgd = (n: number) => sgdFmt.format(n);
export const usd = (n: number) => usdFmt.format(n);
export const compactSgd = (n: number) => compactFmt.format(n);
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const qty = (n: number) => qtyFmt.format(n);
export const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" });
export const dateLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
```

`src/hooks/use-draft.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft, DraftInput } from "@shared/schema";
import { api } from "@/lib/api";

export const draftKey = ["draft"] as const;

export function useDraft() {
  return useQuery({ queryKey: draftKey, queryFn: () => api<Draft>("/api/draft") });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: DraftInput) =>
      api<Draft>("/api/draft", { method: "PUT", body: JSON.stringify(draft) }),
    onMutate: async (draft) => {
      await qc.cancelQueries({ queryKey: draftKey });
      const previous = qc.getQueryData<Draft>(draftKey);
      qc.setQueryData<Draft>(draftKey, { ...draft, updatedAt: new Date().toISOString() });
      return { previous };
    },
    onError: (_err, _draft, ctx) => {
      if (ctx?.previous) qc.setQueryData(draftKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: draftKey }),
  });
}
```

`src/hooks/use-snapshots.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AmendInput, CloseInput, Snapshot, Totals } from "@shared/schema";
import { api } from "@/lib/api";
import { draftKey } from "@/hooks/use-draft";

export type SnapshotSummary = { month: string; snapshotDate: string; fxRate: number; totals: Totals };

export function useSnapshots() {
  return useQuery({
    queryKey: ["snapshots"],
    queryFn: () => api<{ snapshots: SnapshotSummary[] }>("/api/snapshots").then((r) => r.snapshots),
  });
}

export function useSnapshot(month: string, enabled = true) {
  return useQuery({
    queryKey: ["snapshot", month],
    queryFn: () => api<Snapshot>(`/api/snapshots/${month}`),
    enabled,
  });
}

export function useCloseMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseInput) =>
      api<Snapshot>("/api/close", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      qc.invalidateQueries({ queryKey: draftKey });
    },
  });
}

export function useAmendSnapshot(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AmendInput) =>
      api<Snapshot>(`/api/snapshots/${month}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: (snap) => {
      qc.setQueryData(["snapshot", month], snap);
      qc.invalidateQueries({ queryKey: ["snapshots"] });
    },
  });
}

export function useResetAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ deleted: number }>("/api/reset", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run build` → clean (this proves the `@shared` alias works from `src/`).

```bash
git add src && git commit -m "feat: api client, currency formatting, draft/snapshot query hooks"
```

---

### Task 9: Portfolio screen

**Files:**
- Create: `src/features/portfolio/types.ts`, `src/features/portfolio/components/holdings-table.tsx`, `src/features/portfolio/components/holding-form.tsx`
- Modify (replace contents): `src/routes/portfolio.tsx`

**Interfaces:**
- Consumes: `useDraft`/`useSaveDraft`, `api`/`ApiError`, `ResponsiveModal`, `EmptyState`/`ErrorState`, `round2` from `@shared/totals`, shadcn `button/input/label/select/alert-dialog/skeleton`.
- Produces (reused by History Task 12): `HoldingsTable({ holdings, onEdit?, onDelete?, filterable? })` — read-only when no callbacks, filter/search toolbar only when `filterable`; `HoldingForm({ open, onOpenChange, initial?, onSave(holding, fxRate) })`; `Quote` type in `types.ts`.
- Table engine: **TanStack Table** (`@tanstack/react-table`, already a dependency) — asset-type filter tabs, ticker search (global filter), click-to-sort columns, default sort `valueUsd` descending.

- [ ] **Step 1: Types + table**

`src/features/portfolio/types.ts`:

```ts
import type { AssetType } from "@shared/schema";

export type Quote = { symbol: string; type: AssetType; priceUsd: number; asOf: string };
export type QuoteBatch = { quotes: Quote[]; failed: string[] };
export type FxResponse = { pair: "USD/SGD"; rate: number; asOf: string };
```

`src/features/portfolio/components/holdings-table.tsx`:

```tsx
import { useMemo, useState } from "react";
import {
  createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel,
  getSortedRowModel, useReactTable,
  type ColumnFiltersState, type SortingState,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetType, Holding } from "@shared/schema";
import { pct, qty, usd } from "@/lib/format";

const TYPE_TABS: { value: "all" | AssetType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stock", label: "Stocks" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
];

// Per-column cell classes (also hides Type/Price on mobile to avoid horizontal scroll)
const CELL_CLASS: Record<string, string> = {
  ticker: "px-4 py-3",
  type: "hidden px-4 py-3 sm:table-cell",
  quantity: "px-4 py-3 text-right",
  priceUsd: "hidden px-4 py-3 text-right sm:table-cell",
  valueUsd: "px-4 py-3 text-right",
  share: "px-4 py-3 text-right",
  actions: "w-20 px-2 py-3 text-right whitespace-nowrap",
};

export function HoldingsTable(props: {
  holdings: Holding[];
  onEdit?: (h: Holding) => void;
  onDelete?: (h: Holding) => void;
  filterable?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "valueUsd", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const readOnly = !props.onEdit && !props.onDelete;
  const total = props.holdings.reduce((acc, h) => acc + h.valueUsd, 0);
  const { onEdit, onDelete } = props;

  const columns = useMemo(() => {
    const col = createColumnHelper<Holding>();
    return [
      col.accessor("ticker", {
        header: "Ticker",
        cell: (c) => <span className="font-medium">{c.getValue()}</span>,
      }),
      col.accessor("type", {
        header: "Type",
        filterFn: "equals",
        cell: (c) => <span className="capitalize text-muted-foreground">{c.getValue()}</span>,
      }),
      col.accessor("quantity", { header: "Qty", cell: (c) => qty(c.getValue()) }),
      col.accessor("priceUsd", { header: "Price (USD)", cell: (c) => usd(c.getValue()) }),
      col.accessor("valueUsd", { header: "Value (USD)", cell: (c) => usd(c.getValue()) }),
      col.display({
        id: "share",
        header: "%",
        cell: (c) => (
          <span className="text-muted-foreground">
            {total > 0 ? pct(c.row.original.valueUsd / total) : "–"}
          </span>
        ),
      }),
      ...(readOnly
        ? []
        : [
            col.display({
              id: "actions",
              header: "",
              cell: (c) => (
                <>
                  {onEdit && (
                    <Button variant="ghost" size="icon" aria-label={`Edit ${c.row.original.ticker}`}
                      onClick={() => onEdit(c.row.original)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${c.row.original.ticker}`}
                      onClick={() => onDelete(c.row.original)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </>
              ),
            }),
          ]),
    ];
  }, [total, readOnly, onEdit, onDelete]);

  const table = useReactTable({
    data: props.holdings,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value) =>
      row.original.ticker.toUpperCase().includes(String(value).trim().toUpperCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const activeType = (columnFilters.find((f) => f.id === "type")?.value as AssetType | undefined) ?? "all";
  const setType = (value: "all" | AssetType) =>
    setColumnFilters(value === "all" ? [] : [{ id: "type", value }]);
  const rows = table.getRowModel().rows;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {props.filterable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
          <div className="flex gap-1">
            {TYPE_TABS.map((t) => (
              <Button key={t.value} size="sm" variant={activeType === t.value ? "secondary" : "ghost"}
                onClick={() => setType(t.value)}>
                {t.label}
              </Button>
            ))}
          </div>
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Filter tickers…"
            className="h-8 w-40"
          />
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              {hg.headers.map((header) => (
                <th key={header.id} className={`${CELL_CLASS[header.column.id]} font-medium`}>
                  {header.column.getCanSort() ? (
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.length === 0 && props.holdings.length > 0 && (
              <tr>
                <td colSpan={readOnly ? 6 : 7} className="px-4 py-6 text-center text-muted-foreground">
                  No holdings match.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <motion.tr
                key={row.original.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="border-t border-border/40"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={CELL_CLASS[cell.column.id]}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Holding form with quote fetch**

`src/features/portfolio/components/holding-form.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveModal } from "@/components/responsive-modal";
import { api, ApiError } from "@/lib/api";
import { dateLabel, usd } from "@/lib/format";
import { round2 } from "@shared/totals";
import type { AssetType, Holding } from "@shared/schema";
import type { FxResponse, Quote } from "../types";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; quote: Quote; fxRate: number }
  | { status: "error"; message: string };

export function HoldingForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Holding;
  onSave: (holding: Holding, fxRate: number) => void;
}) {
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<AssetType>("stock");
  const [quantityStr, setQuantityStr] = useState("");
  const [asOf, setAsOf] = useState("");
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });

  useEffect(() => {
    if (!props.open) return;
    setTicker(props.initial?.ticker ?? "");
    setType(props.initial?.type ?? "stock");
    setQuantityStr(props.initial ? String(props.initial.quantity) : "");
    setAsOf(props.initial?.asOf ?? "");
    setQuote({ status: "idle" });
  }, [props.open, props.initial]);

  async function fetchQuote() {
    const symbol = ticker.trim();
    if (!symbol || quote.status === "loading") return;
    setQuote({ status: "loading" });
    try {
      const [q, fx] = await Promise.all([
        api<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`),
        api<FxResponse>("/api/fx"),
      ]);
      setQuote({ status: "ok", quote: q, fxRate: fx.rate });
    } catch (err) {
      setQuote({
        status: "error",
        message: err instanceof ApiError ? err.message : "Couldn't fetch the price — try again",
      });
    }
  }

  const quantity = Number(quantityStr);
  const canSave = quote.status === "ok" && asOf !== "" && Number.isFinite(quantity) && quantity > 0;

  function save() {
    if (quote.status !== "ok" || !canSave) return;
    props.onSave(
      {
        id: props.initial?.id ?? crypto.randomUUID(),
        ticker: quote.quote.symbol,
        type,
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
      description="Prices are fetched end-of-day in USD."
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input
              id="ticker" autoCapitalize="characters" placeholder="VOO"
              value={ticker}
              onChange={(e) => { setTicker(e.target.value.toUpperCase()); setQuote({ status: "idle" }); }}
              onBlur={fetchQuote}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v as AssetType); setQuote({ status: "idle" }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Stock</SelectItem>
                <SelectItem value="etf">ETF</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
          {quote.status === "idle" && <span className="text-muted-foreground">Enter a ticker to fetch its end-of-day price.</span>}
          {quote.status === "loading" && <Skeleton className="h-5 w-40" />}
          {quote.status === "ok" && (
            <span>
              {usd(quote.quote.priceUsd)}
              <span className="text-muted-foreground"> · EOD {dateLabel(quote.quote.asOf)} · USD/SGD {quote.fxRate}</span>
            </span>
          )}
          {quote.status === "error" && <span className="text-destructive">{quote.message}</span>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          {quote.status === "error" || quote.status === "idle" ? (
            <Button variant="outline" onClick={fetchQuote} disabled={!ticker.trim()}>Fetch price</Button>
          ) : null}
          <Button onClick={save} disabled={!canSave}>Save holding</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 3: Portfolio page**

`src/routes/portfolio.tsx` — replace entire file:

```tsx
import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { ChartPie, Plus, RefreshCw } from "lucide-react";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { usd } from "@/lib/format";
import { useDraft, useSaveDraft } from "@/hooks/use-draft";
import { round2 } from "@shared/totals";
import type { Holding } from "@shared/schema";
import { HoldingsTable } from "@/features/portfolio/components/holdings-table";
import { HoldingForm } from "@/features/portfolio/components/holding-form";
import type { FxResponse, QuoteBatch } from "@/features/portfolio/types";

export const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portfolio",
  component: PortfolioPage,
});

function PortfolioPage() {
  const { data: draft, isPending, isError, refetch } = useDraft();
  const save = useSaveDraft();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | undefined>();
  const [deleting, setDeleting] = useState<Holding | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !draft) return <ErrorState message="Couldn't load your portfolio." onRetry={() => refetch()} />;

  const totalUsd = round2(draft.holdings.reduce((acc, h) => acc + h.valueUsd, 0));

  const upsert = (holding: Holding, fxRate: number) => {
    const exists = draft.holdings.some((h) => h.id === holding.id);
    save.mutate({
      ...draft,
      holdings: exists
        ? draft.holdings.map((h) => (h.id === holding.id ? holding : h))
        : [...draft.holdings, holding],
      fxRate,
    });
  };

  async function refreshPrices() {
    if (!draft || draft.holdings.length === 0 || refreshing) return;
    setRefreshing(true);
    setNote(null);
    try {
      const symbols = draft.holdings.map((h) => `${h.ticker}:${h.type}`).join(",");
      const [batch, fx] = await Promise.all([
        api<QuoteBatch>(`/api/quote?symbols=${encodeURIComponent(symbols)}`),
        api<FxResponse>("/api/fx"),
      ]);
      const holdings = draft.holdings.map((h) => {
        const q = batch.quotes.find((q) => q.symbol === h.ticker.toUpperCase() && q.type === h.type);
        return q ? { ...h, priceUsd: q.priceUsd, valueUsd: round2(h.quantity * q.priceUsd), asOf: q.asOf } : h;
      });
      save.mutate({ ...draft, holdings, fxRate: fx.rate });
      if (batch.failed.length > 0) setNote(`Couldn't refresh: ${batch.failed.join(", ")}`);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Refresh failed — try again");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="PORTFOLIO (USD)"
        title={usd(totalUsd)}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshPrices} disabled={draft.holdings.length === 0 || refreshing}>
              <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} /> Refresh prices
            </Button>
            <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}>
              <Plus className="size-4" /> Add Holding
            </Button>
          </div>
        }
      />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        {draft.holdings.length} holdings · stored in USD, converted at the FX rate on close.
      </p>
      {note && <p className="mb-4 text-sm text-destructive">{note}</p>}

      {draft.holdings.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title="No holdings yet"
          hint="Add your first stock, ETF, or crypto holding and we'll fetch its end-of-day USD price."
          action={<Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Add your first holding</Button>}
        />
      ) : (
        <HoldingsTable
          holdings={draft.holdings}
          filterable
          onEdit={(h) => { setEditing(h); setFormOpen(true); }}
          onDelete={setDeleting}
        />
      )}

      <HoldingForm open={formOpen} onOpenChange={setFormOpen} initial={editing} onSave={upsert} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.ticker}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the current draft only — closed months are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) save.mutate({ ...draft, holdings: draft.holdings.filter((h) => h.id !== deleting.id) });
                setDeleting(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → clean. With `npm run dev` (real Twelve Data key in `server/.env`): add `AAPL` stock — shimmer then a real price appears, Save disabled until a date is picked; add `VOO` etf and `BTC` crypto; add ticker `VOOO` → inline error, Save stays disabled, inputs preserved; edit a quantity → value updates; delete a row → confirm → row animates out; Refresh prices updates all rows; type tabs (All/Stocks/ETFs/Crypto) filter the rows and the search box narrows by ticker (with a "No holdings match." row when nothing matches); clicking Qty/Price/Value headers re-sorts; at 375 px wide, no horizontal scroll (Type/Price columns hidden).

```bash
git add src && git commit -m "feat: portfolio screen with quote fetch, batch refresh, animated table"
```

---

### Task 10: Assets screen (assets & liabilities)

**Files:**
- Create: `src/features/assets/sections.ts`, `src/features/assets/components/section-card.tsx`, `src/features/assets/components/entry-form.tsx`
- Modify (replace contents): `src/routes/assets.tsx`

**Interfaces:**
- Consumes: `useDraft`/`useSaveDraft`, `ResponsiveModal`, `SECTION_LIMITS`, shadcn primitives.
- Produces (reused by History Task 12): `SectionCard({ title, icon, entries, limit, tone, onAdd?, onEdit?, onDelete? })` — read-only without callbacks; `EntryForm({ open, onOpenChange, initial?, sectionTitle, onSave })`; `ASSET_SECTIONS`/`LIABILITY_SECTIONS` configs.

- [ ] **Step 1: Section configs**

`src/features/assets/sections.ts`:

```ts
import { Banknote, Building2, CreditCard, Landmark, PiggyBank } from "lucide-react";
import type { ComponentType } from "react";
import type { Assets, Liabilities } from "@shared/schema";
import { SECTION_LIMITS } from "@shared/schema";

export type AssetSectionKey = keyof Assets;
export type LiabilitySectionKey = keyof Liabilities;

type Section<K> = { key: K; title: string; limit: number; icon: ComponentType<{ className?: string }> };

export const ASSET_SECTIONS: Section<AssetSectionKey>[] = [
  { key: "bankSavings", title: "Bank Savings", limit: SECTION_LIMITS.bankSavings, icon: PiggyBank },
  { key: "cpf", title: "CPF", limit: SECTION_LIMITS.cpf, icon: Landmark },
  { key: "property", title: "Property", limit: SECTION_LIMITS.property, icon: Building2 },
];

export const LIABILITY_SECTIONS: Section<LiabilitySectionKey>[] = [
  { key: "creditCards", title: "Credit Cards", limit: SECTION_LIMITS.creditCards, icon: CreditCard },
  { key: "loans", title: "Loans", limit: Number.POSITIVE_INFINITY, icon: Banknote },
];
```

- [ ] **Step 2: Section card + entry form**

`src/features/assets/components/section-card.tsx`:

```tsx
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import type { Entry } from "@shared/schema";
import { dateLabel, sgd } from "@/lib/format";

export function SectionCard(props: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  entries: Entry[];
  limit: number;
  tone: "asset" | "liability";
  onAdd?: () => void;
  onEdit?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
}) {
  const Icon = props.icon;
  const total = props.entries.reduce((acc, e) => acc + e.balanceSgd, 0);
  const atLimit = props.entries.length >= props.limit;
  const negative = props.tone === "liability";
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-border/60 bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={
              negative
                ? "flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                : "flex size-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"
            }
          >
            <Icon className="size-5" />
          </div>
          <div>
            <div className="font-medium">{props.title}</div>
            <div className="text-xs text-muted-foreground">
              {negative && total > 0 ? "-" : ""}{sgd(total)} · {props.entries.length}/
              {Number.isFinite(props.limit) ? props.limit : "∞"}
            </div>
          </div>
        </div>
        {props.onAdd && (
          <Button variant="ghost" size="sm" onClick={props.onAdd} disabled={atLimit}
            title={atLimit ? "Max reached" : undefined}>
            <Plus className="size-4" /> Add
          </Button>
        )}
      </div>

      {props.entries.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-muted-foreground">No entries yet — add your first.</p>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {props.entries.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center justify-between gap-3 border-t border-border/40 py-3 first:border-t-0"
              >
                <div>
                  <div className="text-sm font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">as of {dateLabel(e.asOf)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={negative ? "text-sm text-destructive" : "text-sm"}>
                    {negative ? "-" : ""}{sgd(e.balanceSgd)}
                  </span>
                  {props.onEdit && (
                    <Button variant="ghost" size="icon" aria-label={`Edit ${e.name}`} onClick={() => props.onEdit!(e)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {props.onDelete && (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${e.name}`} onClick={() => props.onDelete!(e)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  );
}
```

`src/features/assets/components/entry-form.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/responsive-modal";
import type { Entry } from "@shared/schema";
import { round2 } from "@shared/totals";

export function EntryForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Entry;
  sectionTitle: string;
  onSave: (entry: Entry) => void;
}) {
  const [name, setName] = useState("");
  const [balanceStr, setBalanceStr] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(props.initial?.name ?? "");
    setBalanceStr(props.initial ? String(props.initial.balanceSgd) : "");
    setAsOf(props.initial?.asOf ?? "");
  }, [props.open, props.initial]);

  const balance = Number(balanceStr);
  const canSave = name.trim() !== "" && asOf !== "" && Number.isFinite(balance) && balance >= 0;

  return (
    <ResponsiveModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.initial ? `Edit ${props.initial.name}` : `Add to ${props.sectionTitle}`}
      description="Balances are in SGD."
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-name">Name</Label>
          <Input id="entry-name" placeholder="DBS Multiplier" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="entry-balance">Balance (SGD)</Label>
            <Input id="entry-balance" type="number" inputMode="decimal" min="0" step="any"
              value={balanceStr} onChange={(e) => setBalanceStr(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entry-asof">As-of date</Label>
            <Input id="entry-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              props.onSave({
                id: props.initial?.id ?? crypto.randomUUID(),
                name: name.trim(),
                balanceSgd: round2(balance),
                asOf,
              });
              props.onOpenChange(false);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 3: Assets page**

`src/routes/assets.tsx` — replace entire file:

```tsx
import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDraft, useSaveDraft } from "@/hooks/use-draft";
import type { Entry } from "@shared/schema";
import { EntryForm } from "@/features/assets/components/entry-form";
import { SectionCard } from "@/features/assets/components/section-card";
import {
  ASSET_SECTIONS, LIABILITY_SECTIONS,
  type AssetSectionKey, type LiabilitySectionKey,
} from "@/features/assets/sections";

export const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets",
  component: AssetsPage,
});

type Target =
  | { group: "assets"; key: AssetSectionKey; title: string; entry?: Entry }
  | { group: "liabilities"; key: LiabilitySectionKey; title: string; entry?: Entry };

function AssetsPage() {
  const { data: draft, isPending, isError, refetch } = useDraft();
  const save = useSaveDraft();
  const [form, setForm] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);

  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-14 w-64" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (isError || !draft) return <ErrorState message="Couldn't load your balances." onRetry={() => refetch()} />;

  function entriesOf(t: Target): Entry[] {
    return t.group === "assets" ? draft!.assets[t.key] : draft!.liabilities[t.key];
  }

  function saveList(t: Target, next: Entry[]) {
    save.mutate(
      t.group === "assets"
        ? { ...draft!, assets: { ...draft!.assets, [t.key]: next } }
        : { ...draft!, liabilities: { ...draft!.liabilities, [t.key]: next } },
    );
  }

  function upsertEntry(entry: Entry) {
    if (!form) return;
    const list = entriesOf(form);
    const exists = list.some((e) => e.id === entry.id);
    saveList(form, exists ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]);
  }

  return (
    <>
      <PageHeader eyebrow="ASSETS" title="What you own" />
      <div className="grid gap-4">
        {ASSET_SECTIONS.map((s) => (
          <SectionCard
            key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="asset"
            entries={draft.assets[s.key]}
            onAdd={() => setForm({ group: "assets", key: s.key, title: s.title })}
            onEdit={(e) => setForm({ group: "assets", key: s.key, title: s.title, entry: e })}
            onDelete={(e) => setDeleting({ group: "assets", key: s.key, title: s.title, entry: e })}
          />
        ))}
      </div>

      <Separator className="my-10" />

      <PageHeader eyebrow="LIABILITIES" title="What you owe" />
      <div className="grid gap-4">
        {LIABILITY_SECTIONS.map((s) => (
          <SectionCard
            key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="liability"
            entries={draft.liabilities[s.key]}
            onAdd={() => setForm({ group: "liabilities", key: s.key, title: s.title })}
            onEdit={(e) => setForm({ group: "liabilities", key: s.key, title: s.title, entry: e })}
            onDelete={(e) => setDeleting({ group: "liabilities", key: s.key, title: s.title, entry: e })}
          />
        ))}
      </div>

      <EntryForm
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        initial={form?.entry}
        sectionTitle={form?.title ?? ""}
        onSave={upsertEntry}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.entry?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the current draft only — closed months are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting?.entry) {
                  saveList(deleting, entriesOf(deleting).filter((e) => e.id !== deleting.entry!.id));
                }
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → clean. In the dev app: add 2 bank accounts, a CPF balance, a property, a credit card, a loan; totals and `n/limit` counters update; the Add button disables after the 1st property (and would at 5 savings / 4 CPF / 5 cards); liabilities show red negative amounts; edit and delete work with animations; drawer form on mobile width.

```bash
git add src && git commit -m "feat: assets & liabilities screen with section limits"
```

---

### Task 11: Dashboard screen

**Files:**
- Create: `src/features/dashboard/hooks/use-dashboard-data.ts`, `src/features/dashboard/components/net-worth-hero.tsx`, `src/features/dashboard/components/net-worth-chart.tsx`, `src/features/dashboard/components/summary-cards.tsx`, `src/features/dashboard/components/draft-card.tsx`
- Modify (replace contents): `src/routes/index.tsx`

**Interfaces:**
- Consumes: `useDraft`, `useSnapshots`, `computeTotals`, formatters, `motion`, Recharts.
- Produces: read-only dashboard; no exports consumed elsewhere.

- [ ] **Step 1: Data assembly hook**

`src/features/dashboard/hooks/use-dashboard-data.ts`:

```ts
import { useDraft } from "@/hooks/use-draft";
import { useSnapshots } from "@/hooks/use-snapshots";
import { monthLabel } from "@/lib/format";
import type { Totals } from "@shared/schema";
import { computeTotals } from "@shared/totals";

export type ChartPoint = {
  label: string;
  portfolio: number; savings: number; cpf: number; property: number;
  creditCards: number; loans: number;      // stored negative for the chart
  netWorth: number;
};

const toPoint = (label: string, t: Totals): ChartPoint => ({
  label,
  portfolio: t.portfolioSgd, savings: t.savingsSgd, cpf: t.cpfSgd, property: t.propertySgd,
  creditCards: -t.creditCardsSgd, loans: -t.loansSgd,
  netWorth: t.netWorthSgd,
});

export function useDashboardData() {
  const draft = useDraft();
  const snapshots = useSnapshots();

  const latest = snapshots.data?.[0];
  const fxRate = draft.data?.fxRate ?? latest?.fxRate;
  const fxMissing = fxRate == null && (draft.data?.holdings.length ?? 0) > 0;
  const totals = draft.data ? computeTotals(draft.data, fxRate ?? 1) : undefined;

  const points: ChartPoint[] = [...(snapshots.data ?? [])]
    .reverse()
    .map((s) => toPoint(monthLabel(s.month), s.totals));
  if (totals) points.push(toPoint("Now", totals));

  const delta = totals && latest
    ? {
        amount: totals.netWorthSgd - latest.totals.netWorthSgd,
        fraction: latest.totals.netWorthSgd !== 0
          ? (totals.netWorthSgd - latest.totals.netWorthSgd) / Math.abs(latest.totals.netWorthSgd)
          : null,
        vs: monthLabel(latest.month),
      }
    : null;

  return {
    isPending: draft.isPending || snapshots.isPending,
    isError: draft.isError || snapshots.isError,
    refetch: () => { void draft.refetch(); void snapshots.refetch(); },
    draft: draft.data,
    totals, fxRate, fxMissing, points, delta,
  };
}
```

- [ ] **Step 2: Hero with count-up**

`src/features/dashboard/components/net-worth-hero.tsx`:

```tsx
import { animate, motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pct, sgd } from "@/lib/format";

function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const prev = useRef(0);
  useEffect(() => {
    if (reduced) { setDisplay(value); return; }
    const controls = animate(prev.current, value, { duration: 0.9, ease: "easeOut", onUpdate: setDisplay });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <>{sgd(display)}</>;
}

export function NetWorthHero(props: {
  value: number;
  delta: { amount: number; fraction: number | null; vs: string } | null;
}) {
  const up = (props.delta?.amount ?? 0) >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Total Net Worth</div>
      <div className="glow mt-2 font-display text-6xl tracking-tight md:text-7xl">
        <CountUp value={props.value} />
      </div>
      {props.delta && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {up
            ? <ArrowUpRight className="size-4 text-emerald-400" />
            : <ArrowDownRight className="size-4 text-destructive" />}
          {props.delta.fraction != null && (
            <span className={up ? "text-emerald-400" : "text-destructive"}>
              {up ? "+" : ""}{pct(props.delta.fraction)}
            </span>
          )}
          <span className="text-muted-foreground">{sgd(Math.abs(props.delta.amount))} vs {props.delta.vs}</span>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Stacked area chart**

`src/features/dashboard/components/net-worth-chart.tsx`:

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactSgd, sgd } from "@/lib/format";
import type { ChartPoint } from "../hooks/use-dashboard-data";

const SERIES = [
  { key: "portfolio", label: "Portfolio", color: "#e8c468", stack: "pos" },
  { key: "savings", label: "Savings", color: "#6fcf97", stack: "pos" },
  { key: "cpf", label: "CPF", color: "#f2efe3", stack: "pos" },
  { key: "property", label: "Property", color: "#4fbdba", stack: "pos" },
  { key: "creditCards", label: "Credit Cards", color: "#e37878", stack: "neg" },
  { key: "loans", label: "Loans", color: "#d9648c", stack: "neg" },
] as const;

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

export function NetWorthChart({ points }: { points: ChartPoint[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium">Net worth over time</h2>
        <span className="text-xs text-muted-foreground">{points.length} points</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#223028" strokeDasharray="4 6" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#9aa89e", fontSize: 12 }} />
            <YAxis tickFormatter={compactSgd} tickLine={false} axisLine={false} width={72} tick={{ fill: "#9aa89e", fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            {SERIES.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} stackId={s.stack} name={s.label}
                stroke={s.color} strokeWidth={1.5} fill={`url(#fill-${s.key})`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
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

- [ ] **Step 4: Summary cards + draft card**

`src/features/dashboard/components/summary-cards.tsx`:

```tsx
import { motion } from "motion/react";
import { Banknote, Building2, CreditCard, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import type { Totals } from "@shared/schema";
import { sgd } from "@/lib/format";

const CARDS = [
  { key: "portfolioSgd", label: "Portfolio", icon: TrendingUp, liability: false },
  { key: "savingsSgd", label: "Savings", icon: PiggyBank, liability: false },
  { key: "cpfSgd", label: "CPF", icon: Landmark, liability: false },
  { key: "propertySgd", label: "Property", icon: Building2, liability: false },
  { key: "creditCardsSgd", label: "Credit Cards", icon: CreditCard, liability: true },
  { key: "loansSgd", label: "Loans", icon: Banknote, liability: true },
] as const;

export function SummaryCards({ totals, fxRate }: { totals: Totals; fxRate?: number }) {
  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
    >
      {CARDS.map((c) => {
        const value = c.liability ? -totals[c.key] : totals[c.key];
        const Icon = c.icon;
        return (
          <motion.div
            key={c.key}
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
            className="rounded-2xl border border-border/60 bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{c.label}</span>
              <Icon className={c.liability ? "size-4 text-destructive" : "size-4 text-emerald-300"} />
            </div>
            <div className={value < 0 ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>
              {sgd(value)}
            </div>
            {c.key === "portfolioSgd" && fxRate != null && (
              <div className="mt-1 text-xs text-muted-foreground">
                USD {totals.portfolioUsd.toLocaleString("en-US")} @ {fxRate.toFixed(4)}
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
```

`src/features/dashboard/components/draft-card.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { Draft } from "@shared/schema";

export function DraftCard({ draft }: { draft: Draft }) {
  const assetCount = draft.assets.bankSavings.length + draft.assets.cpf.length + draft.assets.property.length;
  const liabilityCount = draft.liabilities.creditCards.length + draft.liabilities.loans.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5">
      <div>
        <h2 className="font-medium">Current draft snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {draft.holdings.length} holdings · {assetCount} assets · {liabilityCount} liabilities — keep editing,
          then close the month from Settings to lock it into your timeline.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild><Link to="/portfolio">Update Portfolio</Link></Button>
        <Button asChild variant="outline"><Link to="/assets">Update Balances</Link></Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Dashboard page**

`src/routes/index.tsx` — replace entire file:

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DraftCard } from "@/features/dashboard/components/draft-card";
import { NetWorthChart } from "@/features/dashboard/components/net-worth-chart";
import { NetWorthHero } from "@/features/dashboard/components/net-worth-hero";
import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { useDashboardData } from "@/features/dashboard/hooks/use-dashboard-data";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

function DashboardPage() {
  const d = useDashboardData();

  if (d.isPending) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-24 w-80" />
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }
  if (d.isError || !d.draft || !d.totals) {
    return <ErrorState message="Couldn't load your dashboard." onRetry={d.refetch} />;
  }

  return (
    <div className="grid gap-8">
      <div>
        <NetWorthHero value={d.totals.netWorthSgd} delta={d.delta} />
        {d.fxMissing && (
          <p className="mt-2 text-xs text-muted-foreground">
            No USD/SGD rate yet — portfolio shown at 1.0000. Fetch a price on Portfolio to update it.
          </p>
        )}
      </div>
      {d.points.length > 0 && <NetWorthChart points={d.points} />}
      <SummaryCards totals={d.totals} fxRate={d.fxRate} />
      <DraftCard draft={d.draft} />
    </div>
  );
}
```

- [ ] **Step 6: Verify + commit**

Run: `npm run build` → clean. In the dev app: hero counts up with a glow; summary cards stagger in; the Portfolio card shows `USD … @ rate`; liabilities cards are negative red; chart shows positive bands stacked above zero and credit-card/loan bands below, with the draft as the last "Now" point; tooltip shows per-component values + net worth; both dashboard buttons navigate.

```bash
git add src && git commit -m "feat: dashboard with hero count-up, stacked area chart, summary cards"
```

---

### Task 12: History screen with amend flow

**Files:**
- Create: `src/features/history/components/snapshot-row.tsx`, `src/features/history/components/snapshot-detail.tsx`, `src/features/history/components/amend-dialog.tsx`
- Modify (replace contents): `src/routes/history.tsx`

**Interfaces:**
- Consumes: `useSnapshots`/`useSnapshot`/`useAmendSnapshot`, `HoldingsTable` + `HoldingForm` (Task 9), `SectionCard` + `EntryForm` + section configs (Task 10), `ResponsiveModal`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Accordion row**

`src/features/history/components/snapshot-row.tsx`:

```tsx
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { SnapshotSummary } from "@/hooks/use-snapshots";
import { dateLabel, sgd } from "@/lib/format";
import { SnapshotDetail } from "./snapshot-detail";

export function SnapshotRow(props: { summary: SnapshotSummary; expanded: boolean; onToggle: () => void }) {
  const s = props.summary;
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <button onClick={props.onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={props.expanded}>
        <div>
          <div className="font-medium">{dateLabel(s.snapshotDate)}</div>
          <div className="text-xs text-muted-foreground">FX USD/SGD: {s.fxRate.toFixed(4)}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net worth</div>
            <div className="text-lg font-semibold">{sgd(s.totals.netWorthSgd)}</div>
          </div>
          <motion.span animate={{ rotate: props.expanded ? 180 : 0 }}>
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {props.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
          >
            <div className="border-t border-border/40 p-5">
              <SnapshotDetail month={s.month} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 2: Detail breakdown**

`src/features/history/components/snapshot-detail.tsx`:

```tsx
import { useState } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/error-state";
import { useSnapshot } from "@/hooks/use-snapshots";
import { monthLabel, sgd } from "@/lib/format";
import { HoldingsTable } from "@/features/portfolio/components/holdings-table";
import { SectionCard } from "@/features/assets/components/section-card";
import { ASSET_SECTIONS, LIABILITY_SECTIONS } from "@/features/assets/sections";
import { AmendDialog } from "./amend-dialog";

export function SnapshotDetail({ month }: { month: string }) {
  const { data: snap, isPending, isError, refetch } = useSnapshot(month);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);

  if (isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (isError || !snap) return <ErrorState message="Couldn't load this snapshot." onRetry={() => refetch()} />;

  return (
    <div className="grid gap-4">
      {snap.holdings.length > 0 && <HoldingsTable holdings={snap.holdings} />}

      <div className="grid gap-4 md:grid-cols-2">
        {ASSET_SECTIONS.map((s) => snap.assets[s.key].length > 0 && (
          <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit}
            tone="asset" entries={snap.assets[s.key]} />
        ))}
        {LIABILITY_SECTIONS.map((s) => snap.liabilities[s.key].length > 0 && (
          <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit}
            tone="liability" entries={snap.liabilities[s.key]} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Net worth </span>
          <span className="font-semibold">{sgd(snap.totals.netWorthSgd)}</span>
          <span className="text-muted-foreground"> · at USD/SGD {snap.fxRate.toFixed(4)}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <PencilLine className="size-4" /> Amend snapshot
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Amend {monthLabel(month)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Closed months are read-only by default. Amending rewrites this month's history —
              its totals will be recalculated from whatever you change. Use this to fix human errors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setAmendOpen(true)}>Amend</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AmendDialog snapshot={snap} open={amendOpen} onOpenChange={setAmendOpen} />
    </div>
  );
}
```

- [ ] **Step 3: Amend dialog (full editor on a local copy)**

`src/features/history/components/amend-dialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/responsive-modal";
import { useAmendSnapshot } from "@/hooks/use-snapshots";
import { monthLabel } from "@/lib/format";
import type { AmendInput, Entry, Holding, Snapshot } from "@shared/schema";
import { HoldingForm } from "@/features/portfolio/components/holding-form";
import { HoldingsTable } from "@/features/portfolio/components/holdings-table";
import { EntryForm } from "@/features/assets/components/entry-form";
import { SectionCard } from "@/features/assets/components/section-card";
import {
  ASSET_SECTIONS, LIABILITY_SECTIONS,
  type AssetSectionKey, type LiabilitySectionKey,
} from "@/features/assets/sections";

type Target =
  | { group: "assets"; key: AssetSectionKey; title: string; entry?: Entry }
  | { group: "liabilities"; key: LiabilitySectionKey; title: string; entry?: Entry };

const toInput = (s: Snapshot): AmendInput => ({
  snapshotDate: s.snapshotDate, fxRate: s.fxRate,
  holdings: s.holdings, assets: s.assets, liabilities: s.liabilities,
});

export function AmendDialog(props: { snapshot: Snapshot; open: boolean; onOpenChange: (o: boolean) => void }) {
  const amend = useAmendSnapshot(props.snapshot.month);
  const [doc, setDoc] = useState<AmendInput>(() => toInput(props.snapshot));
  const [fxStr, setFxStr] = useState(String(props.snapshot.fxRate));
  const [holdingForm, setHoldingForm] = useState<{ open: boolean; editing?: Holding }>({ open: false });
  const [entryForm, setEntryForm] = useState<Target | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setDoc(toInput(props.snapshot));
    setFxStr(String(props.snapshot.fxRate));
    amend.reset();
  }, [props.open, props.snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const fxRate = Number(fxStr);
  const canSave = doc.snapshotDate !== "" && Number.isFinite(fxRate) && fxRate > 0 && !amend.isPending;

  function upsertHolding(h: Holding) {
    setDoc((d) => ({
      ...d,
      holdings: d.holdings.some((x) => x.id === h.id)
        ? d.holdings.map((x) => (x.id === h.id ? h : x))
        : [...d.holdings, h],
    }));
  }

  function setList(t: Target, next: Entry[]) {
    setDoc((d) =>
      t.group === "assets"
        ? { ...d, assets: { ...d.assets, [t.key]: next } }
        : { ...d, liabilities: { ...d.liabilities, [t.key]: next } });
  }
  const listOf = (t: Target) => (t.group === "assets" ? doc.assets[t.key] : doc.liabilities[t.key]);

  function upsertEntry(e: Entry) {
    if (!entryForm) return;
    const list = listOf(entryForm);
    setList(entryForm, list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e]);
  }

  return (
    <ResponsiveModal open={props.open} onOpenChange={props.onOpenChange} wide
      title={`Amend ${monthLabel(props.snapshot.month)}`}
      description="Totals are recalculated when you save. The original close date is preserved.">
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="amend-date">Snapshot date</Label>
            <Input id="amend-date" type="date" value={doc.snapshotDate}
              onChange={(e) => setDoc((d) => ({ ...d, snapshotDate: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="amend-fx">USD/SGD rate</Label>
            <Input id="amend-fx" type="number" inputMode="decimal" min="0" step="any"
              value={fxStr} onChange={(e) => setFxStr(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Holdings</h3>
            <Button variant="ghost" size="sm" onClick={() => setHoldingForm({ open: true })}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <HoldingsTable holdings={doc.holdings}
            onEdit={(h) => setHoldingForm({ open: true, editing: h })}
            onDelete={(h) => setDoc((d) => ({ ...d, holdings: d.holdings.filter((x) => x.id !== h.id) }))} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ASSET_SECTIONS.map((s) => (
            <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="asset"
              entries={doc.assets[s.key]}
              onAdd={() => setEntryForm({ group: "assets", key: s.key, title: s.title })}
              onEdit={(e) => setEntryForm({ group: "assets", key: s.key, title: s.title, entry: e })}
              onDelete={(e) => setList({ group: "assets", key: s.key, title: s.title },
                doc.assets[s.key].filter((x) => x.id !== e.id))} />
          ))}
          {LIABILITY_SECTIONS.map((s) => (
            <SectionCard key={s.key} title={s.title} icon={s.icon} limit={s.limit} tone="liability"
              entries={doc.liabilities[s.key]}
              onAdd={() => setEntryForm({ group: "liabilities", key: s.key, title: s.title })}
              onEdit={(e) => setEntryForm({ group: "liabilities", key: s.key, title: s.title, entry: e })}
              onDelete={(e) => setList({ group: "liabilities", key: s.key, title: s.title },
                doc.liabilities[s.key].filter((x) => x.id !== e.id))} />
          ))}
        </div>

        {amend.isError && <p className="text-sm text-destructive">{amend.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSave}
            onClick={() => amend.mutate({ ...doc, fxRate }, { onSuccess: () => props.onOpenChange(false) })}>
            {amend.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <HoldingForm open={holdingForm.open}
        onOpenChange={(o) => setHoldingForm((f) => ({ ...f, open: o }))}
        initial={holdingForm.editing}
        onSave={(h) => upsertHolding(h)} />
      <EntryForm open={!!entryForm} onOpenChange={(o) => !o && setEntryForm(null)}
        initial={entryForm?.entry} sectionTitle={entryForm?.title ?? ""} onSave={upsertEntry} />
    </ResponsiveModal>
  );
}
```

- [ ] **Step 4: History page**

`src/routes/history.tsx` — replace entire file:

```tsx
import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSnapshots } from "@/hooks/use-snapshots";
import { SnapshotRow } from "@/features/history/components/snapshot-row";

export const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

function HistoryPage() {
  const { data: snapshots, isPending, isError, refetch } = useSnapshots();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <PageHeader eyebrow="HISTORY" title="Monthly snapshots" />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Past snapshots are read-only and preserve the FX rate used at close. Use Amend to fix mistakes.
      </p>

      {isPending && <div className="grid gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>}
      {isError && <ErrorState message="Couldn't load your history." onRetry={() => refetch()} />}

      {snapshots && (snapshots.length === 0 ? (
        <EmptyState icon={Clock} title="No snapshots yet"
          hint="Close your first month from Settings to start your timeline." />
      ) : (
        <div className="grid gap-3">
          {snapshots.map((s) => (
            <SnapshotRow key={s.month} summary={s} expanded={expanded === s.month}
              onToggle={() => setExpanded(expanded === s.month ? null : s.month)} />
          ))}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 5: Verify + commit**

Run: `npm run build` → clean. In the dev app (after closing at least one month via `curl -X POST localhost:8787/api/close -H 'content-type: application/json' -d '{"snapshotDate":"2026-06-26","fxRate":1.328}'` if Settings isn't built yet): rows expand with a spring showing full breakdown incl. FX; amend flow: confirm dialog → editor → change a balance → Save → row totals update; draft is untouched by the amend.

```bash
git add src && git commit -m "feat: history screen with spring accordion and amend flow"
```

---

### Task 13: Settings screen (close month + danger zone)

**Files:**
- Create: `src/features/settings/components/close-month-card.tsx`, `src/features/settings/components/danger-zone.tsx`
- Modify (replace contents): `src/routes/settings.tsx`

**Interfaces:**
- Consumes: `useDraft`, `useCloseMonth`, `useResetAll`, `computeTotals`, `api`, shadcn primitives.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Close-month card**

`src/features/settings/components/close-month-card.tsx`:

```tsx
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { monthLabel, sgd } from "@/lib/format";
import { useDraft } from "@/hooks/use-draft";
import { useCloseMonth } from "@/hooks/use-snapshots";
import { computeTotals } from "@shared/totals";

export function CloseMonthCard() {
  const { data: draft } = useDraft();
  const close = useCloseMonth();
  const [snapshotDate, setSnapshotDate] = useState("");
  const [fxStr, setFxStr] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fxNum = Number(fxStr);
  const fxValid = fxStr !== "" && Number.isFinite(fxNum) && fxNum > 0;
  const previewFx = fxValid ? fxNum : draft?.fxRate;
  const totals = draft ? computeTotals(draft, previewFx ?? 1) : null;
  const counts = draft
    ? {
        holdings: draft.holdings.length,
        assets: draft.assets.bankSavings.length + draft.assets.cpf.length + draft.assets.property.length,
        liabilities: draft.liabilities.creditCards.length + draft.liabilities.loans.length,
      }
    : null;

  async function fetchFx() {
    setFxLoading(true);
    setNote(null);
    try {
      const fx = await api<{ rate: number }>("/api/fx");
      setFxStr(String(fx.rate));
    } catch (err) {
      setNote({ kind: "err", text: err instanceof ApiError ? err.message : "Couldn't fetch the FX rate" });
    } finally {
      setFxLoading(false);
    }
  }

  function doClose() {
    setNote(null);
    close.mutate(
      { snapshotDate, fxRate: fxValid ? fxNum : undefined },
      {
        onSuccess: (snap) => {
          setNote({ kind: "ok", text: `${monthLabel(snap.month)} locked at USD/SGD ${snap.fxRate.toFixed(4)} — view it in History.` });
          setSnapshotDate("");
          setFxStr("");
        },
        onError: (err) => setNote({ kind: "err", text: err.message }),
      },
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">Close month</h2>
          <p className="text-sm text-muted-foreground">
            Locks the current draft into a read-only snapshot. The draft carries forward into a new month.
          </p>
        </div>
      </div>

      {totals && counts && (
        <div className="mb-4 rounded-xl bg-muted/40 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Current draft</div>
          <div className="font-display text-3xl">{sgd(totals.netWorthSgd)}</div>
          <div className="text-xs text-muted-foreground">
            {counts.holdings} holdings · {counts.assets} assets · {counts.liabilities} liabilities
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="close-date">Snapshot date</Label>
          <Input id="close-date" type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="close-fx">USD/SGD rate</Label>
          <div className="flex gap-2">
            <Input id="close-fx" type="number" inputMode="decimal" min="0" step="any"
              placeholder="auto-fetch on close" value={fxStr} onChange={(e) => setFxStr(e.target.value)} />
            <Button variant="outline" onClick={fetchFx} disabled={fxLoading}>
              {fxLoading ? "Fetching…" : "Fetch"}
            </Button>
          </div>
        </div>
      </div>

      {note && (
        <p className={note.kind === "ok" ? "mt-3 text-sm text-emerald-400" : "mt-3 text-sm text-destructive"}>
          {note.text}
        </p>
      )}

      <Button className="mt-4" disabled={snapshotDate === "" || close.isPending} onClick={() => setConfirmOpen(true)}>
        <Lock className="size-4" /> {close.isPending ? "Closing…" : "Close month and snapshot"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close {snapshotDate ? monthLabel(snapshotDate.slice(0, 7)) : "this month"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The snapshot becomes read-only (amendable later from History).
              {!fxValid && " The USD/SGD rate will be fetched automatically."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doClose}>Close month</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
```

- [ ] **Step 2: Danger zone**

`src/features/settings/components/danger-zone.tsx`:

```tsx
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResetAll } from "@/hooks/use-snapshots";

export function DangerZone() {
  const reset = useResetAll();
  const [confirmText, setConfirmText] = useState("");
  const [done, setDone] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-destructive/40 bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <Trash2 className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">Danger zone</h2>
          <p className="text-sm text-muted-foreground">
            Permanently deletes every snapshot and the current draft.
          </p>
        </div>
      </div>
      <div className="grid max-w-sm gap-1.5">
        <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
        <Input id="reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      {reset.isError && <p className="mt-3 text-sm text-destructive">{reset.error.message}</p>}
      {done && <p className="mt-3 text-sm text-muted-foreground">{done}</p>}
      <Button
        variant="destructive" className="mt-4"
        disabled={confirmText !== "RESET" || reset.isPending}
        onClick={() =>
          reset.mutate(undefined, {
            onSuccess: (r) => { setDone(`Deleted ${r.deleted} items.`); setConfirmText(""); },
          })
        }
      >
        {reset.isPending ? "Resetting…" : "Reset all data"}
      </Button>
    </section>
  );
}
```

- [ ] **Step 3: Settings page**

`src/routes/settings.tsx` — replace entire file:

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/__root";
import { PageHeader } from "@/components/page-header";
import { CloseMonthCard } from "@/features/settings/components/close-month-card";
import { DangerZone } from "@/features/settings/components/danger-zone";

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="SETTINGS" title="Configuration" />
      <div className="grid gap-6">
        <CloseMonthCard />
        <DangerZone />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Full-loop verification + commit**

Run: `npm run build` → clean. Full monthly loop in the dev app: add holdings + balances → Settings shows the draft summary → pick a snapshot date → Fetch shows a real FX rate (or leave empty) → Close → success note; History now lists the month; closing the same month again → inline "already closed" error; Dashboard chart gains the point; danger zone requires typing RESET and empties everything.

```bash
git add src && git commit -m "feat: settings screen - close month and danger zone"
```

---

### Task 14: DynamoDB store, Lambda entry, esbuild bundle

**Files:**
- Create: `server/dynamo-store.ts`, `server/lambda.ts`, `scripts/build-lambda.mjs`

**Interfaces:**
- Consumes: `SnapshotStore` (Task 3), `createApp` (Task 5), `createMarketClient` (Task 4)
- Produces: `DynamoStore(tableName)` implementing `SnapshotStore`; Lambda handler `index.handler`; `npm run build:lambda` → `dist-server/lambda.zip` (consumed by Terraform Task 15). Env contract: `TABLE_NAME`, `TWELVE_DATA_API_KEY`, `ORIGIN_SECRET`.

No unit tests here: `DynamoStore` is a thin adapter over `DynamoDBDocumentClient` — the store *contract* is already covered by the shared suite in Task 3, and mocking the AWS SDK would only test the mock. It gets verified against real DynamoDB in Task 16's post-deploy smoke.

- [ ] **Step 1: DynamoDB store**

`server/dynamo-store.ts`:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Draft, Snapshot } from "../shared/schema.ts";
import type { SnapshotStore } from "./store.ts";

const PK = "USER";

export class DynamoStore implements SnapshotStore {
  private doc: DynamoDBDocumentClient;

  constructor(private table: string) {
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getDraft(): Promise<Draft | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: "DRAFT" } }));
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, ...draft } = res.Item;
    return draft as Draft;
  }

  async putDraft(draft: Draft): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: PK, sk: "DRAFT", ...draft } }));
  }

  async getSnapshot(month: string): Promise<Snapshot | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: month } }));
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, ...snap } = res.Item;
    return snap as Snapshot;
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const res = await this.doc.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": PK },
      ScanIndexForward: false, // sk "YYYY-MM" sorts chronologically → descending = newest first
    }));
    return (res.Items ?? [])
      .filter((item) => item.sk !== "DRAFT")
      .map(({ pk: _pk, sk: _sk, ...snap }) => snap as Snapshot);
  }

  async createSnapshot(snap: Snapshot): Promise<boolean> {
    try {
      await this.doc.send(new PutCommand({
        TableName: this.table,
        Item: { pk: PK, sk: snap.month, ...snap },
        ConditionExpression: "attribute_not_exists(sk)", // "can't close a month twice", enforced by the DB
      }));
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "ConditionalCheckFailedException") return false;
      throw err;
    }
  }

  async putSnapshot(snap: Snapshot): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: PK, sk: snap.month, ...snap } }));
  }

  async reset(): Promise<number> {
    const res = await this.doc.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": PK },
      ProjectionExpression: "pk, sk",
    }));
    const keys = (res.Items ?? []).map((item) => ({ pk: item.pk, sk: item.sk }));
    for (let i = 0; i < keys.length; i += 25) { // BatchWrite max 25 items
      await this.doc.send(new BatchWriteCommand({
        RequestItems: { [this.table]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) },
      }));
    }
    return keys.length;
  }
}
```

- [ ] **Step 2: Lambda entry + bundle script**

`server/lambda.ts`:

```ts
import { handle } from "hono/aws-lambda";
import { createApp } from "./app.ts";
import { DynamoStore } from "./dynamo-store.ts";
import { createMarketClient } from "./market.ts";

const app = createApp({
  store: new DynamoStore(process.env.TABLE_NAME ?? "tothemoon"),
  market: createMarketClient({ twelveDataKey: process.env.TWELVE_DATA_API_KEY ?? "" }),
  originSecret: process.env.ORIGIN_SECRET,
});

export const handler = handle(app);
```

`scripts/build-lambda.mjs`:

```js
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist-server", { recursive: true, force: true });
mkdirSync("dist-server", { recursive: true });

await build({
  entryPoints: ["server/lambda.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs", // avoids ESM dynamic-require shims when bundling the AWS SDK
  outfile: "dist-server/index.cjs",
  minify: true,
  logLevel: "info",
});

execSync("zip -qj dist-server/lambda.zip dist-server/index.cjs", { stdio: "inherit" });
console.log("dist-server/lambda.zip ready");
```

- [ ] **Step 3: Verify + commit**

Run: `npm run build` → clean (typechecks `dynamo-store.ts`/`lambda.ts` via `tsconfig.server.json`).
Run: `npm run build:lambda` → expected: esbuild output then "dist-server/lambda.zip ready"; `unzip -l dist-server/lambda.zip` lists `index.cjs`.

```bash
git add server scripts && git commit -m "feat: dynamodb store, lambda handler, esbuild packaging"
```

---

### Task 15: Terraform (`infra/`)

**Files:**
- Create: `infra/providers.tf`, `infra/variables.tf`, `infra/dynamodb.tf`, `infra/lambda.tf`, `infra/s3.tf`, `infra/cloudfront.tf`, `infra/outputs.tf`, `infra/basic-auth.js.tftpl`, `infra/terraform.tfvars.example`

**Interfaces:**
- Consumes: `dist-server/lambda.zip` (Task 14).
- Produces: outputs `cloudfront_domain`, `bucket_name`, `distribution_id`, `table_name` (consumed by `scripts/deploy.sh`, Task 16). Lambda env vars exactly as Task 14 expects.

- [ ] **Step 1: Providers + variables**

`infra/providers.tf`:

```hcl
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = "ap-southeast-1"
}
```

`infra/variables.tf`:

```hcl
variable "basic_auth_user" {
  type      = string
  sensitive = true
}

variable "basic_auth_password" {
  type      = string
  sensitive = true
}

variable "origin_secret" {
  description = "Shared secret CloudFront injects so the Lambda URL can't be hit directly"
  type        = string
  sensitive   = true
}

variable "twelve_data_api_key" {
  type      = string
  sensitive = true
}
```

`infra/terraform.tfvars.example` (the real `terraform.tfvars` is gitignored):

```hcl
basic_auth_user     = "raymond"
basic_auth_password = "change-me"
origin_secret       = "generate-a-long-random-string"
twelve_data_api_key = "your-twelve-data-key"
```

- [ ] **Step 2: DynamoDB + Lambda**

`infra/dynamodb.tf`:

```hcl
resource "aws_dynamodb_table" "main" {
  name           = "tothemoon"
  billing_mode   = "PROVISIONED" # stays inside the always-free 25 RCU/WCU ceiling
  read_capacity  = 5
  write_capacity = 5
  hash_key       = "pk"
  range_key      = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}
```

`infra/lambda.tf`:

```hcl
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "tothemoon-lambda"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "ddb" {
  statement {
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem",
      "dynamodb:Query", "dynamodb:BatchWriteItem",
    ]
    resources = [aws_dynamodb_table.main.arn]
  }
}

resource "aws_iam_role_policy" "ddb" {
  name   = "tothemoon-ddb"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.ddb.json
}

resource "aws_lambda_function" "api" {
  function_name    = "tothemoon-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = "${path.module}/../dist-server/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist-server/lambda.zip")
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME          = aws_dynamodb_table.main.name
      TWELVE_DATA_API_KEY = var.twelve_data_api_key
      ORIGIN_SECRET       = var.origin_secret
    }
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE" # protected by the origin-secret header check inside the app
}
```

- [ ] **Step 3: S3 + CloudFront**

`infra/s3.tf`:

```hcl
resource "random_id" "bucket" {
  byte_length = 4
}

resource "aws_s3_bucket" "site" {
  bucket = "tothemoon-site-${random_id.bucket.hex}"
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "site" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json

  depends_on = [aws_s3_bucket_public_access_block.site]
}
```

`infra/basic-auth.js.tftpl` — one CloudFront Function does both jobs: basic auth on every request, and SPA rewrite (non-API, extensionless paths → `index.html`):

```js
function handler(event) {
  var request = event.request;
  var expected = "Basic ${auth}";
  var header = request.headers.authorization && request.headers.authorization.value;
  if (header !== expected) {
    return {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: { "www-authenticate": { value: 'Basic realm="ToTheMoon"' } }
    };
  }
  var uri = request.uri;
  if (!uri.startsWith("/api/") && !uri.includes(".")) {
    request.uri = "/index.html";
  }
  return request;
}
```

`infra/cloudfront.tf`:

```hcl
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "tothemoon-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "gate" {
  name    = "tothemoon-gate"
  runtime = "cloudfront-js-2.0"
  publish = true
  code = templatefile("${path.module}/basic-auth.js.tftpl", {
    auth = base64encode("${var.basic_auth_user}:${var.basic_auth_password}")
  })
}

locals {
  s3_origin_id  = "s3-site"
  api_origin_id = "lambda-api"
  # Function URL → bare domain (strip protocol and trailing slash)
  lambda_origin_domain = replace(replace(aws_lambda_function_url.api.function_url, "https://", ""), "/", "")

  # AWS managed policy IDs
  cache_optimized       = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  cache_disabled        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  all_viewer_no_host    = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes Singapore

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.lambda_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "x-origin-secret"
      value = var.origin_secret
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.gate.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.all_viewer_no_host
    compress                 = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.gate.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
```

`infra/outputs.tf`:

```hcl
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}
```

- [ ] **Step 4: Validate + commit**

Run: `terraform -chdir=infra init` then `terraform -chdir=infra validate` → expected: "Success! The configuration is valid." (No AWS credentials needed for validate; `apply` happens in Task 16.)

```bash
git add infra && git commit -m "feat: terraform - dynamodb, lambda, s3, cloudfront with basic-auth gate"
```

---

### Task 16: Deploy script, README, deploy & smoke test

**Files:**
- Create: `scripts/deploy.sh`
- Modify: `README.md` (add Configuration/Deploy sections)

**Interfaces:**
- Consumes: Terraform outputs (Task 15), `npm run build` / `npm run build:lambda`.

- [ ] **Step 1: Deploy script**

`scripts/deploy.sh` (then `chmod +x scripts/deploy.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build          # typecheck + SPA → dist/
npm run build:lambda   # Lambda → dist-server/lambda.zip

terraform -chdir=infra apply -auto-approve

BUCKET=$(terraform -chdir=infra output -raw bucket_name)
DIST_ID=$(terraform -chdir=infra output -raw distribution_id)
DOMAIN=$(terraform -chdir=infra output -raw cloudfront_domain)

# hashed assets: cache forever; index.html: always revalidate
aws s3 sync dist "s3://$BUCKET" --delete \
  --cache-control "public,max-age=31536000,immutable" --exclude "index.html"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" >/dev/null

echo "Deployed: https://$DOMAIN"
```

- [ ] **Step 2: README**

Append to `README.md`:

```markdown
## Configuration

- `server/.env` (local dev): copy `server/.env.example`, add your Twelve Data API key.
- `infra/terraform.tfvars` (deploy): copy `infra/terraform.tfvars.example` — basic-auth
  credentials, a long random `origin_secret`, and the Twelve Data key. Both files are gitignored.

## Deploying

One-time: `terraform -chdir=infra init`, AWS credentials configured (`aws configure`), and
`infra/terraform.tfvars` filled in.

Then every deploy is:

```bash
./scripts/deploy.sh
```

It builds the SPA and Lambda, `terraform apply`s infra + code, syncs `dist/` to S3, and
invalidates `index.html`. The app is served at the CloudFront URL behind HTTP Basic auth.
```

- [ ] **Step 3: Deploy + smoke test (needs Raymond's AWS credentials + tfvars)**

Run: `./scripts/deploy.sh` → expected: ends with `Deployed: https://<id>.cloudfront.net`.

Smoke checklist against the CloudFront URL:
1. Opening it prompts for basic-auth credentials; wrong password → 401.
2. Dashboard loads; add a holding on Portfolio → real EOD price; add balances on Assets.
3. Close a month in Settings → appears in History (data now in DynamoDB — check `aws dynamodb scan --table-name tothemoon --max-items 3`).
4. `curl -i https://<lambda-function-url>/api/draft` (from `aws lambda get-function-url-config --function-name tothemoon-api`) → **403** — the origin gate blocks direct Lambda access.
5. `curl -i -u user:pass "https://<cloudfront>/api/draft"` → 200 JSON.

- [ ] **Step 4: Commit**

```bash
git add scripts README.md && git commit -m "feat: deploy script and deployment docs"
```

---

## Plan self-review notes (kept for the record)

- **Spec coverage:** every spec section maps to a task — schemas/limits (T2), store + immutable create (T3/T14), market proxies incl. batch + USD-only guard (T4), full API contract (T5), local dev (T6), theme/shell/naming (T7), data layer (T8), the five screens (T9–T13), packaging (T14), infra + auth layers (T15), deploy (T16). Acceptance criteria 1–10 in the spec are exercised by T9 (1, 7), T10 (2), T5 tests (3, 6, 10), T11 (4), T12 (5, 6), T7 (8), T15 (9).
- **Known judgment calls:** RHF skipped in forms (4 controlled fields + a quote state machine is clearer with `useState`; RHF stays a dependency for future use) — deviates from STACK.md's tool list, not from any requirement. HoldingsTable uses TanStack Table (type filter tabs, ticker search, sortable columns) per Raymond's filtering requirement; the toolbar renders only with `filterable` (Portfolio), so History reuse stays read-only and toolbar-free.
- **Type consistency check:** `SnapshotStore` method names, `createApp` deps, `MarketClient` shape, hook signatures, and component props were cross-checked across tasks (`HoldingsTable`/`HoldingForm`/`SectionCard`/`EntryForm` reused in T12 exactly as defined in T9/T10).





