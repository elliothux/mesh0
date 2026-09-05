import type { Db } from "@mesh0/db";
import { webhooks } from "@mesh0/db/schema";
import type { Webhook } from "@mesh0/db/types";
import { webhookRecordSchema } from "@mesh0/sdk/schema";
import type {
  CreateWebhookInput,
  ListWebhooksInput,
  WebhookRecord,
} from "@mesh0/sdk/types";
import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

export class WebhookNotFoundError extends Error {
  constructor() {
    super("Webhook not found");
    this.name = "WebhookNotFoundError";
  }
}

export class WebhookService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async create({
    definition,
    name,
    userId,
  }: CreateWebhookInput & { userId: string }): Promise<WebhookRecord> {
    const now = new Date().toISOString();
    const webhook: Webhook = {
      createdAt: now,
      definition: JSON.stringify(definition),
      deletedAt: null,
      id: `webhook_${nanoid()}`,
      name,
      uid: `hook_${nanoid(12)}`,
      updatedAt: now,
      userId,
    };

    await this.#db.insert(webhooks).values(webhook);
    return parseWebhook(webhook);
  }

  async list({
    limit,
    userId,
  }: ListWebhooksInput & { userId: string }): Promise<WebhookRecord[]> {
    const rows = await this.#db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.userId, userId), isNull(webhooks.deletedAt)))
      .orderBy(desc(webhooks.updatedAt))
      .limit(limit);

    return rows.map(parseWebhook);
  }

  async delete({
    userId,
    webhookId,
  }: {
    userId: string;
    webhookId: string;
  }): Promise<WebhookRecord> {
    const webhook = await this.#getActiveUserWebhook({ userId, webhookId });
    const deletedAt = new Date().toISOString();
    const deletedWebhook: Webhook = {
      ...webhook,
      deletedAt,
      updatedAt: deletedAt,
    };

    await this.#db
      .update(webhooks)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(webhooks.id, webhook.id));

    return parseWebhook(deletedWebhook);
  }

  async getActiveByRoute({
    name,
    uid,
  }: {
    name: string;
    uid: string;
  }): Promise<WebhookRecord> {
    const [webhook] = await this.#db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.uid, uid),
          eq(webhooks.name, name),
          isNull(webhooks.deletedAt),
        ),
      )
      .limit(1);

    if (webhook === undefined) {
      throw new WebhookNotFoundError();
    }

    return parseWebhook(webhook);
  }

  async #getActiveUserWebhook({
    userId,
    webhookId,
  }: {
    userId: string;
    webhookId: string;
  }) {
    const [webhook] = await this.#db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.id, webhookId),
          eq(webhooks.userId, userId),
          isNull(webhooks.deletedAt),
        ),
      )
      .limit(1);

    if (webhook === undefined) {
      throw new WebhookNotFoundError();
    }

    return webhook;
  }
}

function parseWebhook(webhook: Webhook): WebhookRecord {
  return webhookRecordSchema.parse({
    createdAt: webhook.createdAt,
    deletedAt: webhook.deletedAt,
    definition: JSON.parse(webhook.definition),
    id: webhook.id,
    name: webhook.name,
    path: `/webhook/${webhook.uid}/${webhook.name}`,
    uid: webhook.uid,
    updatedAt: webhook.updatedAt,
    userId: webhook.userId,
  });
}
