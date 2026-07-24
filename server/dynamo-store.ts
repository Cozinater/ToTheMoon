import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Draft, Settings, Snapshot } from "../shared/schema.ts";
import type { SnapshotStore } from "./store.ts";

const PK = "USER";

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
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": PK },
      ScanIndexForward: false, // sk "YYYY-MM" sorts chronologically → descending = newest first
    }));
    return (res.Items ?? [])
      .filter((item) => item.sk !== "DRAFT")
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
    return keys.length;
  }
}
