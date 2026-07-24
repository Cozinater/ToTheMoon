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

  it("persists settings across instances", async () => {
    const file = join(dir, "settings.json");
    const a = new FileStore(file);
    await a.putSettings({ strategies: ["Long Term", "China"] });
    const b = new FileStore(file);
    expect((await b.getSettings())?.strategies).toEqual(["Long Term", "China"]);
  });
});
