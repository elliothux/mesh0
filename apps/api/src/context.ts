import type {
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { RunStorage } from "@mesh0/adapters";
import type { Db } from "@mesh0/db";
import type { User } from "@mesh0/db/types";
import { API_KEY_PREFIX } from "@mesh0/sdk/auth";
import type { Services } from "@mesh0/services";
import { ApiKeyAuthenticationError } from "@mesh0/services/api-key";
import { RunAuthenticationError } from "@mesh0/services/run";
import { UserNotFoundError } from "@mesh0/services/user";
import { ORPCError, os } from "@orpc/server";

import type { WorkOSAuth } from "./auth";
import type { AppEnv } from "./env";
import { getBearerToken } from "./http";

export type WorkerEnv = AppEnv & {
  DB: D1Database;
  RUNNER_CONTAINER: DurableObjectNamespace;
  RUNS_BUCKET: R2Bucket;
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

export async function authenticateContextUser(context: Context): Promise<User> {
  try {
    const token = getBearerToken(context.request);
    const apiKey =
      token?.startsWith(API_KEY_PREFIX) === true ? token : undefined;
    if (apiKey !== undefined) {
      const authenticatedKey =
        await context.services.apiKey.authenticate(apiKey);
      return context.services.user.get(authenticatedKey.userId);
    }

    const session = await context.auth.authenticateRequest(context.request);
    const user = await context.services.user.get(session.userId);
    return user;
  } catch (error) {
    if (
      error instanceof ApiKeyAuthenticationError ||
      error instanceof UserNotFoundError
    ) {
      throw new ORPCError("UNAUTHORIZED", { message: error.message });
    }

    throw error;
  }
}

export async function authenticateContextRunner(
  context: Context,
  runId: string,
): Promise<void> {
  const runnerToken = getBearerToken(context.request);
  if (runnerToken === undefined || runnerToken.startsWith(API_KEY_PREFIX)) {
    throw new ORPCError("UNAUTHORIZED", { message: "Missing runner token" });
  }

  try {
    await context.services.run.authenticateRunner({
      runId,
      runnerToken,
    });
  } catch (error) {
    if (error instanceof RunAuthenticationError) {
      throw new ORPCError("UNAUTHORIZED", { message: error.message });
    }

    throw error;
  }
}

const requireUser = procedure.middleware(async ({ context, next }) => {
  const user = await authenticateContextUser(context);
  return next({ context: { user } });
});

export const protectedProcedure = procedure.use(requireUser);
