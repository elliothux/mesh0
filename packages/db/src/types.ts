import type {
  agentRunEvents,
  agentRuns,
  apiKeys,
  appStatus,
  users,
} from "./schema";

export type AppStatus = typeof appStatus.$inferSelect;
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
