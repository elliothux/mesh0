import type { RouterClient } from "@orpc/server";
import { runRouter } from "./run";
import { statusRouter } from "./status";

export const router = {
  runs: runRouter,
  status: statusRouter,
};

export type RpcRouter = typeof router;
export type RpcClient = RouterClient<RpcRouter>;
