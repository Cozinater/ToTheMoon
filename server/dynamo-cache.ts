import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
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
    // Individual GetItem (not BatchGetItem) keeps the existing IAM policy sufficient —
    // no Terraform change needed. RCU cost is identical, and a portfolio is at most dozens
    // of symbols, so the extra round trips are negligible.
    const results = await Promise.all(keys.map((key) =>
      this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: sk(key) } }))
        .then((res) => ({ key, item: res.Item }))));
    for (const { key, item } of results) {
      if (item && item.day === day) out.set(key, item.value as T);
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
