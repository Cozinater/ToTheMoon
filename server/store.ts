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
