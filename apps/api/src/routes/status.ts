import { appStatus } from "@mesh0/db/schema";
import { procedure } from "../context";

export const statusRouter = {
  list: procedure.handler(({ context }) => {
    return context.db.select().from(appStatus);
  }),
};
