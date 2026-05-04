import { createMesh0, type AgentRunHandle } from "@mesh0/sdk";
import { parseRunStoragePathname } from "@mesh0/sdk/artifacts";
import type { ArtifactRef, OpenAiEnv } from "@mesh0/sdk/types";
import { z } from "zod";

const LAST_MESSAGE_PATH = "output/codex/last-message.txt";
const RUNNER_LOG_PATH = "output/mesh0/runner.log";
const REQUIRED_ARTIFACT_PATHS = [
  "output/codex/exec.jsonl",
  "output/codex/last-message.txt",
  "output/codex/stderr.log",
  "output/mesh0/output-manifest.json",
  RUNNER_LOG_PATH,
  "output/workspace/manifest.json",
];

const smokeEnvSchema = z.strictObject({
  MESH0_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  RUNNER_IMAGE: z.string().min(1),
});

interface SmokeEnv {
  mesh0ApiKey: string | undefined;
  openai: OpenAiEnv;
  runnerImage: string;
}

export function readSmokeEnv(): SmokeEnv {
  const env = smokeEnvSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL:
      process.env.RUNNER_SMOKE_BASE_URL ?? process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.RUNNER_SMOKE_MODEL ?? process.env.OPENAI_MODEL,
    RUNNER_IMAGE: process.env.RUNNER_IMAGE ?? "mesh0/runner:local",
    MESH0_API_KEY: process.env.MESH0_API_KEY,
  });

  return {
    mesh0ApiKey: env.MESH0_API_KEY,
    openai: {
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.OPENAI_BASE_URL,
      OPENAI_MODEL: env.OPENAI_MODEL,
    },
    runnerImage: env.RUNNER_IMAGE,
  };
}

export async function runSdkUserFlow({
  apiUrl,
  env,
  expectedText = "mesh0-runner-smoke-ok",
  label,
  question,
  apiKey,
}: {
  apiUrl: string;
  apiKey?: string;
  env: OpenAiEnv;
  expectedText?: string;
  label: string;
  question?: string;
}) {
  const mesh0 = createMesh0({ apiKey, apiUrl });
  const run = await mesh0
    .agent()
    .env(env)
    .systemPrompt({
      append: "Keep this smoke-test response to the requested exact text.",
    })
    .prompt(question ?? `Respond with exactly: ${expectedText}`)
    .start();
  const result = await run.wait({ timeoutMs: 10 * 60 * 1_000 });
  const listedRuns = await mesh0.listRuns({ limit: 10 });
  assert(
    listedRuns.some((record) => record.id === run.id),
    `Expected run list to include ${run.id}`,
  );

  if (result.status !== "completed") {
    throw new Error(
      [
        `Expected completed run, got ${result.status}: ${result.lastMessage ?? ""}`,
        await readOptionalArtifact(run, "output/mesh0/runner.log"),
        await readOptionalArtifact(run, "output/codex/stderr.log"),
      ]
        .filter((part) => part.length > 0)
        .join("\n"),
    );
  }

  assert(
    result.status === "completed",
    `Expected completed run, got ${result.status}: ${result.lastMessage ?? ""}`,
  );
  assert(
    result.lastMessage?.includes(expectedText),
    `Unexpected last message: ${result.lastMessage ?? ""}`,
  );
  const artifactPaths = parseArtifactPaths({
    artifacts: result.artifacts,
    runId: run.id,
  });
  for (const path of REQUIRED_ARTIFACT_PATHS) {
    assert(
      artifactPaths.includes(path),
      `Expected artifact ${path}, got ${JSON.stringify(result.artifacts)}`,
    );
  }

  const lastMessageResponse = await run.downloadArtifact(LAST_MESSAGE_PATH);
  assert(
    lastMessageResponse.headers.get("content-type")?.startsWith("text/plain"),
    `Expected text artifact content type, got ${lastMessageResponse.headers.get("content-type") ?? ""}`,
  );

  const downloadedLastMessage = await lastMessageResponse.text();
  assert(
    downloadedLastMessage.includes(expectedText),
    `Unexpected downloaded artifact: ${downloadedLastMessage}`,
  );

  const runnerLog = await (await run.downloadArtifact(RUNNER_LOG_PATH)).text();
  assert(
    runnerLog.includes(`run ${run.id} started`) &&
      runnerLog.includes(`run ${run.id} completed`),
    `Unexpected runner log: ${runnerLog}`,
  );

  let eventCount = 0;
  for await (const _event of run.events()) {
    eventCount += 1;
  }
  assert(eventCount > 0, "Expected runner to post at least one event");

  const eventRecords = await run.eventRecords({ limit: 500 });
  assert(
    eventRecords.length === eventCount,
    `Expected event record count ${eventCount}, got ${eventRecords.length}`,
  );
  assert(
    eventRecords.every(
      ({ event, eventType, runId }) =>
        eventType === event.type && runId === run.id,
    ),
    `Expected event records to include normalized event metadata`,
  );
  const [typedEventRecord] = eventRecords;
  assert(typedEventRecord !== undefined, "Expected typed event record");
  const typedEventRecords = await run.eventRecords({
    eventType: typedEventRecord.eventType,
    limit: 500,
  });
  assert(
    typedEventRecords.every(
      ({ eventType }) => eventType === typedEventRecord.eventType,
    ),
    `Expected event type filter to constrain event records`,
  );

  const firstEventPage = await run.eventRecords({ limit: 1 });
  assert(firstEventPage.length === 1, "Expected one event in first page");
  const [firstEventRecord] = firstEventPage;
  assert(firstEventRecord !== undefined, "Expected first event record");
  const nextEventPage = await run.eventRecords({
    afterEventId: firstEventRecord.id,
    limit: 500,
  });
  assert(
    nextEventPage.length === eventRecords.length - 1,
    `Expected cursor pagination to return remaining events`,
  );

  console.log(`${label}-ok ${run.id}`);
  return { runId: run.id };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readOptionalArtifact(run: AgentRunHandle, path: string) {
  try {
    const response = await run.downloadArtifact(path);
    return `${path}:\n${await response.text()}`;
  } catch {
    return "";
  }
}

function parseArtifactPaths({
  artifacts,
  runId,
}: {
  artifacts: ArtifactRef[];
  runId: string;
}) {
  return artifacts.map((artifact) => {
    const { pathname } = new URL(artifact.uri, "http://localhost");
    const parsed = parseRunStoragePathname(pathname);
    assert(
      parsed !== undefined,
      `Expected run storage artifact URI, got ${artifact.uri}`,
    );
    assert(
      parsed.runId === runId,
      `Expected artifact for ${runId}, got ${parsed.runId}`,
    );
    return parsed.path;
  });
}
