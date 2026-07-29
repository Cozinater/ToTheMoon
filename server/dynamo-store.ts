import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { monthSchema } from "../shared/schema.ts";
import type { Draft, Settings, Snapshot } from "../shared/schema.ts";
import type { SnapshotStore } from "./store.ts";

const PK = "USER";

/**
 * The partition holds more than snapshots: `sk = "DRAFT"`, `sk = "SETTINGS"` and the
 * price cache's `sk = "CACHE#<key>"`. Snapshot keys are the "YYYY-MM" months, and every
 * one of them falls inside this range while the others (D/S/C > "9") sort outside it.
 */
const MONTH_SK_LO = "0000-00";
const MONTH_SK_HI = "9999-99";

const isMonthKey = (sk: unknown) => monthSchema.safeParse(sk).success;

export class DynamoStore implements SnapshotStore {
  private doc: DynamoDBDocumentClient;
  private table: string;

  constructor(table: string) {
    this.table = table;
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getDraft(): Promise<Draft | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: "DRAFT" } }));
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, ...draft } = res.Item;
    return draft as Draft;
  }

  async putDraft(draft: Draft): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: PK, sk: "DRAFT", ...draft } }));
  }

  async getSettings(): Promise<Settings | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: "SETTINGS" } }));
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, ...settings } = res.Item;
    return settings as Settings;
  }

  async putSettings(settings: Settings): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: PK, sk: "SETTINGS", ...settings } }));
  }

  async getSnapshot(month: string): Promise<Snapshot | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: PK, sk: month } }));
    if (!res.Item) return null;
    const { pk: _pk, sk: _sk, ...snap } = res.Item;
    return snap as Snapshot;
  }

  async listSnapshots(): Promise<Snapshot[]> {
    const res = await this.doc.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: "pk = :p AND sk BETWEEN :lo AND :hi",
      ExpressionAttributeValues: { ":p": PK, ":lo": MONTH_SK_LO, ":hi": MONTH_SK_HI },
      ScanIndexForward: false, // sk "YYYY-MM" sorts chronologically → descending = newest first
    }));
    return (res.Items ?? [])
      .filter((item) => isMonthKey(item.sk))
      .map(({ pk: _pk, sk: _sk, ...snap }) => snap as Snapshot);
  }

  async createSnapshot(snap: Snapshot): Promise<boolean> {
    try {
      await this.doc.send(new PutCommand({
        TableName: this.table,
        Item: { pk: PK, sk: snap.month, ...snap },
        ConditionExpression: "attribute_not_exists(sk)", // "can't close a month twice", enforced by the DB
      }));
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "ConditionalCheckFailedException") return false;
      throw err;
    }
  }

  async putSnapshot(snap: Snapshot): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: PK, sk: snap.month, ...snap } }));
  }

  async reset(): Promise<number> {
    const res = await this.doc.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": PK },
      ProjectionExpression: "pk, sk",
    }));
    const keys = (res.Items ?? []).map((item) => ({ pk: item.pk, sk: item.sk }));
    for (let i = 0; i < keys.length; i += 25) { // BatchWrite max 25 items
      await this.doc.send(new BatchWriteCommand({
        RequestItems: { [this.table]: keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) },
      }));
    }
    return keys.filter((k) => k.sk !== "SETTINGS").length;
  }
}
