import { handle } from "hono/aws-lambda";
import { createApp } from "./app.ts";
import { DynamoStore } from "./dynamo-store.ts";
import { createMarketClient } from "./market.ts";

const app = createApp({
  store: new DynamoStore(process.env.TABLE_NAME ?? "tothemoon"),
  market: createMarketClient({ twelveDataKey: process.env.TWELVE_DATA_API_KEY ?? "" }),
  originSecret: process.env.ORIGIN_SECRET,
});

export const handler = handle(app);
