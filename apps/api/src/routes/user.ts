import {
  authenticatedUserSchema,
  authenticateUserInputSchema,
  userAuthorizationUrlInputSchema,
  userAuthorizationUrlResultSchema,
  userSchema,
} from "@mesh0/sdk/schema";

import { defaultRedirectUri, mapWorkOSUser, serializeUser } from "../auth";
import { procedure, protectedProcedure } from "../context";

export const userRouter = {
  authenticate: procedure
    .input(authenticateUserInputSchema)
    .output(authenticatedUserSchema)
    .handler(async ({ context, input }) => {
      const auth = await context.auth.authenticateWithCode({
        code: input.code,
        ipAddress: context.request.headers.get("CF-Connecting-IP") ?? undefined,
        userAgent: context.request.headers.get("User-Agent") ?? undefined,
      });
      const user = await context.services.user.upsert(mapWorkOSUser(auth.user));

      return {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: serializeUser(user),
      };
    }),

  authorizationUrl: procedure
    .input(userAuthorizationUrlInputSchema)
    .output(userAuthorizationUrlResultSchema)
    .handler(({ context, input }) => {
      return {
        authorizationUrl: context.auth.getAuthorizationUrl({
          redirectUri: input.redirectUri ?? defaultRedirectUri(context.request),
          state: input.state,
        }),
      };
    }),

  me: protectedProcedure.output(userSchema).handler(({ context }) => {
    return serializeUser(context.user);
  }),
};
