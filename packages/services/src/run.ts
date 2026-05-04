import type { RunnerSandbox } from "@mesh0/adapters";
import type { Db } from "@mesh0/db";
import { agentRunEvents, agentRuns } from "@mesh0/db/schema";
import type { AgentRun, AgentRunEvent } from "@mesh0/db/types";
import {
  agentRunEventRecordSchema,
  agentRunRecordSchema,
  threadEventSchema,
} from "@mesh0/sdk/schema";
import type {
  AgentRunEventRecord,
  AgentRunInput,
  AgentRunRecord,
  AppendRunEventsInput,
  AppendRunEventsResult,
  CompleteRunInput,
  ListRunsInput,
  RunEventRecordsInput,
  RunIdInput,
  RunWorkspaceSource,
  RunnerRunConfig,
} from "@mesh0/sdk/types";
import type { ThreadEvent } from "@openai/codex-sdk";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { constantTimeEqual, hashSecret } from "./secrets";
import { resolveSystemPrompt } from "./system-prompt";

export class RunNotFoundError extends Error {
  constructor() {
    super("Run not found");
    this.name = "RunNotFoundError";
  }
}

export class RunAuthenticationError extends Error {
  constructor() {
    super("Invalid runner token");
    this.name = "RunAuthenticationError";
  }
}

export class RunService {
  readonly #db: Db;
  readonly #sandbox: RunnerSandbox | undefined;

  constructor(db: Db, sandbox?: RunnerSandbox) {
    this.#db = db;
    this.#sandbox = sandbox;
  }

