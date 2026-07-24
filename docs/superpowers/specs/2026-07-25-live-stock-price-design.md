# Normalise stock quotes to live price (like crypto)

**Date:** 2026-07-25
**Status:** Approved

## Problem

The "Add holding" modal defaults its As-of date to whatever the fetched price is
stamped with. Stocks fetch from Twelve Data `/eod`, which returns the last *settled*
end-of-day close — so on 25 Jul (a Saturday, before Friday's US session had closed) a
stock defaulted to **23 Jul** while a crypto in the same modal defaulted to **today**.
The two asset types behave inconsistently, and stocks show a stale close rather than
the current price.

Root cause: `server/twelve-data.ts::toQuote` returns `asOf: p.datetime` (the EOD bar
date), whereas `server/coingecko.ts::cgQuotes` returns the live price stamped
`asOf: today`. The client (`holding-form.tsx`) simply mirrors whatever `asOf` the quote
carries.

## Goal

Stocks fetch the **current** price and stamp `asOf = today`, matching crypto exactly.
Both providers derive "today" from one shared helper so the behaviour is genuinely
normalised.

## Decision: As-of when the market is closed

When the US market is shut (weekend / holiday / after-hours), a stock's "current" price
is really its last trade. **Chosen behaviour:** stamp `asOf = today` regardless — full
consistency with crypto — accepting that on a weekend the stamped date (Sat) is one day
ahead of when the price actually traded (Fri). This mirrors crypto, which stamps today
even though its price is a live 24/7 tick.

Note: "today" is UTC (`toISOString`), which is the *existing* crypto behaviour and is
left unchanged. In the early SGT morning both asset types therefore read the UTC date
(one behind local SGT) — consistent with each other, which is the point.

## Design

### `server/twelve-data.ts`
- Rename `tdEodBatch` → `tdQuoteBatch`; switch endpoint `/eod` → `/quote`. Still one
  batched HTTP call (comma-separated symbols; 1 credit/symbol). The `/quote` batch
  response is the same top-level-keyed shape (`{ "AAPL": {...}, ... }`) and single-symbol
  returns the object directly — so the existing `length === 1` branch is unchanged.
- `toQuote`: take the price from `close` instead of `close` under `/eod`; **keep** the
  USD-currency guard (`/quote` still returns `currency`, so GBP/SGD listings are still
  rejected); drop the now-unused `datetime`; stamp `asOf = todayIso()`.

Why `/quote` and not `/price`: only `/quote` carries the `currency` field the USD guard
needs. `/quote.close` lags the real-time tick by at most one interval (e.g. 97.07 vs
97.16) — negligible for a tracker, and it is a settled bar value rather than a jittery
tick.

### `server/market.ts`
- Add `export function todayIso()` returning UTC `YYYY-MM-DD` — the single date source.
- Update the one call site: `tdEodBatch` → `tdQuoteBatch`.

### `server/coingecko.ts`
- Replace the inline `new Date().toISOString().slice(0, 10)` with `todayIso()` so both
  providers stamp dates identically.

### `src/features/portfolio/components/holding-form.tsx` (+ any sibling copy)
- Modal description "…we'll fetch its **end-of-day** USD price" → "…its **latest** USD
  price"; the idle helper line and the line-65 comment likewise. Grep for other
  user-facing "end-of-day" / "EOD" strings and update in kind.

## Out of scope (deliberately unchanged)
- Price is still fetched once on instrument-select; manually changing the As-of date
  does not refetch (existing behaviour).
- Crypto's provider/flow is unchanged apart from sharing `todayIso()`.
- No change to how quotes are stored or displayed elsewhere.

## Tests (`server/market.test.ts`)
- Repoint stock and `quoteBatch` mocks `/eod?symbol=…` → `/quote?symbol=…`.
- Assert `asOf` via the `^\d{4}-\d{2}-\d{2}$` regex (as the crypto test already does),
  since it is now dynamic rather than the mock's fixed date.
- USD-guard rejection test unchanged (still feeds `currency: "SGD"`).

## Verification
- `npm test` green (86 → same count, updated assertions).
- `npm run typecheck` / lint clean.
- Manual: search a stock in the modal → price is current, As-of = today; crypto still
  behaves the same; a non-USD listing (e.g. a GBp London line) is still rejected.
