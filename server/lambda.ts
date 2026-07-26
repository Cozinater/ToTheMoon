import { handle } from "hono/aws-lambda";
import { createApp } from "./app.ts";
import { DynamoDayCache } from "./dynamo-cache.ts";
import { DynamoStore } from "./dynamo-store.ts";
import { createMarketClient } from "./market.ts";

const appPassword = process.env.APP_PASSWORD;
const sessionToken = process.env.SESSION_TOKEN;
const tableName = process.env.TABLE_NAME ?? "tothemoon";

const app = createApp({
  store: new DynamoStore(tableName),
  market: createMarketClient({
    twelveDataKey: process.env.TWELVE_DATA_API_KEY ?? "",
    cache: new DynamoDayCache(tableName),
  }),
  originSecret: process.env.ORIGIN_SECRET,
  auth: appPassword && sessionToken ? { appPassword, sessionToken } : undefined,
});

export const handler = handle(app);
