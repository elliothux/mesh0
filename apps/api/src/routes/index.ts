import type { RouterClient } from "@orpc/server";
import { runsRouter } from "./runs";
import { statusRouter } from "./status";

export const router = {
  runs: runsRouter,
  status: statusRouter,
};

export type RpcRouter = typeof router;
export type RpcClient = RouterClient<RpcRouter>;
