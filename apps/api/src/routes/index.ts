import type { RouterClient } from "@orpc/server";
import { runRouter } from "./run";
import { statusRouter } from "./status";
import { userRouter } from "./user";

export const router = {
  runs: runRouter,
  status: statusRouter,
  user: userRouter,
};

export type RpcRouter = typeof router;
export type RpcClient = RouterClient<RpcRouter>;
