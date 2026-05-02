import type { RpcClient } from "@mesh0/api";
import type { ThreadEvent } from "@openai/codex-sdk";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { buildRunStorageUri } from "./artifacts";
import {
  agentRunEventRecordSchema,
  agentRunRecordSchema,
  apiKeySchema,
  createApiKeyResultSchema,
  signOutResultSchema,
  threadEventSchema,
  threadEventsPayloadSchema,
  userSchema,
} from "./schema";
import type {
  AgentRunEventRecord,
  AgentRunInput,
  AgentRunRecord,
  AgentRunStatus,
  AgentSystemPrompt,
  CreateApiKeyInput,
  DownloadRunArtifactInput,
  McpServers,
  OpenAiEnv,
  RenameApiKeyInput,
  RevokeApiKeyInput,
  SkillRef,
  WorkspaceRef,
} from "./types";

export interface Mesh0ClientOptions {
  apiUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface AgentRunWaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface ListRunsOptions {
  limit?: number;
}

export interface AgentRunEventRecordsOptions {
  afterEventId?: number;
  eventType?: AgentRunEventRecord["eventType"];
  limit?: number;
}

export class Mesh0Client {
  readonly #apiKey: string | undefined;
  readonly #apiUrl: string;
  readonly #fetch: typeof fetch;
  readonly #rpc: RpcClient;

  constructor(options: Mesh0ClientOptions = {}) {
    const apiUrl = (options.apiUrl ?? "http://localhost:5592").replace(
      /\/$/,
      "",
    );
    const apiKey = options.apiKey?.trim();
    if (apiKey !== undefined && apiKey.length === 0) {
      throw new Error("apiKey is required when provided");
    }

    this.#apiKey = apiKey;
    this.#apiUrl = apiUrl;
    this.#fetch = options.fetch ?? fetch;

    const link = new RPCLink({
      fetch: (request, init) => this.#fetch(request, init),
      headers: () => this.#headers(),
      url: `${apiUrl}/rpc`,
    });
    this.#rpc = createORPCClient(link);
  }

  agent() {
    return new AgentBuilder(this);
  }

  async me() {
    return userSchema.parse(await this.#rpc.user.me());
  }

  async signOut() {
    return signOutResultSchema.parse(await this.#rpc.user.signOut());
  }

  async listApiKeys() {
    return apiKeySchema.array().parse(await this.#rpc.apiKeys.list());
  }

  async createApiKey(input: CreateApiKeyInput) {
    return createApiKeyResultSchema.parse(
      await this.#rpc.apiKeys.create(input),
    );
  }

  async revokeApiKey(input: RevokeApiKeyInput) {
    return apiKeySchema.parse(await this.#rpc.apiKeys.revoke(input));
  }

  async renameApiKey(input: RenameApiKeyInput) {
    return apiKeySchema.parse(await this.#rpc.apiKeys.rename(input));
  }

  async getRun(runId: string) {
    return agentRunRecordSchema.parse(await this.#rpc.runs.get({ runId }));
  }

  async listRuns({ limit = 50 }: ListRunsOptions = {}) {
    return agentRunRecordSchema
      .array()
      .parse(await this.#rpc.runs.list({ limit }));
  }

  async *events(runId: string): AsyncIterable<ThreadEvent> {
    const events = threadEventsPayloadSchema.parse(
      await this.#rpc.runs.events({ runId }),
    );
    const eventList = Array.isArray(events) ? events : [events];
    for (const event of eventList) {
      yield threadEventSchema.parse(event);
    }
  }

  async eventRecords(
    runId: string,
    { afterEventId, eventType, limit = 100 }: AgentRunEventRecordsOptions = {},
  ): Promise<AgentRunEventRecord[]> {
    return agentRunEventRecordSchema.array().parse(
      await this.#rpc.runs.eventRecords({
        afterEventId,
        eventType,
        limit,
        runId,
      }),
    );
  }

  async createRun(input: AgentRunInput) {
    const record = agentRunRecordSchema.parse(
      await this.#rpc.runs.create(input),
    );

    return new AgentRunHandle(this, record);
  }

  async downloadArtifact(input: DownloadRunArtifactInput) {
    const response = await this.#fetch(
      new URL(buildRunStorageUri(input), this.#apiUrl),
      { headers: this.#headers() },
    );
    if (!response.ok) {
      throw new Error(
        `Artifact download failed with status ${response.status}: ${await response.text()}`,
      );
    }

    return response;
  }

  #headers() {
    const headers = new Headers();
    if (this.#apiKey !== undefined) {
      headers.set("Authorization", `Bearer ${this.#apiKey}`);
    }
    return headers;
  }
}

export class AgentBuilder {
  readonly #client: Mesh0Client;
  #workspace: WorkspaceRef | undefined;
  #mcpServers: McpServers | undefined;
  #skills: SkillRef[] | undefined;
  #systemPrompt: AgentSystemPrompt | undefined;
  #env: OpenAiEnv | undefined;
  #prompt: string | undefined;

  constructor(client: Mesh0Client) {
    this.#client = client;
  }

  workspace(workspace: WorkspaceRef) {
    this.#workspace = workspace;
    return this;
  }

  mcp(mcpServers: McpServers) {
    this.#mcpServers = mcpServers;
    return this;
  }

  skills(skills: SkillRef[]) {
    this.#skills = skills;
    return this;
  }

  systemPrompt(systemPrompt: AgentSystemPrompt) {
    this.#systemPrompt = systemPrompt;
    return this;
  }

  env(env: OpenAiEnv) {
    this.#env = env;
    return this;
  }

  prompt(prompt: string) {
    this.#prompt = prompt;
    return this;
  }

  start() {
    if (this.#prompt === undefined) {
      throw new Error("prompt is required");
    }

    if (this.#env === undefined) {
      throw new Error("env is required");
    }

    return this.#client.createRun({
      env: this.#env,
      mcpServers: this.#mcpServers,
      prompt: this.#prompt,
      skills: this.#skills,
      systemPrompt: this.#systemPrompt,
      workspace: this.#workspace,
    });
  }
}

export class AgentRunHandle {
  readonly id: string;
  readonly record: AgentRunRecord;
  readonly #client: Mesh0Client;

  constructor(client: Mesh0Client, record: AgentRunRecord) {
    this.#client = client;
    this.record = record;
    this.id = record.id;
  }

  events() {
    return this.#client.events(this.id);
  }

  eventRecords(options?: AgentRunEventRecordsOptions) {
    return this.#client.eventRecords(this.id, options);
  }

  result() {
    return this.#client.getRun(this.id);
  }

  downloadArtifact(path: string) {
    return this.#client.downloadArtifact({ path, runId: this.id });
  }

  async wait({
    intervalMs = 1_000,
    timeoutMs = 10 * 60 * 1_000,
  }: AgentRunWaitOptions = {}) {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const record = await this.result();
      if (isTerminalStatus(record.status)) {
        return record;
      }

      if (Date.now() >= deadline) {
        throw new Error(`Run ${this.id} did not finish within ${timeoutMs}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

export function createMesh0(options?: Mesh0ClientOptions) {
  return new Mesh0Client(options);
}

export const mesh0 = createMesh0();

function isTerminalStatus(status: AgentRunStatus) {
  return status === "completed" || status === "failed" || status === "canceled";
}
