import type { z } from "zod";

import type {
  agentRunInputSchema,
  agentRunRecordSchema,
  agentRunStatusSchema,
  agentSystemPromptSchema,
  appendRunEventsInputSchema,
  appendRunEventsResultSchema,
  artifactRefSchema,
  completeRunInputSchema,
  gitSkillRefSchema,
  mcpServerConfigSchema,
  mcpServerEnvVarSchema,
  mcpServerToolConfigSchema,
  mcpServersSchema,
  mcpStdioServerSchema,
  mcpStreamableHttpServerSchema,
  modelProviderConfigSchema,
  runIdInputSchema,
  runnerRunConfigSchema,
  skillRefSchema,
  wellKnownSkillRefSchema,
  wireApiSchema,
  workspaceRefSchema,
} from "./schema";

export type McpServers = z.infer<typeof mcpServersSchema>;

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

export type McpStdioServer = z.infer<typeof mcpStdioServerSchema>;

export type McpStreamableHttpServer = z.infer<
  typeof mcpStreamableHttpServerSchema
>;

export type McpServerSharedConfig = Omit<
  McpServerConfig,
  | "command"
  | "args"
  | "env"
  | "env_vars"
  | "cwd"
  | "url"
  | "bearer_token_env_var"
  | "http_headers"
  | "env_http_headers"
  | "oauth_resource"
>;

export type McpServerEnvVar = z.infer<typeof mcpServerEnvVarSchema>;

export type McpServerToolConfig = z.infer<typeof mcpServerToolConfigSchema>;

export type SkillRef = z.infer<typeof skillRefSchema>;

export type GitSkillRef = z.infer<typeof gitSkillRefSchema>;

export type WellKnownSkillRef = z.infer<typeof wellKnownSkillRefSchema>;

export type AgentSystemPrompt = z.infer<typeof agentSystemPromptSchema>;

export type WorkspaceRef = z.infer<typeof workspaceRefSchema>;

export type AgentRunInput = z.infer<typeof agentRunInputSchema>;

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;

export type RunnerRunConfig = z.infer<typeof runnerRunConfigSchema>;

export type WireApi = z.infer<typeof wireApiSchema>;

export type RunIdInput = z.infer<typeof runIdInputSchema>;

export type AppendRunEventsInput = z.infer<typeof appendRunEventsInputSchema>;

export type AppendRunEventsResult = z.infer<typeof appendRunEventsResultSchema>;

export type CompleteRunInput = z.infer<typeof completeRunInputSchema>;
