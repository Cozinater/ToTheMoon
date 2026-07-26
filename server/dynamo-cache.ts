import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { DayCache } from "./quote-cache.ts";

const PK = "USER";
const sk = (key: string) => `CACHE#${key}`;

/**
 * Day-scoped quote/FX cache backed by the same single-table DynamoDB store as
 * snapshots (`sk = "CACHE#<key>"`). Durability matters here: the cold-start refresh
 * fills over ~a minute and the overnight prefetch writes ahead of the app, so the
 * cache must survive Lambda cold starts and be shared across invocations. Freshness
 * is lazy — a stored `day` that differs from today is treated as a miss, so no
 * DynamoDB TTL config (and no infra change) is required.
 */
export class DynamoDayCache implements DayCache {
  private doc: DynamoDBDocumentClient;
  private table: string;

  constructor(table: string) {
    this.table = table;
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async get<T>(keys: string[], day: string): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (let i = 0; i < keys.length; i += 100) { // BatchGet max 100 keys
      const chunk = keys.slice(i, i + 100);
      const res = await this.doc.send(new BatchGetCommand({
        RequestItems: { [this.table]: { Keys: chunk.map((k) => ({ pk: PK, sk: sk(k) })) } },
      }));
      for (const item of res.Responses?.[this.table] ?? []) {
        if (item.day === day) out.set(item.cacheKey as string, item.value as T);
      }
    }
    return out;
  }

  async put<T>(entries: { key: string; value: T }[], day: string): Promise<void> {
    for (let i = 0; i < entries.length; i += 25) { // BatchWrite max 25 items
      const chunk = entries.slice(i, i + 25);
      await this.doc.send(new BatchWriteCommand({
        RequestItems: {
          [this.table]: chunk.map(({ key, value }) => ({
            PutRequest: { Item: { pk: PK, sk: sk(key), cacheKey: key, day, value } },
          })),
        },
      }));
    }
  }
}
