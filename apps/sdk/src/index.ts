import type { RpcClient } from "@mesh0/api";
import type { ThreadEvent } from "@openai/codex-sdk";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { buildRunStorageUri } from "./artifacts";
import {
  agentRecordSchema,
  agentRunEventRecordSchema,
  agentRunInputSchema,
  agentRunRecordSchema,
  apiKeySchema,
  createApiKeyResultSchema,
  cronRecordSchema,
  signOutResultSchema,
  threadEventSchema,
  threadEventsPayloadSchema,
  userSchema,
  webhookRecordSchema,
} from "./schema";
import type {
  AgentConfig,
  AgentDefinition,
  AgentExecutionTarget,
  AgentPrompt,
  AgentRecord,
  AgentRunEventRecord,
  AgentRunInput,
  AgentRunRecord,
  AgentRunStatus,
  AgentSystemPrompt,
  AgentWorkflowDefinition,
  CreateApiKeyInput,
  CreateCronInput,
  CreateWebhookInput,
  CronRecord,
  DownloadRunArtifactInput,
  ListAgentsInput,
  ListCronsInput,
  ListRunsInput,
  ListWebhooksInput,
  McpServers,
  OpenAiEnv,
  RenameApiKeyInput,
  RevokeApiKeyInput,
  RunAgentInput,
  RunNotification,
  SingleAgentDefinition,
  SkillRef,
  WebhookRecord,
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

export interface AgentRunEventRecordsOptions {
  afterEventId?: number;
  eventType?: AgentRunEventRecord["eventType"];
  limit?: number;
}

export type ListRunsOptions = Partial<ListRunsInput>;
export type ListAgentsOptions = Partial<ListAgentsInput>;
export type ListCronsOptions = Partial<ListCronsInput>;
export type ListWebhooksOptions = Partial<ListWebhooksInput>;

export type AgentRunResult = {
  events: AgentRunEventRecord[];
  record: AgentRunRecord;
};

type AgentPlanSource = AgentBuilder | AgentRunPlan;
type AgentCollectionMode = "all" | "pipe";

type AgentRunPlanInput =
  | {
      input: AgentRunInput;
      kind: "create";
    }
  | {
      input: RunAgentInput;
      kind: "agent";
    };
type DeleteCronInput = string | { cronId: string };
type DeleteWebhookInput = string | { webhookId: string };

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

  agent(name?: string) {
    return new AgentBuilder(this, name);
  }

  all(agents: AgentPlanSource[]) {
    return new AgentCollectionRunPlan(agents, "all");
  }

  pipe(agents: AgentPlanSource[]) {
    return new AgentCollectionRunPlan(agents, "pipe");
  }

  cron(input: Pick<CreateCronInput, "expression" | "invalidateAt" | "name">) {
    return new CronBuilder(this.createCron.bind(this), input);
  }

  webhook(input: Pick<CreateWebhookInput, "name">) {
    return new WebhookBuilder(this.createWebhook.bind(this), input);
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

  async persistAgent({ config, name }: { config: AgentConfig; name: string }) {
    return agentRecordSchema.parse(
      await this.#rpc.agents.persist({ config, name }),
    );
  }

  async getAgent(name: string) {
    return agentRecordSchema.parse(await this.#rpc.agents.get({ name }));
  }

  async listAgents({ limit = 50 }: ListAgentsOptions = {}) {
    return agentRecordSchema
      .array()
      .parse(await this.#rpc.agents.list({ limit }));
  }

  async deleteAgent(name: string) {
    return agentRecordSchema.parse(await this.#rpc.agents.delete({ name }));
  }

  async runAgent(input: RunAgentInput) {
    const record = agentRunRecordSchema.parse(
      await this.#rpc.agents.run(input),
    );
    return new AgentRunHandle(this, record);
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

  async createCron(input: CreateCronInput) {
    return cronRecordSchema.parse(await this.#rpc.crons.create(input));
  }

  async listCrons({ limit = 50 }: ListCronsOptions = {}) {
    return cronRecordSchema
      .array()
      .parse(await this.#rpc.crons.list({ limit }));
  }

  async deleteCron(input: DeleteCronInput) {
    const cronId = typeof input === "string" ? input : input.cronId;
    return cronRecordSchema.parse(await this.#rpc.crons.delete({ cronId }));
  }

  async deleteCrons(input: DeleteCronInput) {
    return this.deleteCron(input);
  }

  async createWebhook(input: CreateWebhookInput) {
    return webhookRecordSchema.parse(await this.#rpc.webhooks.create(input));
  }

  async listWebhooks({ limit = 50 }: ListWebhooksOptions = {}) {
    return webhookRecordSchema
      .array()
      .parse(await this.#rpc.webhooks.list({ limit }));
  }

  async deleteWebhook(input: DeleteWebhookInput) {
    const webhookId = typeof input === "string" ? input : input.webhookId;
    return webhookRecordSchema.parse(
      await this.#rpc.webhooks.delete({ webhookId }),
    );
  }

  async deleteWebhooks(input: DeleteWebhookInput) {
    return this.deleteWebhook(input);
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
  readonly #sourceName: string | undefined;
  #workspace: WorkspaceRef | undefined;
  #mcpServers: McpServers | undefined;
  #skills: SkillRef[] | undefined;
  #systemPrompt: AgentSystemPrompt | undefined;
  #env: OpenAiEnv | undefined;
  #prompt: AgentPrompt | undefined;
  #name: string | undefined;
  #notifications: RunNotification | undefined;
  #target: AgentExecutionTarget | undefined;

  constructor(client: Mesh0Client, name?: string) {
    this.#client = client;
    this.#name = name;
    this.#sourceName = name;
  }

  name(name: string) {
    this.#name = name;
    return this;
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

  prompt(prompt: AgentPrompt) {
    this.#prompt = prompt;
    return this;
  }

  on(target: AgentExecutionTarget) {
    this.#target = target;
    return this;
  }

  notify(notifications: RunNotification) {
    this.#notifications = notifications;
    return this;
  }

  execute() {
    return this.run().execute();
  }

  persist(): Promise<AgentRecord> {
    const name = this.#name;
    if (name === undefined) {
      throw new Error("Agent name is required before persist");
    }

    return this.#client.persistAgent({ config: this.config(), name });
  }

  run() {
    return new AgentRunPlan(this.#client, this.planInput())
      .onMaybe(this.#target)
      .notifyMaybe(this.#notifications);
  }

  start() {
    return this.run().execute();
  }

  config(): AgentConfig {
    return {
      env: this.#env,
      mcpServers: this.#mcpServers,
      prompt: this.#prompt,
      skills: this.#skills,
      systemPrompt: this.#systemPrompt,
      workspace: this.#workspace,
    };
  }

  definition(): AgentDefinition {
    if (this.#sourceName !== undefined) {
      return {
        agentName: this.#sourceName,
        config: hasAgentConfig(this.overrideConfig())
          ? this.overrideConfig()
          : undefined,
        notifications: this.#notifications,
        prompt: this.#prompt,
        target: this.#target,
      };
    }

    return {
      config: this.config(),
      notifications: this.#notifications,
      target: this.#target,
    };
  }

  private planInput(): AgentRunPlanInput {
    if (this.#sourceName !== undefined) {
      return {
        input: {
          config: hasAgentConfig(this.overrideConfig())
            ? this.overrideConfig()
            : undefined,
          name: this.#sourceName,
          prompt: this.#prompt,
        },
        kind: "agent",
      };
    }

    const config = this.config();
    const prompt = resolvePrompt(config.prompt);
    if (config.env === undefined) {
      throw new Error("env is required");
    }

    if (prompt === undefined) {
      throw new Error("prompt is required");
    }

    return {
      input: agentRunInputSchema.parse({
        env: config.env,
        mcpServers: config.mcpServers,
        prompt,
        skills: config.skills,
        systemPrompt: config.systemPrompt,
        workspace: config.workspace,
      }),
      kind: "create",
    };
  }

  private overrideConfig(): AgentConfig {
    return {
      env: this.#env,
      mcpServers: this.#mcpServers,
      skills: this.#skills,
      systemPrompt: this.#systemPrompt,
      workspace: this.#workspace,
    };
  }
}

export class AgentRunPlan {
  readonly #client: Mesh0Client;
  readonly #planInput: AgentRunPlanInput;
  #target: AgentExecutionTarget | undefined;
  #notifications: RunNotification | undefined;

  constructor(client: Mesh0Client, planInput: AgentRunPlanInput) {
    this.#client = client;
    this.#planInput = planInput;
  }

  on(target: AgentExecutionTarget) {
    this.#target = target;
    return this;
  }

  onMaybe(target: AgentExecutionTarget | undefined) {
    if (target !== undefined) {
      this.#target = target;
    }

    return this;
  }

  notify(notifications: RunNotification) {
    this.#notifications = notifications;
    return this;
  }

  notifyMaybe(notifications: RunNotification | undefined) {
    if (notifications !== undefined) {
      this.#notifications = notifications;
    }

    return this;
  }

  async execute() {
    if (this.#planInput.kind === "agent") {
      return this.#client.runAgent({
        ...this.#planInput.input,
        notifications: this.#notifications,
        target: this.#target,
      });
    }

    return this.#client.createRun({
      ...this.#planInput.input,
      notifications: this.#notifications,
      target: this.#target,
    });
  }

  async run(options?: AgentRunWaitOptions): Promise<AgentRunResult> {
    return (await this.execute()).waitWithEvents(options);
  }

  definition(): SingleAgentDefinition {
    if (this.#planInput.kind === "agent") {
      return {
        agentName: this.#planInput.input.name,
        config: this.#planInput.input.config,
        notifications: this.#notifications,
        prompt: this.#planInput.input.prompt,
        target: this.#target,
      };
    }

    return {
      config: this.#planInput.input,
      notifications: this.#notifications,
      target: this.#target,
    };
  }

  withWorkspaceSource(runId: string) {
    if (this.#planInput.kind === "agent") {
      const config = this.#planInput.input.config ?? {};
      return new AgentRunPlan(this.#client, {
        input: {
          ...this.#planInput.input,
          config: {
            ...config,
            workspace: {
              ...config.workspace,
              source: { runId, type: "run" },
            },
          },
        },
        kind: "agent",
      });
    }

    return new AgentRunPlan(this.#client, {
      input: {
        ...this.#planInput.input,
        workspace: {
          ...this.#planInput.input.workspace,
          source: { runId, type: "run" },
        },
      },
      kind: "create",
    });
  }
}

export class AgentCollectionRunPlan {
  readonly #mode: AgentCollectionMode;
  readonly #sources: AgentPlanSource[];
  #catchSource: AgentPlanSource | undefined;
  #thenSource: AgentPlanSource | undefined;

  constructor(sources: AgentPlanSource[], mode: AgentCollectionMode) {
    this.#mode = mode;
    this.#sources = sources;
  }

  // oxlint-disable-next-line unicorn/no-thenable -- public workflow DSL mirrors Promise-style chaining.
  then(source: AgentPlanSource) {
    this.#thenSource = source;
    return this;
  }

  catch(source: AgentPlanSource) {
    this.#catchSource = source;
    return this;
  }

  async execute() {
    try {
      const handles =
        this.#mode === "all"
          ? await this.#executeAll()
          : await this.#executePipe();
      if (this.#thenSource !== undefined) {
        handles.push(await sourceRunPlan(this.#thenSource).execute());
      }

      return handles;
    } catch (error) {
      if (this.#catchSource !== undefined) {
        await sourceRunPlan(this.#catchSource).execute();
      }

      throw error;
    }
  }

  async run(options?: AgentRunWaitOptions) {
    const handles = await this.execute();
    return Promise.all(handles.map((handle) => handle.waitWithEvents(options)));
  }

  definition(): AgentWorkflowDefinition {
    return {
      agents: this.#sources.map((source) => sourceRunPlan(source).definition()),
      catch:
        this.#catchSource === undefined
          ? undefined
          : sourceRunPlan(this.#catchSource).definition(),
      mode: this.#mode,
      // oxlint-disable-next-line unicorn/no-thenable -- serialized workflow definitions expose the public then branch.
      then:
        this.#thenSource === undefined
          ? undefined
          : sourceRunPlan(this.#thenSource).definition(),
    };
  }

  async #executeAll() {
    return Promise.all(
      this.#sources.map((source) => sourceRunPlan(source).execute()),
    );
  }

  async #executePipe() {
    const handles: AgentRunHandle[] = [];
    let previousRunId: string | undefined;

    for (const source of this.#sources) {
      const plan = sourceRunPlan(source);
      const pipedPlan =
        previousRunId === undefined
          ? plan
          : plan.withWorkspaceSource(previousRunId);
      const handle = await pipedPlan.execute();
      handles.push(handle);
      const record = await handle.wait();
      if (record.status !== "completed") {
        throw new Error(`Pipe run ${record.id} finished with ${record.status}`);
      }

      previousRunId = handle.id;
    }

    return handles;
  }
}

export class CronBuilder {
  readonly #create: (input: CreateCronInput) => Promise<CronRecord>;
  readonly #input: Pick<
    CreateCronInput,
    "expression" | "invalidateAt" | "name"
  >;
  #definition: AgentDefinition | undefined;

  constructor(
    create: (input: CreateCronInput) => Promise<CronRecord>,
    input: Pick<CreateCronInput, "expression" | "invalidateAt" | "name">,
  ) {
    this.#create = create;
    this.#input = input;
  }

  agent(source: AgentPlanSource) {
    this.#definition = sourceRunPlan(source).definition();
    return this.persist();
  }

  all(sources: AgentPlanSource[]) {
    this.#definition = new AgentCollectionRunPlan(sources, "all").definition();
    return this.persist();
  }

  pipe(sources: AgentPlanSource[]) {
    this.#definition = new AgentCollectionRunPlan(sources, "pipe").definition();
    return this.persist();
  }

  // oxlint-disable-next-line unicorn/no-thenable -- public workflow DSL mirrors Promise-style chaining.
  then(source: AgentPlanSource) {
    this.#definition = sourceRunPlan(source).definition();
    return this;
  }

  catch(source: AgentPlanSource) {
    this.#definition = sourceRunPlan(source).definition();
    return this;
  }

  workflow(plan: AgentCollectionRunPlan) {
    this.#definition = plan.definition();
    return this.persist();
  }

  persist(): Promise<CronRecord> {
    const definition = this.#definition;
    if (definition === undefined) {
      throw new Error("Cron agent definition is required");
    }

    return this.#create({
      definition,
      expression: this.#input.expression,
      invalidateAt: this.#input.invalidateAt,
      name: this.#input.name,
    });
  }
}

export class WebhookBuilder {
  readonly #create: (input: CreateWebhookInput) => Promise<WebhookRecord>;
  readonly #input: Pick<CreateWebhookInput, "name">;
  #definition: AgentDefinition | undefined;

  constructor(
    create: (input: CreateWebhookInput) => Promise<WebhookRecord>,
    input: Pick<CreateWebhookInput, "name">,
  ) {
    this.#create = create;
    this.#input = input;
  }

  agent(source: AgentPlanSource) {
    this.#definition = sourceRunPlan(source).definition();
    return this.persist();
  }

  all(sources: AgentPlanSource[]) {
    this.#definition = new AgentCollectionRunPlan(sources, "all").definition();
    return this.persist();
  }

  pipe(sources: AgentPlanSource[]) {
    this.#definition = new AgentCollectionRunPlan(sources, "pipe").definition();
    return this.persist();
  }

  // oxlint-disable-next-line unicorn/no-thenable -- public workflow DSL mirrors Promise-style chaining.
  then(source: AgentPlanSource) {
    this.#definition = sourceRunPlan(source).definition();
    return this;
  }

  catch(source: AgentPlanSource) {
    this.#definition = sourceRunPlan(source).definition();
    return this;
  }

  workflow(plan: AgentCollectionRunPlan) {
    this.#definition = plan.definition();
    return this.persist();
  }

  persist(): Promise<WebhookRecord> {
    const definition = this.#definition;
    if (definition === undefined) {
      throw new Error("Webhook agent definition is required");
    }

    return this.#create({
      definition,
      name: this.#input.name,
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

  async waitWithEvents({
    intervalMs = 1_000,
    timeoutMs = 10 * 60 * 1_000,
  }: AgentRunWaitOptions = {}): Promise<AgentRunResult> {
    const deadline = Date.now() + timeoutMs;
    const events: AgentRunEventRecord[] = [];
    let afterEventId: number | undefined;

    while (true) {
      const [record, newEvents] = await Promise.all([
        this.result(),
        this.eventRecords({ afterEventId }),
      ]);
      for (const event of newEvents) {
        events.push(event);
        afterEventId = event.id;
      }

      if (isTerminalStatus(record.status)) {
        return { events, record };
      }

      if (Date.now() >= deadline) {
        throw new Error(`Run ${this.id} did not finish within ${timeoutMs}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

class StandaloneAgentBuilder extends AgentBuilder {
  constructor(name?: string) {
    super(mesh0, name);
  }
}

class StandaloneAllRunPlan extends AgentCollectionRunPlan {
  constructor(sources: AgentPlanSource[]) {
    super(sources, "all");
  }
}

class StandalonePipeRunPlan extends AgentCollectionRunPlan {
  constructor(sources: AgentPlanSource[]) {
    super(sources, "pipe");
  }
}

export class Mesh0 extends Mesh0Client {
  static agent = StandaloneAgentBuilder;
  static all = StandaloneAllRunPlan;
  static pipe = StandalonePipeRunPlan;
}

export function createMesh0(options?: Mesh0ClientOptions) {
  return new Mesh0(options);
}

export const mesh0 = createMesh0();

function sourceRunPlan(source: AgentPlanSource) {
  return source instanceof AgentBuilder ? source.run() : source;
}

function resolvePrompt(prompt: AgentPrompt | undefined) {
  if (prompt === undefined) {
    return undefined;
  }

  if (typeof prompt === "string") {
    return prompt;
  }

  return "replace" in prompt ? prompt.replace : prompt.append;
}

function hasAgentConfig(config: AgentConfig) {
  return (
    config.env !== undefined ||
    config.mcpServers !== undefined ||
    config.prompt !== undefined ||
    config.skills !== undefined ||
    config.systemPrompt !== undefined ||
    config.workspace !== undefined
  );
}

function isTerminalStatus(status: AgentRunStatus) {
  return status === "completed" || status === "failed" || status === "canceled";
}
