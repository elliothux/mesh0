import { DockerSandbox } from "@mesh0/adapters/sandbox/docker-runner";
import { FsRunStorageProvider } from "@mesh0/adapters/storage/fs";
import { createDb } from "@mesh0/db";
import { buildRunStorageUri } from "@mesh0/sdk/artifacts";
import { AUTH_ACCESS_TOKEN_COOKIE } from "@mesh0/sdk/auth";
import type {
  AgentRunInput,
  AppendRunEventsInput,
  CompleteRunInput,
} from "@mesh0/sdk/types";
import { Services } from "@mesh0/services";
import type { RunNotificationDispatcher } from "@mesh0/services/run";
import { ORPCError } from "@orpc/server";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WorkOSAuth } from "../../apps/api/src/auth";
import { createBunApiServer } from "../../apps/api/src/bun";
import type { WorkerEnv } from "../../apps/api/src/context";
import { createMemoryD1 } from "./memory-d1";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../packages/db/migrations");
const LOCAL_DASHBOARD_ACCESS_TOKEN = "local_dashboard_access_token";

const dashboardRunInput: AgentRunInput = {
  env: {
    OPENAI_API_KEY: "sk_local_dashboard",
    OPENAI_BASE_URL: "http://127.0.0.1:1/v1",
    OPENAI_MODEL: "local-dashboard",
  },
  prompt: "Dashboard seeded run",
};

export async function startLocalDockerFsApi({
  runnerImage,
}: {
  runnerImage: string;
}) {
  let runnerApiUrl = "";
  const sqlite = new Database(":memory:");
  applyMigrations(sqlite);

  const d1 = createMemoryD1(sqlite);
  const db = createDb(d1);
  const storage = new FsRunStorageProvider({
    rootDir: await mkdtemp(join(tmpdir(), "mesh0-fs-storage-")),
  });
  const services = new Services({
    db,
    sandbox: new DockerSandbox({
      apiUrl: () => runnerApiUrl,
      image: runnerImage,
    }),
  });
  const user = await services.user.upsert({
    createdAt: new Date().toISOString(),
    email: "local-runner-test@mesh0.local",
    emailVerified: true,
    firstName: "Local",
    id: "user_local_runner_test",
    lastName: "Runner",
    lastSignInAt: null,
    profilePictureUrl: null,
    updatedAt: new Date().toISOString(),
  });
  const { key: apiKey } = await services.apiKey.create({
    name: "Local runner smoke",
    userId: user.id,
  });

  const server = createBunApiServer({
    auth: createLocalAuth(user.id),
    db,
    env: localWorkerEnv(d1),
    hostname: "0.0.0.0",
    port: 0,
    services,
    storage,
  });

  runnerApiUrl = `http://host.docker.internal:${server.port}`;

  return {
    apiUrl: `http://127.0.0.1:${server.port}`,
    apiKey,
    close() {
      server.stop(true);
      sqlite.close();
    },
    completeRun(runId: string, completion: CompleteRunInput["completion"]) {
      return services.run.complete({ completion, runId });
    },
    runDueCrons(now: Date) {
      return services.runDueCrons(now);
    },
  };
}

