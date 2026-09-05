import { buildArtifactRef } from "@mesh0/adapters/utils";
import {
  agentRunEventRecordSchema,
  agentRunInputSchema,
  agentRunRecordSchema,
  appendRunEventsInputSchema,
  appendRunEventsResultSchema,
  artifactRefSchema,
  completeRunInputSchema,
  listRunsInputSchema,
  liveRunEventsInputSchema,
  runEventRecordsInputSchema,
  runIdInputSchema,
  runnerRunConfigSchema,
  threadEventSchema,
  uploadRunArtifactInputSchema,
} from "@mesh0/sdk/schema";
import {
  RunNotFoundError,
  RunNotificationConfigError,
} from "@mesh0/services/run";
import { ORPCError, eventIterator } from "@orpc/server";
import {
  authenticateContextRunner,
  procedure,
  protectedProcedure,
} from "../context";

export const runRouter = {
  appendEvents: procedure
    .input(appendRunEventsInputSchema)
    .output(appendRunEventsResultSchema)
    .handler(({ context, input }) => {
      return mapRunError(async () => {
        await authenticateContextRunner(context, input.runId);
        return context.services.run.appendEvents(input);
      });
    }),

  complete: procedure
    .input(completeRunInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return mapRunError(async () => {
        await authenticateContextRunner(context, input.runId);
        return context.services.run.complete(input);
      });
    }),

  create: protectedProcedure
    .input(agentRunInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return mapRunError(() =>
        context.services.run.create(context.user.id, input),
      );
    }),

  events: protectedProcedure
    .input(runIdInputSchema)
    .output(threadEventSchema.array())
    .handler(({ context, input }) => {
      return mapRunError(() =>
        context.services.run.events({
          runId: input.runId,
          userId: context.user.id,
        }),
      );
    }),

  eventRecords: protectedProcedure
    .input(runEventRecordsInputSchema)
    .output(agentRunEventRecordSchema.array())
    .handler(({ context, input }) => {
      return mapRunError(() =>
        context.services.run.eventRecords({
          afterEventId: input.afterEventId,
          eventType: input.eventType,
          limit: input.limit,
          runId: input.runId,
          userId: context.user.id,
        }),
      );
    }),

  liveEvents: protectedProcedure
    .input(liveRunEventsInputSchema)
    .output(eventIterator(agentRunEventRecordSchema))
    .handler(({ context, input }) => {
      return mapRunError(() =>
        context.services.run.liveEventRecords({
          afterEventId: input.afterEventId,
          eventType: input.eventType,
          runId: input.runId,
          signal: context.request.signal,
          userId: context.user.id,
        }),
      );
    }),

  get: protectedProcedure
    .input(runIdInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return mapRunError(() =>
        context.services.run.get({
          runId: input.runId,
          userId: context.user.id,
        }),
      );
    }),

  list: protectedProcedure
    .input(listRunsInputSchema)
    .output(agentRunRecordSchema.array())
    .handler(({ context, input }) => {
      return context.services.run.list({
        limit: input.limit,
        userId: context.user.id,
      });
    }),

  input: procedure
    .input(runIdInputSchema)
    .output(runnerRunConfigSchema)
    .handler(({ context, input }) => {
      return mapRunError(async () => {
        await authenticateContextRunner(context, input.runId);
        return context.services.run.getInput(input);
      });
    }),

  uploadArtifact: procedure
    .input(uploadRunArtifactInputSchema)
    .output(artifactRefSchema)
    .handler(({ context, input }) => {
      return mapRunError(async () => {
        await authenticateContextRunner(context, input.runId);
        const object = await context.storage.put({
          body: input.file,
          contentType: input.file.type || undefined,
          path: input.path,
          runId: input.runId,
        });

        return buildArtifactRef(object);
      });
    }),
};

async function mapRunError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof RunNotFoundError ||
      error instanceof RunNotificationConfigError
    ) {
      throw new ORPCError(
        error instanceof RunNotFoundError ? "NOT_FOUND" : "BAD_REQUEST",
        { message: error.message },
      );
    }

    throw error;
  }
}
