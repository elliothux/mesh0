import type {
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { RunStorage } from "@mesh0/adapters";
import type { Db } from "@mesh0/db";
import type { Services } from "@mesh0/services";
import { ORPCError, os } from "@orpc/server";

import type { WorkOSAuth } from "./auth";

export type WorkerEnv = {
  DB: D1Database;
  RUNNER_CONTAINER: DurableObjectNamespace;
  RUNS_BUCKET: R2Bucket;
  WORKOS_API_KEY: string;
  WORKOS_CLIENT_ID: string;
};

export type Context = {
  auth: WorkOSAuth;
  db: Db;
  env: WorkerEnv;
  request: Request;
  services: Services;
  storage: RunStorage;
};

export const procedure = os.$context<Context>();
const requireUser = procedure.middleware(async ({ context, next }) => {
  const session = await context.auth.authenticateRequest(context.request);

  try {
    const user = await context.services.user.get(session.userId);
    return next({ context: { user } });
  } catch (error) {
    if (error instanceof Error && error.name === "UserNotFoundError") {
      throw new ORPCError("UNAUTHORIZED", { message: error.message });
    }

    throw error;
  }
});

export const protectedProcedure = procedure.use(requireUser);
