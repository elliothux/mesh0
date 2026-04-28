import type { Db } from "@mesh0/db";
import { agentRunEvents, agentRuns } from "@mesh0/db/schema";
import type { AgentRun } from "@mesh0/db/types";
import { agentRunRecordSchema, threadEventSchema } from "@mesh0/sdk/schema";
import type {
  AgentRunInput,
  AgentRunRecord,
  AppendRunEventsInput,
  AppendRunEventsResult,
  CompleteRunInput,
  ModelProviderConfig,
  RunIdInput,
  RunnerRunConfig,
} from "@mesh0/sdk/types";
import type { ThreadEvent } from "@openai/codex-sdk";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { resolveSystemPrompt } from "./system-prompt";

const DEFAULT_BASE_URL_MODEL_PROVIDER = "mesh0-openai";
const DEFAULT_WIRE_API = "responses";

export class RunNotFoundError extends Error {
  constructor() {
    super("Run not found");
    this.name = "RunNotFoundError";
  }
}

export class RunService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async create(input: AgentRunInput): Promise<AgentRunRecord> {
    const runId = `run_${nanoid()}`;
    const record: AgentRunRecord = {
      artifacts: [],
      createdAt: new Date().toISOString(),
      id: runId,
      input,
      status: "queued",
    };

    await this.#db.insert(agentRuns).values({
      artifacts: JSON.stringify(record.artifacts),
      createdAt: record.createdAt,
      id: record.id,
      input: JSON.stringify(record.input),
      status: record.status,
    });

    return record;
  }

  async get({ runId }: RunIdInput): Promise<AgentRunRecord> {
    return this.#getStoredRun(runId);
  }

  async getInput({ runId }: RunIdInput): Promise<RunnerRunConfig> {
    return buildRunnerRunConfig(await this.#getStoredRun(runId));
  }

  async getEvents({ runId }: RunIdInput): Promise<ThreadEvent[]> {
    await this.#getStoredRun(runId);
    return this.#getStoredRunEvents(runId);
  }

  async appendEvents({
    events,
    runId,
  }: AppendRunEventsInput): Promise<AppendRunEventsResult> {
    const run = await this.#getStoredRun(runId);
    const eventList = Array.isArray(events) ? events : [events];

    for (const event of eventList) {
      await this.#db.insert(agentRunEvents).values({
        createdAt: new Date().toISOString(),
        event: JSON.stringify(event),
        runId,
      });
    }

    if (run.status === "queued") {
      await this.#db
        .update(agentRuns)
        .set({
          startedAt: new Date().toISOString(),
          status: "running",
        })
        .where(eq(agentRuns.id, runId));
    }

    // TODO: Require a short-lived runner token before accepting event writes.
    return { appended: eventList.length };
  }

  async complete({
    completion,
    runId,
  }: CompleteRunInput): Promise<AgentRunRecord> {
    const run = await this.#getStoredRun(runId);
    const record: AgentRunRecord = {
      ...run,
      artifacts: completion.artifacts ?? [],
      finishedAt: new Date().toISOString(),
      lastMessage: completion.lastMessage,
      startedAt: run.startedAt ?? new Date().toISOString(),
      status: completion.status,
    };

    await this.#db
      .update(agentRuns)
      .set({
        artifacts: JSON.stringify(record.artifacts),
        finishedAt: record.finishedAt,
        lastMessage: record.lastMessage ?? null,
        startedAt: record.startedAt,
        status: record.status,
      })
      .where(eq(agentRuns.id, runId));

    return record;
  }

  async #getStoredRun(runId: string) {
    const [run] = await this.#db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);
    if (run === undefined) {
      throw new RunNotFoundError();
    }

    return parseRun(run);
  }

  async #getStoredRunEvents(runId: string) {
    const events = await this.#db
      .select()
      .from(agentRunEvents)
      .where(eq(agentRunEvents.runId, runId))
      .orderBy(asc(agentRunEvents.id));

    return threadEventSchema
      .array()
      .parse(events.map(({ event }) => JSON.parse(event)));
  }
}

function buildRunnerRunConfig(run: AgentRunRecord): RunnerRunConfig {
  const modelProvider = buildModelProvider(run.input);
  return {
    baseInstructions: resolveSystemPrompt(run.input.systemPrompt),
    mcpServers: run.input.mcpServers,
    model: run.input.model,
    modelProvider,
    modelProviders: buildModelProviders(run.input, modelProvider),
    prompt: run.input.prompt,
    runId: run.id,
    skills: run.input.skills,
  };
}

function buildModelProvider(input: AgentRunInput) {
  if (input.baseUrl !== undefined) {
    return input.modelProvider ?? DEFAULT_BASE_URL_MODEL_PROVIDER;
  }

  return input.modelProvider;
}

function buildModelProviders(
  input: AgentRunInput,
  modelProvider: string | undefined,
): Record<string, ModelProviderConfig> | undefined {
  if (input.baseUrl === undefined || modelProvider === undefined) {
    return undefined;
  }

  return {
    [modelProvider]: {
      base_url: input.baseUrl,
      env_key: "CODEX_API_KEY",
      name: modelProvider,
      wire_api: input.wireApi ?? DEFAULT_WIRE_API,
    },
  };
}

function parseRun(run: AgentRun) {
  return agentRunRecordSchema.parse({
    artifacts: JSON.parse(run.artifacts),
    createdAt: run.createdAt,
    finishedAt: run.finishedAt ?? undefined,
    id: run.id,
    input: JSON.parse(run.input),
    lastMessage: run.lastMessage ?? undefined,
    startedAt: run.startedAt ?? undefined,
    status: run.status,
  });
}
