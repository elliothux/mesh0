import { signOutResultSchema, userSchema } from "@mesh0/sdk/schema";
import { expireAuthCookies, serializeUser } from "../auth";
import { procedure, protectedProcedure } from "../context";

export const userRouter = {
  me: protectedProcedure.output(userSchema).handler(({ context }) => {
    return serializeUser(context.user);
  }),

  signOut: procedure
    .output(signOutResultSchema)
    .handler(async ({ context }) => {
      const { sessionId } = await context.auth.authenticateRequest(
        context.request,
      );
      await context.auth.revokeSession({ sessionId });

      expireAuthCookies({
        env: context.env,
        headers: context.responseHeaders,
        request: context.request,
      });

      return { signedOut: true };
    }),
};
