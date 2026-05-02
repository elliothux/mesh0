import {
  apiKeySchema,
  createApiKeyInputSchema,
  createApiKeyResultSchema,
  renameApiKeyInputSchema,
  revokeApiKeyInputSchema,
} from "@mesh0/sdk/schema";
import { ApiKeyNotFoundError } from "@mesh0/services/api-key";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../context";

export const apiKeyRouter = {
  create: protectedProcedure
    .input(createApiKeyInputSchema)
    .output(createApiKeyResultSchema)
    .handler(({ context, input }) => {
      return context.services.apiKey.create({
        name: input.name,
        userId: context.user.id,
      });
    }),

  list: protectedProcedure
    .output(apiKeySchema.array())
    .handler(({ context }) => {
      return context.services.apiKey.list(context.user.id);
    }),

  revoke: protectedProcedure
    .input(revokeApiKeyInputSchema)
    .output(apiKeySchema)
    .handler(async ({ context, input }) => {
      try {
        return await context.services.apiKey.revoke({
          apiKeyId: input.apiKeyId,
          userId: context.user.id,
        });
      } catch (error) {
        if (error instanceof ApiKeyNotFoundError) {
          throw new ORPCError("NOT_FOUND", { message: error.message });
        }

        throw error;
      }
    }),

  rename: protectedProcedure
    .input(renameApiKeyInputSchema)
    .output(apiKeySchema)
    .handler(async ({ context, input }) => {
      try {
        return await context.services.apiKey.rename({
          apiKeyId: input.apiKeyId,
          name: input.name,
          userId: context.user.id,
        });
      } catch (error) {
        if (error instanceof ApiKeyNotFoundError) {
          throw new ORPCError("NOT_FOUND", { message: error.message });
        }

        throw error;
      }
    }),
};
