import { ORPCError } from "@orpc/server";
import { resolveSystemPrompt } from "./run-prompt";

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

const runs = new Map<string, AgentRunRecord>();
const runEvents = new Map<string, ThreadEvent[]>();
const DEFAULT_BASE_URL_MODEL_PROVIDER = "mesh0-openai";
const DEFAULT_WIRE_API = "responses";

export function createRun(input: AgentRunInput): AgentRunRecord {
  const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
  const record: AgentRunRecord = {
    artifacts: [],
    createdAt: new Date().toISOString(),
    id: runId,
    input,
    status: "queued",
  };

  runs.set(runId, record);
  runEvents.set(runId, []);

  return record;
}

export function getRun({ runId }: RunIdInput): AgentRunRecord {
  return getStoredRun(runId);
}

export function getRunInput({ runId }: RunIdInput): RunnerRunConfig {
  return buildRunnerRunConfig(getStoredRun(runId));
}

export function getRunEvents({ runId }: RunIdInput): ThreadEvent[] {
  getStoredRun(runId);
  return runEvents.get(runId) ?? [];
}

export function appendRunEvents({
  events,
  runId,
}: AppendRunEventsInput): AppendRunEventsResult {
  const run = getStoredRun(runId);
  const eventList = Array.isArray(events) ? events : [events];
  const existingEvents = runEvents.get(runId) ?? [];
  existingEvents.push(...eventList);
  runEvents.set(runId, existingEvents);

  if (run.status === "queued") {
    runs.set(runId, {
      ...run,
      startedAt: new Date().toISOString(),
      status: "running",
    });
  }

  // TODO: Require a short-lived runner token before accepting event writes.
  return { appended: eventList.length };
}

export function completeRun({
  completion,
  runId,
}: CompleteRunInput): AgentRunRecord {
  const run = getStoredRun(runId);
  const record: AgentRunRecord = {
    ...run,
    artifacts: completion.artifacts ?? [],
    finishedAt: new Date().toISOString(),
    lastMessage: completion.lastMessage,
    startedAt: run.startedAt ?? new Date().toISOString(),
    status: completion.status,
  };

  runs.set(runId, record);

  // TODO: Persist completion state and output-manifest metadata in D1/R2.
  return record;
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

function getStoredRun(runId: string) {
  const run = runs.get(runId);
  if (run === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "Run not found" });
  }

  return run;
}
