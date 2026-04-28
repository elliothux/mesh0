import type {
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { RunStorage } from "@mesh0/adapters";
import type { Db } from "@mesh0/db";
import type { Services } from "@mesh0/services";
import { os } from "@orpc/server";

export type WorkerEnv = {
  DB: D1Database;
  RUNNER_CONTAINER: DurableObjectNamespace;
  RUNS_BUCKET: R2Bucket;
};

export type Context = {
  db: Db;
  env: WorkerEnv;
  services: Services;
  storage: RunStorage;
};

export const procedure = os.$context<Context>();
