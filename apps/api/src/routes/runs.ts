import {
  agentRunInputSchema,
  agentRunRecordSchema,
  appendRunEventsInputSchema,
  appendRunEventsResultSchema,
  completeRunInputSchema,
  runIdInputSchema,
  runnerRunConfigSchema,
  threadEventSchema,
} from "@mesh0/sdk/schema";
import { procedure } from "../context";
import {
  appendRunEvents,
  completeRun,
  createRun,
  getRun,
  getRunEvents,
  getRunInput,
} from "../runs";

export const runsRouter = {
  appendEvents: procedure
    .input(appendRunEventsInputSchema)
    .output(appendRunEventsResultSchema)
    .handler(({ input }) => {
      return appendRunEvents(input);
    }),

  complete: procedure
    .input(completeRunInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ input }) => {
      return completeRun(input);
    }),

  create: procedure
    .input(agentRunInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ input }) => {
      return createRun(input);
    }),
  events: procedure
    .input(runIdInputSchema)
    .output(threadEventSchema.array())
    .handler(({ input }) => {
      return getRunEvents(input);
    }),
  get: procedure
    .input(runIdInputSchema)
    .output(agentRunRecordSchema)
    .handler(({ input }) => {
      return getRun(input);
    }),
  input: procedure
    .input(runIdInputSchema)
    .output(runnerRunConfigSchema)
    .handler(({ input }) => {
      return getRunInput(input);
    }),
};
