import type {
  agentRunEvents,
  agentRuns,
  agents,
  apiKeys,
  appStatus,
  crons,
  users,
  webhooks,
} from "./schema";

export type AppStatus = typeof appStatus.$inferSelect;
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Cron = typeof crons.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
