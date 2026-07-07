import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { FileStore } from "./file-store.ts";
import { createMarketClient } from "./market.ts";

try { process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); } catch { /* no .env yet */ }

const twelveDataKey = process.env.TWELVE_DATA_API_KEY ?? "";
if (!twelveDataKey) {
  console.warn("[api] TWELVE_DATA_API_KEY not set (copy server/.env.example to server/.env) — quotes/fx will fail");
}

const app = createApp({
  store: new FileStore(fileURLToPath(new URL("../.data/store.json", import.meta.url))),
  market: createMarketClient({ twelveDataKey }),
});

serve({ fetch: app.fetch, port: 8787 }, (info) =>
  console.log(`[api] listening on http://localhost:${info.port}`));
