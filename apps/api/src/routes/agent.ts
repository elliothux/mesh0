import {
  agentNameInputSchema,
  agentRecordSchema,
  agentRunRecordSchema,
  listAgentsInputSchema,
  persistAgentInputSchema,
  runAgentInputSchema,
} from "@mesh0/sdk/schema";
import { AgentNotFoundError, AgentRunConfigError } from "@mesh0/services/agent";
import { RunNotificationConfigError } from "@mesh0/services/run";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../context";

export const agentRouter = {
  delete: protectedProcedure
    .input(agentNameInputSchema)
    .output(agentRecordSchema)
    .handler(({ context, input }) => {
      return mapAgentError(() =>
        context.services.agent.delete({
          name: input.name,
          userId: context.user.id,
        }),
      );
    }),

  get: protectedProcedure
    .input(agentNameInputSchema)
    .output(agentRecordSchema)
    .handler(({ context, input }) => {
      return mapAgentError(() =>
        context.services.agent.get({
          name: input.name,
          userId: context.user.id,
        }),
      );
    }),

  list: protectedProcedure
    .input(listAgentsInputSchema)
    .output(agentRecordSchema.array())
    .handler(({ context, input }) => {
      return context.services.agent.list({
        limit: input.limit,
        userId: context.user.id,
      });
    }),

  persist: protectedProcedure
    .input(persistAgentInputSchema)
    .output(agentRecordSchema)
    .handler(({ context, input }) => {
      return context.services.agent.upsert({
        config: input.config,
        name: input.name,
        userId: context.user.id,
      });
    }),

  run: protectedProcedure
    .input(runAgentInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ context, input }) => {
      return mapAgentError(async () => {
        const runInput = await context.services.agent.buildRunInput({
          agentName: input.name,
          config: input.config,
          notifications: input.notifications,
          prompt: input.prompt,
          target: input.target,
          userId: context.user.id,
        });

        return context.services.run.create(context.user.id, runInput);
      });
    }),
};

async function mapAgentError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AgentNotFoundError) {
      throw new ORPCError("NOT_FOUND", { message: error.message });
    }

    if (
      error instanceof AgentRunConfigError ||
      error instanceof RunNotificationConfigError
    ) {
      throw new ORPCError("BAD_REQUEST", { message: error.message });
    }

    throw error;
  }
}
