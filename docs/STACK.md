# ToTheMoon — Tech Stack

Decisions and the reasoning behind them. The spine is **TypeScript end to end**,
with **shared Zod schemas** connecting the frontend and the Lambda so the data
shape can't drift between them.

## Frontend (SPA)

- **Vite + React + TypeScript** — a static SPA that builds to files served from
  S3 + CloudFront.
  - *Chosen over Next.js / Remix:* their value is server-side rendering, but the
    always-free setup has no request-time server, and the app sits behind basic
    auth so there's no SEO to gain. SSR would add cost and complexity for no
    benefit. Static-exporting Next would just be a heavier Vite.
- **Routing** — TanStack Router. Type-safe routes and, importantly, typed
  search params — the Overview category filter becomes type-safe URL state for
  free. Coheres with TanStack Query (same ecosystem). (React Router v7 is the
  fine, more familiar fallback if preferred.)
- **Server state / data fetching** — TanStack Query (caching, dedup, mutations
  with cache invalidation). Maps directly to load snapshots / save a month /
  refetch.
- **Forms + validation** — React Hook Form (handles the dynamic holdings rows)
  + Zod. The Zod schema is shared with the Lambda.
- **Styling / UI** — Tailwind + shadcn/ui (consistent with bcm-frontend).
- **Charts** — Recharts. Horizontal bar allocation (`layout="vertical"`, sorted
  descending) and stacked area net-worth trend.
  - *Chosen over Tremor:* more low-level control and fewer dependencies. Tremor
    (dashboard components on top of Recharts) was the faster route but less
    control; Recharts is the lower-level foundation.

## Backend (Lambda)

- **TypeScript on `nodejs22.x`, arm64.**
  - *Chosen over Go / Python / Rust:* same language as the frontend → shared
    types and Zod schemas, one toolchain, best AWS SDK support. The cold-start /
    cost edges of Go and Rust don't show up at single-user, once-a-month volume.
- **Routing** — Hono (tiny, serverless-native, middleware is a clean home for
  the origin-secret check) — or a plain method+path `switch` for zero deps.
- **Data** — AWS SDK v3 (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`
  DocumentClient), pinned and bundled, not the runtime copy.
- **Validation** — Zod, before any DynamoDB write (it's financial data).
- **Bundling** — esbuild → single zipped artifact for Terraform.

## Shared

- The `MonthlySnapshot` / `Holding` types and the Zod schemas live in one shared
  location that both the SPA and the Lambda import. A change to the data shape
  surfaces on both sides at once instead of drifting silently.
