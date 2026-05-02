import { apiKeys } from "@mesh0/db/schema";
import type { ApiKey } from "@mesh0/db/types";
import { API_KEY_PREFIX } from "@mesh0/sdk/auth";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { Db } from "@mesh0/db";
import { constantTimeEqual, hashSecret } from "./secrets";

const apiKeyPattern = new RegExp(
  `^${API_KEY_PREFIX.replace(".", "\\.")}(key_[A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`,
);

export class ApiKeyAuthenticationError extends Error {
  constructor() {
    super("Invalid API key");
    this.name = "ApiKeyAuthenticationError";
  }
}

export class ApiKeyNotFoundError extends Error {
  constructor() {
    super("API key not found");
    this.name = "ApiKeyNotFoundError";
  }
}

export type ApiKeyRecord = Omit<ApiKey, "secretHash">;

type CreateApiKeyInput = {
  name: string;
  userId: string;
};

type RevokeApiKeyInput = {
  apiKeyId: string;
  userId: string;
};

export class ApiKeyService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async authenticate(key: string): Promise<ApiKeyRecord> {
    const { id, secret } = parseApiKey(key);
    const storedKey = await this.#getActive(id);
    const secretHash = await hashSecret(secret);

    if (!constantTimeEqual(secretHash, storedKey.secretHash)) {
      throw new ApiKeyAuthenticationError();
    }

    const lastUsedAt = new Date().toISOString();
    await this.#db
      .update(apiKeys)
      .set({ lastUsedAt })
      .where(eq(apiKeys.id, storedKey.id));

    return serializeApiKey({ ...storedKey, lastUsedAt });
  }

  async create({ name, userId }: CreateApiKeyInput) {
    const id = `key_${nanoid()}`;
    const secret = nanoid(48);
    const key = `${API_KEY_PREFIX}${id}.${secret}`;
    const apiKey: ApiKey = {
      createdAt: new Date().toISOString(),
      id,
      lastUsedAt: null,
      name,
      prefix: `${API_KEY_PREFIX}${id.slice(0, 12)}`,
      revokedAt: null,
      secretHash: await hashSecret(secret),
      userId,
    };

    await this.#db.insert(apiKeys).values(apiKey);

    return {
      apiKey: serializeApiKey(apiKey),
      key,
    };
  }

  async list(userId: string): Promise<ApiKeyRecord[]> {
    const keys = await this.#db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));

    return keys.map(serializeApiKey);
  }

  async revoke({ apiKeyId, userId }: RevokeApiKeyInput) {
    const apiKey = await this.#getUserKey({ apiKeyId, userId });
    if (apiKey.revokedAt !== null) {
      return serializeApiKey(apiKey);
    }

    const revokedAt = new Date().toISOString();
    await this.#db
      .update(apiKeys)
      .set({ revokedAt })
      .where(eq(apiKeys.id, apiKey.id));

    return serializeApiKey({ ...apiKey, revokedAt });
  }

  async #getActive(id: string) {
    const [apiKey] = await this.#db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (apiKey === undefined || apiKey.revokedAt !== null) {
      throw new ApiKeyAuthenticationError();
    }

    return apiKey;
  }

  async #getUserKey({ apiKeyId, userId }: RevokeApiKeyInput) {
    const [apiKey] = await this.#db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    if (apiKey === undefined || apiKey.userId !== userId) {
      throw new ApiKeyNotFoundError();
    }

    return apiKey;
  }
}

function parseApiKey(key: string) {
  const match = apiKeyPattern.exec(key);
  const id = match?.[1];
  const secret = match?.[2];
  if (id === undefined || secret === undefined) {
    throw new ApiKeyAuthenticationError();
  }

  return { id, secret };
}

function serializeApiKey({
  createdAt,
  id,
  lastUsedAt,
  name,
  prefix,
  revokedAt,
  userId,
}: ApiKey): ApiKeyRecord {
  return {
    createdAt,
    id,
    lastUsedAt,
    name,
    prefix,
    revokedAt,
    userId,
  };
}
