import { buildArtifactRef } from "@mesh0/adapters/utils";
import {
  agentRunInputSchema,
  agentRunRecordSchema,
  appendRunEventsInputSchema,
  appendRunEventsResultSchema,
  artifactRefSchema,
  completeRunInputSchema,
  runIdInputSchema,
  runnerRunConfigSchema,
  threadEventSchema,
  uploadRunArtifactInputSchema,
} from "@mesh0/sdk/schema";
import { RunNotFoundError } from "@mesh0/services/run";
import { ORPCError } from "@orpc/server";
import { procedure } from "../context";

export const runRouter = {
  appendEvents: procedure
    .input(appendRunEventsInputSchema)
    .output(appendRunEventsResultSchema)
    .handler(({ context, input }) => {
      return mapRunError(() => context.services.run.appendEvents(input));
    }),

  complete: procedure
    .input(completeRunInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return mapRunError(() => context.services.run.complete(input));
    }),

  create: procedure
    .input(agentRunInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return context.services.run.create(input);
    }),

  events: procedure
    .input(runIdInputSchema)
    .output(threadEventSchema.array())
    .handler(({ context, input }) => {
      return mapRunError(() => context.services.run.getEvents(input));
    }),

  get: procedure
    .input(runIdInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return mapRunError(() => context.services.run.get(input));
    }),

  input: procedure
    .input(runIdInputSchema)
    .output(runnerRunConfigSchema)
    .handler(({ context, input }) => {
      return mapRunError(() => context.services.run.getInput(input));
    }),

  uploadArtifact: procedure
    .input(uploadRunArtifactInputSchema)
    .output(artifactRefSchema)
    .handler(async ({ context, input }) => {
      await mapRunError(() => context.services.run.get({ runId: input.runId }));
      const object = await context.storage.put({
        body: input.file,
        contentType: input.file.type || undefined,
        path: input.path,
        runId: input.runId,
      });

      return buildArtifactRef(object);
    }),
};

async function mapRunError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      throw new ORPCError("NOT_FOUND", { message: error.message });
    }

    throw error;
  }
}
