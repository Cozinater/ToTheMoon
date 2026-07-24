import { describe, expect, it, vi } from "vitest";
import { emptyDraft, type AssetType, type Draft } from "../shared/schema.ts";
import { createApp } from "./app.ts";
import { MarketError, type MarketClient } from "./market.ts";
import { MemoryStore } from "./store.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json();

const stubMarket = (over: Partial<MarketClient> = {}): MarketClient => ({
  quote: vi.fn(async (symbol: string, type) => ({ symbol, type, priceUsd: 100, asOf: "2026-07-01" })),
  quoteBatch: vi.fn(async (reqs: Array<{ symbol: string; type: AssetType }>) => ({
    quotes: reqs.map((r) => ({ symbol: r.symbol, type: r.type, priceUsd: 100, asOf: "2026-07-01" })),
    failed: [],
  })),
  fx: vi.fn(async () => ({ pair: "USD/SGD" as const, rate: 1.3, asOf: "2026-07-01" })),
  search: vi.fn(async () => []),
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
    const saved = await json(res);
    expect(saved.updatedAt).toBeTruthy();
    expect((await json(await app.request("/api/draft"))).fxRate).toBe(1.31);
  });

  it("PUT rejects over-limit sections with VALIDATION", async () => {
    const bad = sampleDraft();
    bad.assets.property = [0, 1].map((i) => ({
      id: crypto.randomUUID(), name: `p${i}`, balanceSgd: 1, asOf: "2026-06-25" }));
    const res = await makeApp().request("/api/draft", jsonReq("PUT", bad));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("VALIDATION");
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
    const snap = await json(res);
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
    expect((await json(res)).fxRate).toBe(1.35);
    expect(fx).not.toHaveBeenCalled();
  });

  it("closing the same month twice → 409 MONTH_EXISTS", async () => {
    const { app } = await closed();
    const res = await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-28" }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("MONTH_EXISTS");
  });

  it("carries the draft forward with the locked fx", async () => {
    const { app } = await closed();
    const draft = await json(await app.request("/api/draft"));
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
    const list = (await json(await app.request("/api/snapshots"))).snapshots;
    expect(list.map((s: { month: string }) => s.month)).toEqual(["2026-06", "2026-05"]);
    expect(list[0].totals.netWorthSgd).toBe(8300);
    expect(list[0].holdings).toBeUndefined(); // summaries only
    const detail = await json(await app.request("/api/snapshots/2026-05"));
    expect(detail.holdings).toHaveLength(1);
    expect((await app.request("/api/snapshots/2031-01")).status).toBe(404);
  });

  it("amend recomputes totals and preserves closedAt", async () => {
    const app = makeApp();
    await app.request("/api/draft", jsonReq("PUT", sampleDraft()));
    const snap = await json(await app.request("/api/close", jsonReq("POST", { snapshotDate: "2026-06-26" })));
    const amended = await json(await app.request("/api/snapshots/2026-06", jsonReq("PUT", {
      snapshotDate: "2026-06-26", fxRate: 1.4,
      holdings: snap.holdings, assets: snap.assets, liabilities: snap.liabilities,
    })));
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
    const q = await json(await app.request("/api/quote?symbol=AAPL&type=stock"));
    expect(q.priceUsd).toBe(100);
    const batch = await json(await app.request("/api/quote?symbols=VOO:etf,BTC:crypto"));
    expect(batch.quotes).toHaveLength(2);
    expect(batch.failed).toEqual([]);
  });

  it("maps MarketError to status codes", async () => {
    const app = makeApp({ quote: vi.fn(async () => { throw new MarketError("TICKER_NOT_FOUND", "no"); }) });
    const res = await app.request("/api/quote?symbol=XXXX&type=stock");
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("TICKER_NOT_FOUND");
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
    expect((await json(await app.request("/api/reset", { method: "POST" }))).deleted).toBe(2);
    expect((await json(await app.request("/api/snapshots"))).snapshots).toEqual([]);
  });
});

describe("origin secret", () => {
  it("403 without the header, 200 with it", async () => {
    const app = makeApp({}, "s3cret");
    expect((await app.request("/api/draft")).status).toBe(403);
    expect((await app.request("/api/draft", { headers: { "x-origin-secret": "s3cret" } })).status).toBe(200);
  });
});

function authApp() {
  return createApp({
    store: new MemoryStore(),
    market: stubMarket(),
    auth: { appPassword: "moon-pass", sessionToken: "tok-123" },
  });
}

describe("session auth", () => {
  it("login with the right password sets the exact session cookie", async () => {
    const res = await authApp().request("/api/login", jsonReq("POST", { password: "moon-pass" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("ttm_session=tok-123");
    for (const attr of ["Max-Age=2592000", "Path=/", "HttpOnly", "Secure", "SameSite=Strict"]) {
      expect(cookie).toContain(attr);
    }
  });

  it("wrong password → 401 BAD_PASSWORD after the failure delay, no cookie", async () => {
    const started = Date.now();
    const res = await authApp().request("/api/login", jsonReq("POST", { password: "nope" }));
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("BAD_PASSWORD");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("malformed login body → 400 VALIDATION", async () => {
    const res = await authApp().request("/api/login", jsonReq("POST", {}));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("VALIDATION");
  });

  it("data routes require the cookie: 401 UNAUTHORIZED without, 200 with", async () => {
    const app = authApp();
    const blocked = await app.request("/api/draft");
    expect(blocked.status).toBe(401);
    expect((await json(blocked)).error).toBe("UNAUTHORIZED");
    const allowed = await app.request("/api/draft", { headers: { cookie: "ttm_session=tok-123" } });
    expect(allowed.status).toBe(200);
    const wrong = await app.request("/api/draft", { headers: { cookie: "ttm_session=evil" } });
    expect(wrong.status).toBe(401);
  });

  it("logout is exempt and expires the cookie", async () => {
    const res = await authApp().request("/api/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("ttm_session=");
    expect(cookie).toContain("Max-Age=0");
  });

  it("auth off (no deps.auth): login is a no-op ok, data routes open", async () => {
    const app = makeApp();
    const login = await app.request("/api/login", jsonReq("POST", { password: "anything" }));
    expect((await json(login)).ok).toBe(true);
    expect(login.headers.get("set-cookie")).toBeNull();
    expect((await app.request("/api/draft")).status).toBe(200);
  });
});

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
