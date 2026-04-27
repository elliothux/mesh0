import { appStatus } from "@mesh0/db/schema";
import { os } from "@orpc/server";

import type { Db } from "@mesh0/db";
import type { RouterClient } from "@orpc/server";

interface Context {
  db: Db;
}

const procedure = os.$context<Context>();

export const appRouter = {
  status: {
    list: procedure.handler(({ context }) => {
      return context.db.select().from(appStatus);
    }),
  },
};

export type AppRouter = typeof appRouter;
export type AppClient = RouterClient<AppRouter>;