export async function startLocalDashboardApi({
  notifications,
}: {
  notifications?: RunNotificationDispatcher;
} = {}) {
  const sqlite = new Database(":memory:");
  applyMigrations(sqlite);

  const d1 = createMemoryD1(sqlite);
  const db = createDb(d1);
  const storage = new FsRunStorageProvider({
    rootDir: await mkdtemp(join(tmpdir(), "mesh0-dashboard-storage-")),
  });
  const services = new Services({ db, notifications });
  const now = new Date().toISOString();
  const user = await services.user.upsert({
    createdAt: now,
    email: "dashboard-test@mesh0.local",
    emailVerified: true,
    firstName: "Dashboard",
    id: "user_local_dashboard_test",
    lastName: "Test",
    lastSignInAt: now,
    profilePictureUrl: null,
    updatedAt: now,
  });
  const activeKey = await services.apiKey.create({
    name: "Dashboard active key",
    userId: user.id,
  });
  const revokedKey = await services.apiKey.create({
    name: "Dashboard revoked key",
    userId: user.id,
  });
  await services.apiKey.revoke({
    apiKeyId: revokedKey.apiKey.id,
    userId: user.id,
  });
  const dashboardAgent = await services.agent.upsert({
    config: dashboardRunInput,
    name: "Dashboard agent",
    userId: user.id,
  });
  const dashboardCron = await services.cron.create({
    definition: { agentName: dashboardAgent.name },
    expression: "0 9 * * *",
    name: "Dashboard daily cron",
    userId: user.id,
  });
  const dashboardWebhook = await services.webhook.create({
    definition: {
      agentName: dashboardAgent.name,
      prompt: { append: "Dashboard webhook payload" },
    },
    name: "dashboard-webhook",
    userId: user.id,
  });

  for (let index = 0; index < 28; index += 1) {
    await services.run.create(user.id, {
      ...dashboardRunInput,
      prompt: `Queued dashboard run ${index}`,
    });
  }

  const completedRun = await services.run.create(user.id, {
    ...dashboardRunInput,
    prompt: "Completed dashboard run with artifact",
  });
  await services.run.appendEvents({
    events: [
      { thread_id: "thread_dashboard_completed", type: "thread.started" },
      {
        item: {
          id: "msg_dashboard_completed",
          text: "dashboard completed event",
          type: "agent_message",
        },
        type: "item.completed",
      },
      {
        type: "turn.completed",
        usage: {
          cached_input_tokens: 0,
          input_tokens: 1,
          output_tokens: 1,
          reasoning_output_tokens: 0,
        },
      },
    ],
    runId: completedRun.id,
  });
  const artifactText = "dashboard artifact ok";
  await storage.put({
    body: artifactText,
    contentType: "application/octet-stream",
    path: "output/workspace/packs/pack-00000.bin",
    runId: completedRun.id,
  });
  const workspaceManifestObject = await storage.put({
    body: JSON.stringify(
      {
        createdAt: now,
        entries: [
          {
            mode: 33188,
            path: "dashboard-artifact.txt",
            type: "file",
            contentType: "text/plain",
            digest: "sha256:dashboard-artifact",
            segments: [
              {
                key: "output/workspace/packs/pack-00000.bin",
                length: artifactText.length,
                offset: 0,
              },
            ],
            size: artifactText.length,
          },
        ],
        root: "workspace",
        version: 1,
      },
      null,
      2,
    ),
    contentType: "application/json",
    path: "output/workspace/manifest.json",
    runId: completedRun.id,
  });
  await services.run.complete({
    completion: {
      artifacts: [
        {
          contentType: workspaceManifestObject.contentType,
          id: workspaceManifestObject.key,
          kind: "directory",
          name: "workspace",
          runId: workspaceManifestObject.runId,
          uri: buildRunStorageUri(workspaceManifestObject),
        },
      ],
      lastMessage: "dashboard completed ok",
      status: "completed",
    },
    runId: completedRun.id,
  });
  const failedRun = await services.run.create(user.id, {
    ...dashboardRunInput,
    prompt: "Failed dashboard run",
  });
  await services.run.appendEvents({
    events: {
      error: { message: "dashboard failed event" },
      type: "turn.failed",
    },
    runId: failedRun.id,
  });
  await services.run.complete({
    completion: {
      lastMessage: "dashboard failed ok",
      status: "failed",
    },
    runId: failedRun.id,
  });
  const runningRun = await services.run.create(user.id, {
    ...dashboardRunInput,
    prompt: "Running dashboard run",
  });
  await services.run.appendEvents({
    events: { thread_id: "thread_dashboard_running", type: "thread.started" },
    runId: runningRun.id,
  });
  const canceledRun = await services.run.create(user.id, {
    ...dashboardRunInput,
    prompt: "Canceled dashboard run",
  });
  await services.run.complete({
    completion: {
      lastMessage: "dashboard canceled ok",
      status: "canceled",
    },
    runId: canceledRun.id,
  });

  const server = createBunApiServer({
    auth: createLocalAuth(user.id),
    db,
    env: localWorkerEnv(d1),
    hostname: "127.0.0.1",
    port: 0,
    services,
    storage,
  });

  return {
    accessToken: LOCAL_DASHBOARD_ACCESS_TOKEN,
    apiUrl: `http://127.0.0.1:${server.port}`,
    seed: {
      activeKeyName: activeKey.apiKey.name,
      activeKeyValue: activeKey.key,
      agentName: dashboardAgent.name,
      artifactPath: "dashboard-artifact.txt",
      completedRunId: completedRun.id,
      cronName: dashboardCron.name,
      eventType: "item.completed",
      failedRunId: failedRun.id,
      revokedKeyName: revokedKey.apiKey.name,
      runningRunId: runningRun.id,
      userEmail: user.email,
      webhookName: dashboardWebhook.name,
    },
    close() {
      server.stop(true);
      sqlite.close();
    },
    completeRun(runId: string, completion: CompleteRunInput["completion"]) {
      return services.run.complete({ completion, runId });
    },
    appendEvents(input: AppendRunEventsInput) {
      return services.run.appendEvents(input);
    },
    runDueCrons(now: Date) {
      return services.runDueCrons(now);
    },
  };
}

function applyMigrations(sqlite: Database) {
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
}

function localWorkerEnv(d1: ReturnType<typeof createMemoryD1>): WorkerEnv {
  return {
    APP_DOMAIN: "localhost",
    DB: d1,
    RUNNER_CONTAINER: {} as WorkerEnv["RUNNER_CONTAINER"],
    RUNS_BUCKET: {} as WorkerEnv["RUNS_BUCKET"],
    WORKOS_API_KEY: "sk_test_local",
    WORKOS_CLIENT_ID: "client_local",
  };
}

function createLocalAuth(userId: string): WorkOSAuth {
  return {
    authenticateRequest: async (request) => {
      if (
        getCookieValue(request, AUTH_ACCESS_TOKEN_COOKIE) !==
        LOCAL_DASHBOARD_ACCESS_TOKEN
      ) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Missing local dashboard access token",
        });
      }

      return {
        sessionId: "session_local_dashboard_test",
        userId,
      };
    },
    authenticateWithCode: async () => {
      throw new Error("Auth code flow is not configured for local tests");
    },
    authenticateWithRefreshToken: async () => {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Refresh token flow is not configured for local tests",
      });
    },
    getAuthorizationUrl: () => {
      throw new Error("Auth URL flow is not configured for local tests");
    },
    revokeSession: async ({ sessionId }) => {
      if (sessionId !== "session_local_dashboard_test") {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Unknown local dashboard session",
        });
      }
    },
  };
}

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader === null) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
}
