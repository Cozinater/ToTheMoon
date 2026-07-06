# ToTheMoon — Design

Personal net-worth and portfolio tracker for a single user. Replaces a monthly
spreadsheet ritual: log holdings and SGD balances into a live **draft**, then
**close the month** to lock an immutable snapshot and watch net worth in SGD
over time. No public auth screen — protection is HTTP Basic at the CDN edge.

Companion documents: `plans/ARCHITECTURE.md` (AWS topology, agreed as-is),
`plans/STACK.md` (stack rationale), `screenshots/` (visual reference mockups).

## Decisions log

| Decision | Choice |
|---|---|
| Architecture | Backend + DB: CloudFront → S3 (SPA) + single Lambda (Function URL) → DynamoDB, per `plans/ARCHITECTURE.md` |
| Snapshot model | Live draft + explicit "Close month" locking an immutable `YYYY-MM` snapshot; draft carries forward |
| Amendments | Closed months read-only by default; explicit "Amend snapshot" in History (confirmation-gated) may edit one — this amends the original spec's absolute immutability rule |
| Prices | Stocks/ETFs: Twelve Data `/eod`. Crypto: CoinGecko (symbol → ID via its search endpoint) |
| FX (USD/SGD) | Twelve Data (1 credit; free tier = 8 credits/min, 800/day — ample at monthly usage) |
| API key | Server-side only: Lambda env var from a sensitive Terraform variable. No Settings input (deviates from Settings mockup) |
| Section limits | Bank Savings ≤ 5, CPF ≤ 4, Property ≤ 1, Credit Cards ≤ 5, Loans unlimited (amends spec's 3/1 for savings/CPF) |
| Field naming | `asOf` = the date a value refers to (everywhere); `updatedAt` only on the draft document; `Totals` keys carry currency suffixes |
| IDs | UUID v4 via built-in `crypto.randomUUID()` (browser + Node 22) — no library |
| Naming consistency | Navbar label = route = feature folder for every screen (Dashboard, Portfolio, Assets, History, Settings); the scaffold's empty `src/assets/` static folder is deleted to free the name |
| Scope | Everything: SPA + Lambda + Terraform + deploy script |

## Data model

DynamoDB table `tothemoon`, single-user key scheme:

- **Draft**: `pk="USER"`, `sk="DRAFT"` — the one live document all editing mutates.
- **Closed snapshot**: `pk="USER"`, `sk="2026-06"` — written once by Close
  Month with `attribute_not_exists(sk)`; no general update route. Only the
  explicit amend route can rewrite it.

Shared shapes (Zod schemas in `shared/`, imported by SPA and Lambda):

```ts
Holding = { id: string /* uuid */, ticker: string, type: "stock"|"etf"|"crypto",
            quantity: number, priceUsd: number, valueUsd: number, asOf: string }
Entry   = { id: string /* uuid */, name: string, balanceSgd: number, asOf: string }
Assets      = { bankSavings: Entry[] /* ≤5 */, cpf: Entry[] /* ≤4 */, property: Entry[] /* ≤1 */ }
Liabilities = { creditCards: Entry[] /* ≤5 */, loans: Entry[] /* unlimited */ }
Totals  = { netWorthSgd, portfolioUsd, portfolioSgd, savingsSgd, cpfSgd,
            propertySgd, creditCardsSgd, loansSgd }  // all numbers
Draft    = { holdings: Holding[], assets: Assets, liabilities: Liabilities,
             fxRate?: number, updatedAt: string }
Snapshot = { month: "YYYY-MM", snapshotDate: string, fxRate: number,
             closedAt: string, holdings, assets, liabilities, totals: Totals }
```

Money math: `portfolioSgd = portfolioUsd × fxRate`;
`netWorthSgd = portfolioSgd + savingsSgd + cpfSgd + propertySgd − creditCardsSgd − loansSgd`.
Liability balances are stored positive and subtracted (displayed negative).
The totals function lives in `shared/` and is the only implementation — the
SPA uses it for live draft display, the Lambda at close/amend. The server
never trusts client-computed totals.

## API

One Hono app on the single Lambda. All errors: `{ error: CODE, message }`.
401 comes from CloudFront basic auth; 403 from the Lambda origin-secret check
(active only when `ORIGIN_SECRET` is set).

### `GET /api/draft`
Returns the `Draft` document (`200`). If none exists yet, returns an empty
draft (no 404 — the app always has a working draft).

### `PUT /api/draft`
Body: `Draft` minus `updatedAt`. Zod-validated (`400 VALIDATION` with issues on
failure). Replaces the whole document — one call per user action (save/edit/
delete), never per keystroke. Returns the stored draft.

### `POST /api/close`
Body: `{ snapshotDate: string, fxRate?: number }`. `snapshotDate` is always
user-confirmed — the app never auto-dates. If `fxRate` is omitted the server
fetches the EOD USD/SGD rate itself. Recomputes `Totals` from the draft,
writes `sk=YYYY-MM` (month derived from `snapshotDate`) with
`attribute_not_exists` → `409 MONTH_EXISTS` if already closed. Resets the
draft, carrying all holdings and balances forward. Returns the created
`Snapshot`.

### `GET /api/snapshots`
`{ snapshots: [{ month, snapshotDate, fxRate, totals }] }`, newest first.
Feeds the History list and the Dashboard chart.

### `GET /api/snapshots/:month`
Full `Snapshot` (`200`) or `404 NOT_FOUND`.

### `PUT /api/snapshots/:month`
The amend route. Body: `{ snapshotDate, fxRate, holdings, assets, liabilities }`.
Zod-validated; server recomputes `Totals`. `404` if the month was never
closed. UI gates this behind an explicit confirmation.

### `GET /api/quote?symbol=VOO&type=etf`
`{ symbol, type, priceUsd, asOf }`. Routing: `stock|etf` → Twelve Data `/eod`;
`crypto` → CoinGecko. Unknown ticker → `404 TICKER_NOT_FOUND` with a
human-readable message; upstream failure → `502 UPSTREAM`. Also accepts
`symbols=` (comma-separated) for the batch refresh, quoting all stock/ETF
tickers in one Twelve Data request (respecting 8 credits/min) and all cryptos
in one CoinGecko call.

### `GET /api/fx`
`{ pair: "USD/SGD", rate, asOf }` from Twelve Data.

### `POST /api/reset`
Danger zone. Deletes every item including the draft. `{ deleted: n }`.

## Frontend

### Shell & navigation

Five TanStack Router routes; navbar label = route = feature folder:

| Navbar | Route | Folder |
|---|---|---|
| Dashboard | `/` | `features/dashboard` |
| Portfolio | `/portfolio` | `features/portfolio` |
| Assets | `/assets` | `features/assets` |
| History | `/history` | `features/history` |
| Settings | `/settings` | `features/settings` |

Layout component: left sidebar ≥ `md`, fixed bottom tab bar below. Each
feature folder follows the README convention (`components/ api/ hooks/
types.ts`). Cross-cutting draft/snapshot query hooks live in `src/hooks/`,
plumbing in `src/lib/`, shell in `src/components/layout/`.

### Data layer

TanStack Query keys: `['draft']`, `['snapshots']`, `['snapshot', month]`.
Edits are mutations doing optimistic cache updates + full-document `PUT
/api/draft`, rolling back on failure. Draft totals computed client-side with
the shared function.

### Screens

**Dashboard** (read-only): hero net-worth figure in SGD (count-up, fade-rise,
soft glow) with delta vs the latest closed month; Recharts stacked area chart
— assets stacked above zero, credit cards/loans as negative bands below,
x-axis of closed snapshots plus the live draft as the final point; summary
card row (Portfolio card subtitled "USD 109,350 @ 1.3280"); draft-snapshot
card with Update Portfolio / Update Balances buttons linking to those screens.

**Portfolio**: holdings table — ticker, type, quantity, price (USD), value
(USD), % of total — sorted by value. Add Holding dialog (drawer on mobile):
ticker, type, quantity, `asOf` date (user must pick; never pre-filled).
Fetching calls `/api/quote` + `/api/fx` in parallel (the FX result updates the
draft's `fxRate`), shows an animated shimmer on the price field, then the
price inline;
`TICKER_NOT_FOUND` → inline error under the ticker field, save disabled,
inputs preserved. Save → optimistic slide-in; delete → confirm, then collapse.
**Refresh prices** re-quotes every holding (one batched Twelve Data call + one
CoinGecko call) then a single PUT — this is how carried-forward holdings get
current prices each month. Empty state prompts the first holding.

**Assets**: one scrollable page — "What you own" (Bank Savings ≤5, CPF ≤4,
Property ≤1), a divider, "What you owe" (Credit Cards ≤5, Loans unlimited).
Subsection cards show total, count vs limit ("2/5"), rows with edit/delete.
Add/Update drawer: name, SGD balance, `asOf` date. At a limit the Add button
disables with a "max reached" hint. Liabilities display negative, red-tinted.
Per-section empty states.

**History**: closed months newest first (date, FX rate, net worth). Row click
→ spring accordion with the full breakdown (holdings with prices/values, all
balances, totals, FX used). Read-only by default; **Amend snapshot** opens the
draft-style editing UI for that month after a confirmation dialog spelling out
that history will be rewritten, saving via `PUT /api/snapshots/:month`.

**Settings**: Close month card — draft summary (net worth, counts), snapshot
date picker, USD/SGD field with Fetch button (empty → auto-fetch at close),
confirm-gated Close button. Danger zone — Reset all data behind
type-to-confirm. No API-key card.

### Animation & polish

`motion` library (Framer Motion successor): page-load fade-and-rise staggers,
`AnimatePresence` row enter/exit, spring accordions, drawer/dialog easing;
Recharts draw-in for the chart. Respects `prefers-reduced-motion`. Dark,
premium aesthetic per mockups: deep green-black backgrounds, soft glows on key
figures, gradient cards, rounded corners, generous spacing; shadcn/ui
components; `Intl.NumberFormat` for SGD/USD currency formatting. Mobile-first,
no horizontal scrolling.

### Loading & error states

Skeleton cards on first screen load; inline animated loading on price/FX
fields; every failed call shows a clear inline error with Retry; form state
always survives failures.

## Server

`server/` — Hono app with routes above; `SnapshotStore` interface
(get/put/conditional-put/list/delete) with two implementations: DynamoDB
(`@aws-sdk/lib-dynamodb` DocumentClient) in Lambda, JSON file
(`.data/store.json`, gitignored) for local dev. Upstream clients for Twelve
Data and CoinGecko normalise responses and map failures to
`TICKER_NOT_FOUND`/`UPSTREAM`. Zod validation before every write. Entry
points: `lambda.ts` (Function URL handler) and `dev.ts`
(`@hono/node-server`, port 8787). Bundled with esbuild → single zip artifact.

## Repo layout & local dev

```
src/          SPA (existing scaffold + feature folders)
server/       Lambda app + local dev entry
shared/       Zod schemas + totals math (tsconfig path alias both sides)
infra/        Terraform
scripts/      deploy.sh
```

One root `package.json` (server deps bundled by esbuild — no workspaces).
`npm run dev` = Vite (5173) + local API (8787) with `/api/*` proxied, same
origin shape as production. Twelve Data key in gitignored `server/.env`
(`.env.example` committed). Auth is entirely absent locally.

## Infrastructure (Terraform, `infra/`)

Region `ap-southeast-1`, local state, flat root module per
`plans/ARCHITECTURE.md`:

- `dynamodb.tf` — `tothemoon` table, provisioned 5 RCU / 5 WCU
- `lambda.tf` — scoped IAM role (CRUD on the one table), `nodejs22.x` arm64
  function + Function URL, env `TWELVE_DATA_API_KEY` + `ORIGIN_SECRET`
- `s3.tf` — private bucket, OAC bucket policy
- `cloudfront.tf` — one distribution, two origins (S3 default; `/api/*` →
  Function URL with injected secret header), basic-auth CloudFront Function
  templated from vars on viewer-request; `index.html` no-cache, hashed assets
  long-cache
- `variables.tf` — `basic_auth_user`, `basic_auth_password`, `origin_secret`,
  `twelve_data_api_key` (all sensitive; gitignored `terraform.tfvars`)
- `outputs.tf` — CloudFront domain, table name

Deploy: `scripts/deploy.sh` — build SPA, esbuild Lambda zip, `terraform
apply` (`source_code_hash` picks up the zip), `aws s3 sync`, CloudFront
invalidation.

Cost: $0/month on the default `*.cloudfront.net` domain (free tiers cover
CloudFront, Lambda, DynamoDB, CloudFront Functions; S3 pennies).

## Testing (Vitest)

- `shared/` — totals math (FX conversion, liability subtraction) and schema
  rules (limits 5/4/1/5/∞, required dates)
- `server/` — routes against an in-memory store: close writes the month item
  and carries the draft forward; closing twice → 409; amend recomputes totals
  server-side; quote proxy maps upstream misses to `TICKER_NOT_FOUND`
  (mocked `fetch`)
- Frontend — manual verification against acceptance criteria (animation-heavy
  UI; no e2e harness for a personal app)

## Acceptance criteria (amended from the original spec)

1. Log monthly holdings for ≥1 stock, ETF, and crypto ticker with correct EOD
   USD prices fetched server-side.
2. Record balances for bank savings (≤5), CPF (≤4), property (≤1), credit
   cards (≤5), loans (unlimited).
3. Net worth correct in SGD; portfolio converted at the stored EOD USD/SGD
   rate.
4. Stacked-by-component historical chart across ≥2 closed snapshots.
5. History shows the exact breakdown of any closed month, including its FX
   rate.
6. Editing the draft never alters any closed month; a closed month changes
   only via the explicit, confirmation-gated Amend flow.
7. Invalid ticker → clear inline error; holding not saved; input preserved.
8. Fully usable on mobile without horizontal scrolling; responsive across
   mobile/tablet/desktop.
9. Twelve Data key exists only in server-side config (Lambda env /
   Terraform variable) — never in the frontend bundle or requests.
10. Closing an already-closed month is rejected (409) and surfaced clearly.

## Open items (needed from Raymond, not blocking the build)

- Twelve Data API key (free tier) for `server/.env` and later `terraform.tfvars`
- AWS credentials + chosen basic-auth username/password at deploy time
