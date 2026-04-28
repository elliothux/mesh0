import type { agentRunEvents, agentRuns, appStatus } from "./schema";

export type AppStatus = typeof appStatus.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
