import {
  createCronInputSchema,
  cronIdInputSchema,
  cronRecordSchema,
  listCronsInputSchema,
} from "@mesh0/sdk/schema";
import { CronNotFoundError } from "@mesh0/services/cron";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../context";

export const cronRouter = {
  create: protectedProcedure
    .input(createCronInputSchema)
    .output(cronRecordSchema)
    .handler(({ context, input }) => {
      return context.services.cron.create({
        definition: input.definition,
        expression: input.expression,
        invalidateAt: input.invalidateAt,
        name: input.name,
        userId: context.user.id,
      });
    }),

  delete: protectedProcedure
    .input(cronIdInputSchema)
    .output(cronRecordSchema)
    .handler(({ context, input }) => {
      return mapCronError(() =>
        context.services.cron.delete({
          cronId: input.cronId,
          userId: context.user.id,
        }),
      );
    }),

  list: protectedProcedure
    .input(listCronsInputSchema)
    .output(cronRecordSchema.array())
    .handler(({ context, input }) => {
      return context.services.cron.list({
        limit: input.limit,
        userId: context.user.id,
      });
    }),
};

async function mapCronError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CronNotFoundError) {
      throw new ORPCError("NOT_FOUND", { message: error.message });
    }

    throw error;
  }
}
