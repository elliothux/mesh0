import type { RpcClient } from "@mesh0/api";
import type { ThreadEvent } from "@openai/codex-sdk";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import {
  agentRunRecordSchema,
  threadEventSchema,
  threadEventsPayloadSchema,
} from "./schema";
import type {
  AgentRunInput,
  AgentRunRecord,
  AgentSystemPrompt,
  McpServers,
  SkillRef,
  WireApi,
  WorkspaceRef,
} from "./types";

export interface Mesh0ClientOptions {
  apiUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export class Mesh0Client {
  readonly #rpc: RpcClient;

  constructor(options: Mesh0ClientOptions = {}) {
    const apiUrl = (options.apiUrl ?? "http://localhost:5592").replace(
      /\/$/,
      "",
    );
    const link = new RPCLink({
      fetch: (request, init) => (options.fetch ?? fetch)(request, init),
      headers: () => {
        const headers = new Headers();
        if (options.apiKey !== undefined) {
          // TODO: Replace this with user/auth scoped credentials.
          headers.set("Authorization", `Bearer ${options.apiKey}`);
        }
        return headers;
      },
      url: `${apiUrl}/rpc`,
    });
    this.#rpc = createORPCClient(link);
  }

  agent() {
    return new AgentBuilder(this);
  }

  async getRun(runId: string) {
    return agentRunRecordSchema.parse(await this.#rpc.runs.get({ runId }));
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

  async createRun(input: AgentRunInput) {
    const record = agentRunRecordSchema.parse(
      await this.#rpc.runs.create(input),
    );

    return new AgentRunHandle(this, record);
  }
}

export class AgentBuilder {
  readonly #client: Mesh0Client;
  #workspace: WorkspaceRef | undefined;
  #mcpServers: McpServers | undefined;
  #skills: SkillRef[] | undefined;
  #systemPrompt: AgentSystemPrompt | undefined;
  #prompt: string | undefined;
  #baseUrl: string | undefined;
  #model: string | undefined;
  #modelProvider: string | undefined;
  #wireApi: WireApi | undefined;

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

  baseUrl(baseUrl: string) {
    this.#baseUrl = baseUrl;
    return this;
  }

  model(model: string, modelProvider?: string) {
    this.#model = model;
    this.#modelProvider = modelProvider;
    return this;
  }

  modelProvider(modelProvider: string) {
    this.#modelProvider = modelProvider;
    return this;
  }

  wireApi(wireApi: WireApi) {
    this.#wireApi = wireApi;
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

    return this.#client.createRun({
      baseUrl: this.#baseUrl,
      mcpServers: this.#mcpServers,
      model: this.#model,
      modelProvider: this.#modelProvider,
      prompt: this.#prompt,
      skills: this.#skills,
      systemPrompt: this.#systemPrompt,
      wireApi: this.#wireApi,
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

  result() {
    return this.#client.getRun(this.id);
  }
}

export function createMesh0(options?: Mesh0ClientOptions) {
  return new Mesh0Client(options);
}

export const mesh0 = createMesh0();
