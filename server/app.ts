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
