import type { RunStorage } from "@mesh0/adapters";
import type { Db } from "@mesh0/db";
import type { Services } from "@mesh0/services";
import { createApiFetchHandler } from "./app";
import type { WorkOSAuth } from "./auth";
import type { Context, WorkerEnv } from "./context";

export type BunApiRuntime = {
  auth: WorkOSAuth;
  db: Db;
  env: WorkerEnv;
  services: Services;
  storage: RunStorage;
};

export type BunApiServerOptions = BunApiRuntime & {
  hostname?: string;
  port?: number;
};

export function createBunApiFetch(runtime: BunApiRuntime) {
  return createApiFetchHandler((request) =>
    createBunApiContext(runtime, request),
  );
}

export function createBunApiServer({
  hostname = "127.0.0.1",
  port = 0,
  ...runtime
}: BunApiServerOptions) {
  return Bun.serve({
    fetch: createBunApiFetch(runtime),
    hostname,
    port,
  });
}

function createBunApiContext(
  { auth, db, env, services, storage }: BunApiRuntime,
  request: Request,
): Context {
  return {
    auth,
    db,
    env,
    request,
    responseHeaders: new Headers(),
    services,
    storage,
  };
}
