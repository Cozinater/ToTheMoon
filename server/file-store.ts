import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Draft, Settings, Snapshot } from "../shared/schema.ts";
import { MemoryStore } from "./store.ts";

export class FileStore extends MemoryStore {
  constructor(private filePath: string) {
    super();
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        draft: Draft | null; snapshots: Record<string, Snapshot>; settings?: Settings | null;
      };
      this.draft = raw.draft;
      this.snapshots = new Map(Object.entries(raw.snapshots));
      this.settings = raw.settings ?? null;
    }
  }
  protected override persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(
      { draft: this.draft, snapshots: Object.fromEntries(this.snapshots), settings: this.settings }, null, 2));
  }
}
