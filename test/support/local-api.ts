import { DockerSandbox } from "@mesh0/adapters/sandbox/docker-runner";
import { FsRunStorageProvider } from "@mesh0/adapters/storage/fs";
import { createDb } from "@mesh0/db";
import { Services } from "@mesh0/services";
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
        auth: {
          authenticateRequest: async () => {
            throw new Error("Auth is not configured for local runner tests");
          },
          authenticateWithCode: async () => {
            throw new Error("Auth is not configured for local runner tests");
          },
          getAuthorizationUrl: () => {
            throw new Error("Auth is not configured for local runner tests");
          },
        },
        db,
        env: {
          APP_DOMAIN: "localhost",
          DB: d1,
          WORKOS_API_KEY: "sk_test_local",
          WORKOS_CLIENT_ID: "client_local",
        } as unknown as Context["env"],
        request,
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

async function handleApiRequest(request: Request, context: Context) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: createCorsHeaders(request, context.env),
      status: 204,
    });
  }

  const storageResponse = await handleRunStorageRequest(request, context);
  if (storageResponse !== undefined) {
    return withCors(storageResponse, request, context.env);
  }

  const result = await rpcHandler.handle(request, {
    context,
    prefix: "/rpc",
  });

  if (result.matched) {
    return withCors(result.response, request, context.env);
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