  async create(userId: string, input: AgentRunInput): Promise<AgentRunRecord> {
    await this.#validateWorkspaceSource({ input, userId });

    const runId = `run_${nanoid()}`;
    const runnerToken = nanoid(48);
    const record: AgentRunRecord = {
      artifacts: [],
      createdAt: new Date().toISOString(),
      id: runId,
      input,
      status: "queued",
      userId,
    };

    await this.#db.insert(agentRuns).values({
      artifacts: JSON.stringify(record.artifacts),
      createdAt: record.createdAt,
      id: record.id,
      input: JSON.stringify(record.input),
      runnerTokenHash: await hashSecret(runnerToken),
      status: record.status,
      userId: record.userId,
    });

    return this.#startExecution(record, runnerToken);
  }

  async list({
    limit,
    userId,
  }: ListRunsInput & { userId: string }): Promise<AgentRunRecord[]> {
    const runs = await this.#db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.userId, userId))
      .orderBy(desc(agentRuns.createdAt))
      .limit(limit);

    return runs.map(parseRun);
  }

  async get({
    runId,
    userId,
  }: RunIdInput & { userId: string }): Promise<AgentRunRecord> {
    return this.#getScopedRun({ runId, userId });
  }

  async getInput({ runId }: RunIdInput): Promise<RunnerRunConfig> {
    return buildRunnerRunConfig(await this.#getStoredRun(runId));
  }

  async workspaceSource({
    runId,
  }: RunIdInput): Promise<RunWorkspaceSource | undefined> {
    const run = await this.#getStoredRun(runId);
    const source = run.input.workspace?.source;
    if (source?.type !== "run") {
      return undefined;
    }

    const sourceRun = await this.#getStoredRun(source.runId);
    if (sourceRun.userId !== run.userId) {
      throw new RunNotFoundError();
    }

    requireWorkspaceArtifact(sourceRun);
    return source;
  }

  async authenticateRunner({
    runId,
    runnerToken,
  }: RunIdInput & { runnerToken: string }): Promise<void> {
    const run = await this.#getStoredRunRow(runId);
    const runnerTokenHash = await hashSecret(runnerToken);
    if (!constantTimeEqual(runnerTokenHash, run.runnerTokenHash)) {
      throw new RunAuthenticationError();
    }
  }

  async events({
    runId,
    userId,
  }: RunIdInput & { userId: string }): Promise<ThreadEvent[]> {
    await this.#getScopedRun({ runId, userId });
    return this.#getStoredRunEvents(runId);
  }

  async eventRecords({
    afterEventId,
    eventType,
    limit,
    runId,
    userId,
  }: RunEventRecordsInput & { userId: string }): Promise<
    AgentRunEventRecord[]
  > {
    if (runId === undefined) {
      return this.#getUserRunEventRecords({
        afterEventId,
        eventType,
        limit,
        userId,
      });
    }

    await this.#getScopedRun({ runId, userId });
    return this.#getStoredRunEventRecords({
      afterEventId,
      eventType,
      limit,
      runId,
    });
  }

  async appendEvents({
    events,
    runId,
  }: AppendRunEventsInput): Promise<AppendRunEventsResult> {
    const run = await this.#getStoredRun(runId);
    const eventList = Array.isArray(events) ? events : [events];

    for (const event of eventList) {
      const envelope = eventEnvelope(event);
      await this.#db.insert(agentRunEvents).values({
        createdAt: new Date().toISOString(),
        eventType: envelope.eventType,
        itemId: envelope.itemId,
        itemStatus: envelope.itemStatus,
        itemType: envelope.itemType,
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
    return parseRun(await this.#getStoredRunRow(runId));
  }

  async #getScopedRun({
    runId,
    userId,
  }: RunIdInput & { userId: string }): Promise<AgentRunRecord> {
    const run = await this.#getStoredRun(runId);
    if (run.userId !== userId) {
      throw new RunNotFoundError();
    }

    return run;
  }

  async #getStoredRunRow(runId: string) {
    const [run] = await this.#db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);
    if (run === undefined) {
      throw new RunNotFoundError();
    }

    return run;
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

  async #getStoredRunEventRecords({
    afterEventId,
    eventType,
    limit,
    runId,
  }: Required<Pick<RunEventRecordsInput, "runId">> &
    Omit<RunEventRecordsInput, "runId">) {
    const events = await this.#db
      .select()
      .from(agentRunEvents)
      .where(
        and(
          eq(agentRunEvents.runId, runId),
          afterEventId === undefined
            ? undefined
            : gt(agentRunEvents.id, afterEventId),
          eventType === undefined
            ? undefined
            : eq(agentRunEvents.eventType, eventType),
        ),
      )
      .orderBy(asc(agentRunEvents.id))
      .limit(limit);

    return events.map(parseRunEventRecord);
  }

  async #getUserRunEventRecords({
    afterEventId,
    eventType,
    limit,
    userId,
  }: Omit<RunEventRecordsInput, "runId"> & { userId: string }) {
    const events = await this.#db
      .select({ event: agentRunEvents })
      .from(agentRunEvents)
      .innerJoin(agentRuns, eq(agentRunEvents.runId, agentRuns.id))
      .where(
        and(
          eq(agentRuns.userId, userId),
          afterEventId === undefined
            ? undefined
            : gt(agentRunEvents.id, afterEventId),
          eventType === undefined
            ? undefined
            : eq(agentRunEvents.eventType, eventType),
        ),
      )
      .orderBy(desc(agentRunEvents.id))
      .limit(limit);

    return events.map(({ event }) => parseRunEventRecord(event));
  }

  async #startExecution(record: AgentRunRecord, runnerToken: string) {
    if (this.#sandbox === undefined) {
      return record;
    }

    try {
      const dispatch = await this.#sandbox.start({
        run: record,
        runnerToken,
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

  async #validateWorkspaceSource({
    input,
    userId,
  }: {
    input: AgentRunInput;
    userId: string;
  }) {
    const source = input.workspace?.source;
    if (source?.type !== "run") {
      return;
    }

    const sourceRun = await this.#getScopedRun({
      runId: source.runId,
      userId,
    });
    requireWorkspaceArtifact(sourceRun);
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

function requireWorkspaceArtifact(run: AgentRunRecord) {
  const hasWorkspaceArtifact = run.artifacts.some(
    (artifact) =>
      artifact.kind === "directory" && artifact.name === "workspace",
  );
  if (!hasWorkspaceArtifact) {
    throw new Error(
      `Workspace source run has no workspace artifact: ${run.id}`,
    );
  }
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
    userId: run.userId,
  });
}

function parseRunEventRecord(row: AgentRunEvent) {
  const event = threadEventSchema.parse(JSON.parse(row.event));

  return agentRunEventRecordSchema.parse({
    createdAt: row.createdAt,
    event,
    eventType: row.eventType,
    id: row.id,
    itemId: row.itemId ?? undefined,
    itemStatus: row.itemStatus ?? undefined,
    itemType: row.itemType ?? undefined,
    runId: row.runId,
  });
}

function eventEnvelope(event: ThreadEvent) {
  if (
    event.type === "item.started" ||
    event.type === "item.updated" ||
    event.type === "item.completed"
  ) {
    return {
      eventType: event.type,
      itemId: event.item.id,
      itemStatus: "status" in event.item ? event.item.status : null,
      itemType: event.item.type,
    };
  }

  return {
    eventType: event.type,
    itemId: null,
    itemStatus: null,
    itemType: null,
  };
}

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
