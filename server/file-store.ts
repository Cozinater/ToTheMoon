import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Draft, Snapshot } from "../shared/schema.ts";
import { MemoryStore } from "./store.ts";

export class FileStore extends MemoryStore {
  constructor(private filePath: string) {
    super();
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        draft: Draft | null; snapshots: Record<string, Snapshot>;
      };
      this.draft = raw.draft;
      this.snapshots = new Map(Object.entries(raw.snapshots));
    }
  }
  protected override persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(
      { draft: this.draft, snapshots: Object.fromEntries(this.snapshots) }, null, 2));
  }
}
