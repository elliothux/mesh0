import { userSchema } from "@mesh0/sdk/schema";
import { serializeUser } from "../auth";
import { protectedProcedure } from "../context";

export const userRouter = {
  me: protectedProcedure.output(userSchema).handler(({ context }) => {
    return serializeUser(context.user);
  }),
};
