import type { RouterClient } from "@orpc/server";
import { agentRouter } from "./agent";
import { apiKeyRouter } from "./api-key";
import { cronRouter } from "./cron";
import { runRouter } from "./run";
import { statusRouter } from "./status";
import { userRouter } from "./user";
import { webhookRouter } from "./webhook";

export const router = {
  agents: agentRouter,
  apiKeys: apiKeyRouter,
  crons: cronRouter,
  runs: runRouter,
  status: statusRouter,
  user: userRouter,
  webhooks: webhookRouter,
};

export type RpcRouter = typeof router;
export type RpcClient = RouterClient<RpcRouter>;
