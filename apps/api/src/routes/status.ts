import { procedure } from "../context";

export const statusRouter = {
  list: procedure.handler(({ context }) => {
    return context.services.status.list();
  }),
};
