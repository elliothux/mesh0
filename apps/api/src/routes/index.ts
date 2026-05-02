import type { RouterClient } from "@orpc/server";
import { apiKeyRouter } from "./api-key";
import { runRouter } from "./run";
import { statusRouter } from "./status";
import { userRouter } from "./user";

export const router = {
  apiKeys: apiKeyRouter,
  runs: runRouter,
  status: statusRouter,
  user: userRouter,
};

export type RpcRouter = typeof router;
export type RpcClient = RouterClient<RpcRouter>;
