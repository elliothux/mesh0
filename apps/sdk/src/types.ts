import type { z } from "zod";

import type {
  agentRunEventRecordSchema,
  agentRunInputSchema,
  agentRunRecordSchema,
  agentRunStatusSchema,
  agentSystemPromptSchema,
  apiKeySchema,
  appendRunEventsInputSchema,
  appendRunEventsResultSchema,
  artifactRefSchema,
  completeRunInputSchema,
  createApiKeyInputSchema,
  createApiKeyResultSchema,
  downloadRunArtifactInputSchema,
  gitSkillRefSchema,
  gitWorkspaceSourceSchema,
  listRunsInputSchema,
  mcpServerConfigSchema,
  mcpServerEnvVarSchema,
  mcpServerToolConfigSchema,
  mcpServersSchema,
  mcpStdioServerSchema,
  mcpStreamableHttpServerSchema,
  openAiEnvSchema,
  renameApiKeyInputSchema,
  revokeApiKeyInputSchema,
  runEventRecordsInputSchema,
  runIdInputSchema,
  runWorkspaceSourceSchema,
  runnerRunConfigSchema,
  signOutResultSchema,
  skillRefSchema,
  uploadRunArtifactInputSchema,
  userSchema,
  wellKnownSkillRefSchema,
  workspaceRefSchema,
  workspaceSnapshotEntrySchema,
  workspaceSnapshotFileEntrySchema,
  workspaceSnapshotManifestSchema,
  workspaceSnapshotSegmentSchema,
  workspaceSourceSchema,
  workspaceTreeEntrySchema,
  workspaceTreeResultSchema,
} from "./schema";

export type User = z.infer<typeof userSchema>;

export type SignOutResult = z.infer<typeof signOutResultSchema>;

export type ApiKey = z.infer<typeof apiKeySchema>;

export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

export type CreateApiKeyResult = z.infer<typeof createApiKeyResultSchema>;

export type RevokeApiKeyInput = z.infer<typeof revokeApiKeyInputSchema>;

export type RenameApiKeyInput = z.infer<typeof renameApiKeyInputSchema>;

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

export type WorkspaceSource = z.infer<typeof workspaceSourceSchema>;

export type GitWorkspaceSource = z.infer<typeof gitWorkspaceSourceSchema>;

export type RunWorkspaceSource = z.infer<typeof runWorkspaceSourceSchema>;

export type AgentRunInput = z.infer<typeof agentRunInputSchema>;

export type OpenAiEnv = z.infer<typeof openAiEnvSchema>;

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;

export type AgentRunEventRecord = z.infer<typeof agentRunEventRecordSchema>;

export type ListRunsInput = z.infer<typeof listRunsInputSchema>;

export type RunEventRecordsInput = z.infer<typeof runEventRecordsInputSchema>;

export type RunnerRunConfig = z.infer<typeof runnerRunConfigSchema>;

export type RunIdInput = z.infer<typeof runIdInputSchema>;

export type AppendRunEventsInput = z.infer<typeof appendRunEventsInputSchema>;

export type AppendRunEventsResult = z.infer<typeof appendRunEventsResultSchema>;

export type CompleteRunInput = z.infer<typeof completeRunInputSchema>;

export type UploadRunArtifactInput = z.infer<
  typeof uploadRunArtifactInputSchema
>;

export type DownloadRunArtifactInput = z.infer<
  typeof downloadRunArtifactInputSchema
>;

export type WorkspaceSnapshotSegment = z.infer<
  typeof workspaceSnapshotSegmentSchema
>;

export type WorkspaceSnapshotEntry = z.infer<
  typeof workspaceSnapshotEntrySchema
>;

export type WorkspaceSnapshotFileEntry = z.infer<
  typeof workspaceSnapshotFileEntrySchema
>;

export type WorkspaceSnapshotManifest = z.infer<
  typeof workspaceSnapshotManifestSchema
>;

export type WorkspaceTreeEntry = z.infer<typeof workspaceTreeEntrySchema>;

export type WorkspaceTreeResult = z.infer<typeof workspaceTreeResultSchema>;
