# Instrument Search Picker — Design

**Date:** 2026-07-11
**Status:** Approved for planning

## Problem

Adding a holding today requires typing a ticker into a free-text field, separately
choosing its Type (Stock / ETF / Crypto), then clicking "Fetch price". This flow has
three defects:

1. Type is user-chosen state that can contradict reality — "MSFT + Crypto" is
   expressible and only fails after a wasted API call.
2. Ticker collisions (UNI, LINK, AMP exist as both crypto and listed equities) have no
   principled resolution.
3. "Fetch price" is a manual step for something the form already has enough
   information to do.

## Goal

Pick a real instrument from search results; symbol and type become facts, the price
fetches itself. Two inputs (instrument, quantity), then Save.

## Non-goals

- Multi-currency holdings. The pricing pipeline is USD-only
  (`server/twelve-data.ts` rejects non-USD quotes; the schema stores
  `priceUsd`/`valueUsd` with one USD/SGD rate per snapshot). Coverage is
  **USD-quoted listings on any exchange**. Full multi-currency support is a separate
  future project.
- Changing the batch "Refresh prices" flow on the portfolio page (it already has
  concrete types).

## UX

- The Ticker field becomes a **search combobox**. From 2+ characters, debounced
  ~300 ms, it queries `/api/search?q=` and shows up to ~8 rows:
  - `MSFT — Microsoft Corporation · Stock · NASDAQ`
  - `BTC — Bitcoin · Crypto`
  - Non-USD listings render disabled/greyed with a "USD listings only" note.
- **Selecting a row locks symbol + type** (type shows as a badge, the Type select is
  removed) **and immediately fetches the quote** via the existing
  `/api/quote?symbol=X&type=Y`. Price box and As-of date populate; Save enables once
  quantity is valid.
- The **"Fetch price" button is removed.** Footer is Cancel / Save holding.
  Refreshing stale prices remains the portfolio page's "Refresh prices".
- Editing a holding shows its instrument as the selected value; changing it means
  searching again (same component, no special path).
- Keyboard: arrow keys + Enter to select, Escape closes; input keeps focus
  (listbox/combobox ARIA pattern). Works inside the mobile drawer variant of
  `ResponsiveModal`.

### Fallback when search fails

If `/api/search` errors or returns no rows, the dropdown shows manual rows —
"Use 'XYZ' as **Stock** / **ETF** / **Crypto**" — which select that symbol+type
without search. An upstream outage never blocks adding a holding. Manual selection
triggers the same auto-fetch (which may then fail with the existing
`TICKER_NOT_FOUND` message).

## API

`GET /api/search?q=msft` →

```json
{ "results": [
  { "symbol": "MSFT", "name": "Microsoft Corporation", "type": "stock",
    "exchange": "NASDAQ", "currency": "USD" }
] }
```

- `type`: `"stock" | "etf" | "crypto"` (Twelve Data `instrument_type === "ETF"` →
  `etf`, other equity types → `stock`; CoinGecko results → `crypto`).
- Crypto rows: `exchange` omitted or `"—"`, `currency: "USD"`.
- Server merges Twelve Data `symbol_search` and CoinGecko `/search` (run in
  parallel), exact-symbol matches first, capped at 8.
- Non-USD listings are included with their `currency` so the client can grey them
  out (they explain *why* a listing can't be added).
- If one upstream fails, return the other's results (partial success); if both fail,
  502 with the existing error envelope.
- `/api/quote` is unchanged. No `auto` type, no server-side detection policy.

## Server changes

- `server/market.ts`: `MarketClient` gains
  `search(q: string): Promise<SearchResult[]>`; implementation merges the two
  sources.
- `server/twelve-data.ts`: add `tdSymbolSearch(key, q)` mapping
  `symbol/instrument_name/instrument_type/exchange/currency`.
- `server/coingecko.ts`: add `cgSearch(q)` reusing the existing `/search` call,
  mapping `symbol/name`.
- `server/app.ts`: new route `GET /api/search` with zod-validated `q` (trimmed,
  1–24 chars).

## Client changes

- `src/features/portfolio/components/holding-form.tsx`: replace ticker Input + Type
  Select with the combobox; remove the Fetch price button; on selection call the
  existing quote fetch (which also sets the as-of date). Manual-fallback rows on
  search failure.
- New `src/features/portfolio/components/instrument-combobox.tsx`: debounced async
  combobox (input + popover listbox). Small, self-contained; no new dependencies.
- `src/features/portfolio/types.ts`: add `SearchResult` /  `SearchResponse` types.

## Error handling

| Case | Behavior |
| --- | --- |
| Search upstream partially down | Show whichever source responded |
| Search fully down / no matches | Manual "Use 'X' as …" fallback rows |
| Quote fails after selection | Existing quote-box error message; Save stays disabled |
| Non-USD listing | Visible but disabled, "USD listings only" |

## Testing

- `server/app.test.ts` (fake market client): merge order, cap, USD passthrough,
  partial-failure, validation of `q`.
- `server/market.test.ts` (fetch mocks): parsing of both search payloads,
  ETF vs stock mapping, non-USD currency preserved.
- Browser verification (Playwright + mocked `/api/search` and `/api/quote` routes):
  type → pick → price and as-of populate → Save enabled; search-failure fallback
  path; keyboard navigation.

## Risks

- **Twelve Data `symbol_search` credit cost**: documented as a credit-free utility
  endpoint; verify during implementation. Debounce + 2-char minimum bounds usage
  either way.
- **CoinGecko `/search` rate limits** on rapid typing: same debounce applies; search
  failures degrade to the manual fallback, never a blocked flow.
