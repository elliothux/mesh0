import { DockerSandbox } from "@mesh0/adapters/sandbox/docker-runner";
import { FsRunStorageProvider } from "@mesh0/adapters/storage/fs";
import { buildArtifactRef } from "@mesh0/adapters/utils";
import { createDb } from "@mesh0/db";
import { AUTH_ACCESS_TOKEN_COOKIE } from "@mesh0/sdk/auth";
import type { AgentRunInput } from "@mesh0/sdk/types";
import { Services } from "@mesh0/services";
import { ORPCError } from "@orpc/server";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Context } from "../../apps/api/src/context";
import {
  createCorsHeaders,
  rpcHandler,
  withCors,
} from "../../apps/api/src/orpc";
import { handleRunStorageRequest } from "../../apps/api/src/storage";
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

  const server = Bun.serve({
    fetch: (request) => {
      const context: Context = {
        auth: createLocalAuth(user.id),
        db,
        env: {
          APP_DOMAIN: "localhost",
          DB: d1,
          WORKOS_API_KEY: "sk_test_local",
          WORKOS_CLIENT_ID: "client_local",
        } as unknown as Context["env"],
        request,
        responseHeaders: new Headers(),
        services,
        storage,
      };

      return handleApiRequest(request, context);
    },
    hostname: "0.0.0.0",
    port: 0,
  });

  runnerApiUrl = `http://host.docker.internal:${server.port}`;

  return {
    apiUrl: `http://127.0.0.1:${server.port}`,
    apiKey,
    close() {
      server.stop(true);
      sqlite.close();
    },
  };
}

export async function startLocalDashboardApi() {
  const sqlite = new Database(":memory:");
  applyMigrations(sqlite);

  const d1 = createMemoryD1(sqlite);
  const db = createDb(d1);
  const storage = new FsRunStorageProvider({
    rootDir: await mkdtemp(join(tmpdir(), "mesh0-dashboard-storage-")),
  });
  const services = new Services({ db });
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
  const artifactObject = await storage.put({
    body: "dashboard artifact ok",
    contentType: "text/plain",
    path: "output/dashboard-artifact.txt",
    runId: completedRun.id,
  });
  await services.run.complete({
    completion: {
      artifacts: [buildArtifactRef(artifactObject)],
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

  const server = Bun.serve({
    fetch: (request) => {
      const context: Context = {
        auth: createLocalAuth(user.id),
        db,
        env: {
          APP_DOMAIN: "localhost",
          DB: d1,
          WORKOS_API_KEY: "sk_test_local",
          WORKOS_CLIENT_ID: "client_local",
        } as unknown as Context["env"],
        request,
        responseHeaders: new Headers(),
        services,
        storage,
      };

      return handleApiRequest(request, context);
    },
    hostname: "127.0.0.1",
    port: 0,
  });

  return {
    accessToken: LOCAL_DASHBOARD_ACCESS_TOKEN,
    apiUrl: `http://127.0.0.1:${server.port}`,
    seed: {
      activeKeyName: activeKey.apiKey.name,
      artifactPath: "output/dashboard-artifact.txt",
      completedRunId: completedRun.id,
      eventType: "item.completed",
      failedRunId: failedRun.id,
      revokedKeyName: revokedKey.apiKey.name,
      userEmail: user.email,
    },
    close() {
      server.stop(true);
      sqlite.close();
    },
  };
}

async function handleApiRequest(request: Request, context: Context) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: createCorsHeaders(request, context.env),
      status: 204,
    });
  }

  const storageResponse = await handleRunStorageRequest(request, context);
  if (storageResponse !== undefined) {
    return withCors(
      mergeResponseHeaders(storageResponse, context.responseHeaders),
      request,
      context.env,
    );
  }

  const result = await rpcHandler.handle(request, {
    context,
    prefix: "/rpc",
  });

  if (result.matched) {
    return withCors(
      mergeResponseHeaders(result.response, context.responseHeaders),
      request,
      context.env,
    );
  }

  return withCors(
    new Response("Not Found", { status: 404 }),
    request,
    context.env,
  );
}

function applyMigrations(sqlite: Database) {
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
}

function mergeResponseHeaders(response: Response, headers: Headers) {
  if ([...headers].length === 0) {
    return response;
  }

  const mergedHeaders = new Headers(response.headers);
  for (const [key, value] of headers) {
    mergedHeaders.append(key, value);
  }

  return new Response(response.body, {
    headers: mergedHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}

function createLocalAuth(userId: string): Context["auth"] {
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
