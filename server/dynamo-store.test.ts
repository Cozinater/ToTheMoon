import { describe, expect, it } from "vitest";
import { emptyDraft, type Snapshot } from "../shared/schema.ts";
import { computeTotals } from "../shared/totals.ts";
import { DynamoStore } from "./dynamo-store.ts";

const snap = (month: string): Snapshot => ({
  month, snapshotDate: `${month}-26`, fxRate: 1.328,
  closedAt: `${month}-26T14:03:00Z`, ...emptyDraft(),
  totals: computeTotals(emptyDraft(), 1.328),
});

/** Everything that shares the single `pk = "USER"` partition in production. */
const PARTITION: { sk: string }[] = [
  { sk: "DRAFT", ...emptyDraft() },
  { sk: "SETTINGS", strategies: ["China"] },
  { sk: "CACHE#Q:stock:AAPL", cacheKey: "Q:stock:AAPL", day: "2026-07-28", value: { priceUsd: 255 } },
  { sk: "CACHE#FX:USD/SGD", cacheKey: "FX:USD/SGD", day: "2026-07-28", value: 1.328 },
  { sk: "2026-06", ...snap("2026-06") },
  { sk: "2026-05", ...snap("2026-05") },
].map((item) => ({ pk: "USER", ...item }));

type QueryInput = {
  KeyConditionExpression?: string;
  ExpressionAttributeValues?: Record<string, unknown>;
};

/** Would DynamoDB return this sort key for the given query? */
function keyConditionMatches(sk: string, input: QueryInput): boolean {
  const expr = input.KeyConditionExpression ?? "";
  const values = input.ExpressionAttributeValues ?? {};
  const between = /sk\s+BETWEEN\s+(:\w+)\s+AND\s+(:\w+)/.exec(expr);
  if (between) return sk >= String(values[between[1]]) && sk <= String(values[between[2]]);
  const begins = /begins_with\s*\(\s*sk\s*,\s*(:\w+)\s*\)/.exec(expr);
  if (begins) return sk.startsWith(String(values[begins[1]]));
  return true; // no sort-key condition → the whole partition comes back
}

/**
 * Stand-in for the document client. `honourKeyCondition: false` models the worst case
 * (a query with no sort-key condition) so the client-side guard is tested on its own.
 */
function fakeDoc(honourKeyCondition: boolean) {
  const sent: QueryInput[] = [];
  return {
    sent,
    send: async (cmd: { input: QueryInput }) => {
      sent.push(cmd.input);
      const items = PARTITION
        .filter((i) => !honourKeyCondition || keyConditionMatches(i.sk, cmd.input))
        .sort((a, b) => (a.sk < b.sk ? 1 : a.sk > b.sk ? -1 : 0)); // ScanIndexForward: false
      return { Items: items };
    },
  };
}

function storeWith(doc: ReturnType<typeof fakeDoc>) {
  const store = new DynamoStore("networth");
  (store as unknown as { doc: unknown }).doc = doc;
  return store;
}

describe("DynamoStore.listSnapshots", () => {
  it("returns only month snapshots, never DRAFT / SETTINGS / CACHE# items", async () => {
    const store = storeWith(fakeDoc(false));
    const months = (await store.listSnapshots()).map((s) => s.month);
    expect(months).toEqual(["2026-06", "2026-05"]);
  });

  it("every returned snapshot carries totals the dashboard can read", async () => {
    const store = storeWith(fakeDoc(false));
    for (const s of await store.listSnapshots()) {
      expect(s.totals?.portfolioSgd).toBeTypeOf("number");
    }
  });

  it("narrows the query to the month key range", async () => {
    // Not just an optimisation: the query is unpaginated, and CACHE# keys sort ahead of
    // the months in descending order, so unbounded reads could push snapshots off page 1.
    const doc = fakeDoc(true);
    await storeWith(doc).listSnapshots();
    const [input] = doc.sent;
    expect(keyConditionMatches("2026-06", input)).toBe(true);
    expect(keyConditionMatches("CACHE#Q:stock:AAPL", input)).toBe(false);
    expect(keyConditionMatches("SETTINGS", input)).toBe(false);
    expect(keyConditionMatches("DRAFT", input)).toBe(false);
  });
});
