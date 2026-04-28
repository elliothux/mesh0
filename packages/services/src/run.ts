import type { RunnerSandbox } from "@mesh0/adapters";
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
  RunIdInput,
  RunnerRunConfig,
} from "@mesh0/sdk/types";
import type { ThreadEvent } from "@openai/codex-sdk";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { resolveSystemPrompt } from "./system-prompt";

export class RunNotFoundError extends Error {
  constructor() {
    super("Run not found");
    this.name = "RunNotFoundError";
  }
}

export class RunService {
  readonly #db: Db;
  readonly #sandbox: RunnerSandbox | undefined;

  constructor(db: Db, sandbox?: RunnerSandbox) {
    this.#db = db;
    this.#sandbox = sandbox;
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

    return this.#startExecution(record);
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

  async #startExecution(record: AgentRunRecord) {
    if (this.#sandbox === undefined) {
      return record;
    }

    try {
      const dispatch = await this.#sandbox.start({
        run: record,
      });
      if (dispatch.completion !== undefined) {
        void this.#completeOnDispatchFailure(record.id, dispatch.completion);
      }
      return record;
    } catch (error) {
      return this.complete({
        completion: {
          lastMessage: formatExecutionError(error),
          status: "failed",
        },
        runId: record.id,
      });
    }
  }

  async #completeOnDispatchFailure(runId: string, completion: Promise<void>) {
    try {
      await completion;
    } catch (error) {
      const run = await this.#getStoredRun(runId);
      if (run.finishedAt !== undefined) {
        return;
      }

      await this.complete({
        completion: {
          lastMessage: formatExecutionError(error),
          status: "failed",
        },
        runId,
      });
    }
  }
}

function buildRunnerRunConfig(run: AgentRunRecord): RunnerRunConfig {
  return {
    baseInstructions: resolveSystemPrompt(run.input.systemPrompt),
    env: run.input.env,
    mcpServers: run.input.mcpServers,
    prompt: run.input.prompt,
    runId: run.id,
    skills: run.input.skills,
    workspace: run.input.workspace,
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

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
