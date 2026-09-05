import {
  createWebhookInputSchema,
  listWebhooksInputSchema,
  webhookIdInputSchema,
  webhookRecordSchema,
} from "@mesh0/sdk/schema";
import { WebhookNotFoundError } from "@mesh0/services/webhook";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../context";

export const webhookRouter = {
  create: protectedProcedure
    .input(createWebhookInputSchema)
    .output(webhookRecordSchema)
    .handler(({ context, input }) => {
      return context.services.webhook.create({
        definition: input.definition,
        name: input.name,
        userId: context.user.id,
      });
    }),

  delete: protectedProcedure
    .input(webhookIdInputSchema)
    .output(webhookRecordSchema)
    .handler(({ context, input }) => {
      return mapWebhookError(() =>
        context.services.webhook.delete({
          userId: context.user.id,
          webhookId: input.webhookId,
        }),
      );
    }),

  list: protectedProcedure
    .input(listWebhooksInputSchema)
    .output(webhookRecordSchema.array())
    .handler(({ context, input }) => {
      return context.services.webhook.list({
        limit: input.limit,
        userId: context.user.id,
      });
    }),
};

async function mapWebhookError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof WebhookNotFoundError) {
      throw new ORPCError("NOT_FOUND", { message: error.message });
    }

    throw error;
  }
}
