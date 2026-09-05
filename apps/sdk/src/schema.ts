import { z } from "zod";

import type { ContentBlock as McpContentBlock } from "@modelcontextprotocol/sdk/types.js";

const nonEmptyStringSchema = z.string().min(1);
const toolApprovalModeSchema = z.enum(["auto", "prompt", "approve"]);
const mcpContentBlockSchema = z.custom<McpContentBlock>();
const urlStringSchema = z.string().url();
const httpUrlStringSchema = urlStringSchema.refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  },
  { message: "URL must use http or https" },
);
const workspacePathSchema = nonEmptyStringSchema.refine(
  (value) => !value.split("/").includes(".."),
  { message: "Workspace path must not contain .. segments" },
);

export const MAX_ARTIFACT_UPLOAD_BYTES = 100_000_000;

export const userSchema = z.strictObject({
  id: nonEmptyStringSchema,
  email: nonEmptyStringSchema,
  emailVerified: z.boolean(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  profilePictureUrl: z.string().nullable(),
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
  lastSignInAt: z.string().nullable(),
});

export const signOutResultSchema = z.strictObject({
  signedOut: z.boolean(),
});

export const apiKeySchema = z.strictObject({
  id: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  prefix: nonEmptyStringSchema,
  createdAt: nonEmptyStringSchema,
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

export const createApiKeyInputSchema = z.strictObject({
  name: z.string().trim().min(1),
});

export const createApiKeyResultSchema = z.strictObject({
  apiKey: apiKeySchema,
  key: nonEmptyStringSchema,
});

export const revokeApiKeyInputSchema = z.strictObject({
  apiKeyId: nonEmptyStringSchema,
});

export const renameApiKeyInputSchema = z.strictObject({
  apiKeyId: nonEmptyStringSchema,
  name: z.string().trim().min(1),
});

export const mcpServerToolConfigSchema = z.strictObject({
  approval_mode: toolApprovalModeSchema.optional(),
});

export const mcpServerEnvVarSchema = z.union([
  nonEmptyStringSchema,
  z.strictObject({
    name: nonEmptyStringSchema,
    source: z.enum(["local", "remote"]).optional(),
  }),
]);

const mcpServerSharedConfigSchema = z.strictObject({
  experimental_environment: nonEmptyStringSchema.optional(),
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
  supports_parallel_tool_calls: z.boolean().optional(),
  startup_timeout_sec: z.number().finite().optional(),
  tool_timeout_sec: z.number().finite().optional(),
  default_tools_approval_mode: toolApprovalModeSchema.optional(),
  enabled_tools: z.array(z.string()).optional(),
  disabled_tools: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  tools: z.record(nonEmptyStringSchema, mcpServerToolConfigSchema).optional(),
});

export const mcpStdioServerSchema = mcpServerSharedConfigSchema.extend({
  command: nonEmptyStringSchema,
  args: z.array(z.string()).optional(),
  env: z.record(nonEmptyStringSchema, z.string()).optional(),
  env_vars: z.array(mcpServerEnvVarSchema).optional(),
  cwd: nonEmptyStringSchema.optional(),
});

export const mcpStreamableHttpServerSchema = mcpServerSharedConfigSchema.extend(
  {
    url: httpUrlStringSchema,
    bearer_token_env_var: nonEmptyStringSchema.optional(),
    http_headers: z.record(nonEmptyStringSchema, z.string()).optional(),
    env_http_headers: z.record(nonEmptyStringSchema, z.string()).optional(),
    oauth_resource: nonEmptyStringSchema.optional(),
  },
);

export const mcpServerConfigSchema = z.union([
  mcpStdioServerSchema,
  mcpStreamableHttpServerSchema,
]);

export const mcpServersSchema = z.record(
  nonEmptyStringSchema,
  mcpServerConfigSchema,
);

export const gitSkillRefSchema = z.strictObject({
  source: z.literal("git"),
  url: nonEmptyStringSchema,
  ref: nonEmptyStringSchema,
  path: nonEmptyStringSchema.optional(),
  skill: nonEmptyStringSchema.optional(),
});

export const wellKnownSkillRefSchema = z.strictObject({
  source: z.literal("well-known"),
  url: nonEmptyStringSchema,
  skill: nonEmptyStringSchema.optional(),
});

export const skillRefSchema = z.union([
  gitSkillRefSchema,
  wellKnownSkillRefSchema,
]);

export const agentSystemPromptSchema = z.union([
  nonEmptyStringSchema,
  z.strictObject({ append: nonEmptyStringSchema }),
  z.strictObject({ replace: nonEmptyStringSchema }),
]);

export const agentPromptSchema = z.union([
  nonEmptyStringSchema,
  z.strictObject({ append: nonEmptyStringSchema }),
  z.strictObject({ replace: nonEmptyStringSchema }),
]);

export const gitWorkspaceSourceSchema = z.strictObject({
  type: z.literal("git"),
  url: nonEmptyStringSchema,
  ref: nonEmptyStringSchema.optional(),
});

export const runWorkspaceSourceSchema = z.strictObject({
  type: z.literal("run"),
  runId: nonEmptyStringSchema,
  path: workspacePathSchema.optional(),
});

export const workspaceSourceSchema = z.discriminatedUnion("type", [
  gitWorkspaceSourceSchema,
  runWorkspaceSourceSchema,
]);

export const workspaceRefSchema = z.strictObject({
  source: workspaceSourceSchema.optional(),
  ignorePatterns: z.array(nonEmptyStringSchema).optional(),
});

export const openAiEnvSchema = z
  .looseObject({
    OPENAI_API_KEY: nonEmptyStringSchema,
    OPENAI_BASE_URL: urlStringSchema,
    OPENAI_MODEL: nonEmptyStringSchema,
  })
  .catchall(z.string());

export const agentExecutionTargetSchema = z.enum(["auto", "cloudflare"]);

export const runNotificationSchema = z
  .strictObject({
    email: z.string().email().optional(),
    telegramBotToken: nonEmptyStringSchema.optional(),
  })
  .refine(
    ({ email, telegramBotToken }) =>
      email !== undefined || telegramBotToken !== undefined,
    { message: "At least one notification destination is required" },
  );

export const agentConfigSchema = z.strictObject({
  workspace: workspaceRefSchema.optional(),
  mcpServers: mcpServersSchema.optional(),
  skills: z.array(skillRefSchema).optional(),
  systemPrompt: agentSystemPromptSchema.optional(),
  env: openAiEnvSchema.optional(),
  prompt: agentPromptSchema.optional(),
});

export const agentRunInputSchema = agentConfigSchema.extend({
  env: openAiEnvSchema,
  prompt: nonEmptyStringSchema,
  target: agentExecutionTargetSchema.optional(),
  notifications: runNotificationSchema.optional(),
});

export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
]);

export const artifactRefSchema = z.strictObject({
  id: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  kind: z.enum(["file", "directory", "patch", "json", "text", "log"]),
  name: nonEmptyStringSchema.optional(),
  uri: nonEmptyStringSchema,
  contentType: nonEmptyStringSchema.optional(),
});

export const workspaceSnapshotSegmentSchema = z.strictObject({
  key: nonEmptyStringSchema,
  offset: z.number().int().min(0),
  length: z.number().int().min(0),
});

const workspaceSnapshotBaseEntrySchema = z.strictObject({
  mode: z.number().int().min(0),
  path: z.string(),
});

export const workspaceSnapshotDirectoryEntrySchema =
  workspaceSnapshotBaseEntrySchema.extend({
    type: z.literal("dir"),
  });

export const workspaceSnapshotFileEntrySchema =
  workspaceSnapshotBaseEntrySchema.extend({
    contentType: nonEmptyStringSchema.optional(),
    digest: nonEmptyStringSchema,
    segments: z.array(workspaceSnapshotSegmentSchema),
    size: z.number().int().min(0),
    type: z.literal("file"),
  });

export const workspaceSnapshotSymlinkEntrySchema =
  workspaceSnapshotBaseEntrySchema.extend({
    target: z.string(),
    type: z.literal("symlink"),
  });

export const workspaceSnapshotEntrySchema = z.discriminatedUnion("type", [
  workspaceSnapshotDirectoryEntrySchema,
  workspaceSnapshotFileEntrySchema,
  workspaceSnapshotSymlinkEntrySchema,
]);

export const workspaceSnapshotManifestSchema = z.strictObject({
  createdAt: nonEmptyStringSchema,
  entries: z.array(workspaceSnapshotEntrySchema),
  root: z.literal("workspace"),
  version: z.literal(1),
});

export const workspaceTreeEntrySchema = z.strictObject({
  contentType: nonEmptyStringSchema.optional(),
  mode: z.number().int().min(0).optional(),
  path: z.string(),
  size: z.number().int().min(0).optional(),
  target: z.string().optional(),
  type: z.enum(["dir", "file", "symlink"]),
});

export const workspaceTreeResultSchema = z.strictObject({
  entries: z.array(workspaceTreeEntrySchema),
});

export const agentRunRecordSchema = z.strictObject({
  id: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
  input: agentRunInputSchema,
  status: agentRunStatusSchema,
  artifacts: z.array(artifactRefSchema),
  createdAt: nonEmptyStringSchema,
  startedAt: nonEmptyStringSchema.optional(),
  finishedAt: nonEmptyStringSchema.optional(),
  lastMessage: z.string().optional(),
});

export const agentRecordSchema = z.strictObject({
  id: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  config: agentConfigSchema,
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
});

export const persistAgentInputSchema = z.strictObject({
  name: nonEmptyStringSchema,
  config: agentConfigSchema,
});

export const agentNameInputSchema = z.strictObject({
  name: nonEmptyStringSchema,
});

export const listAgentsInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
});

export const runAgentInputSchema = z.strictObject({
  name: nonEmptyStringSchema,
  config: agentConfigSchema.optional(),
  prompt: agentPromptSchema.optional(),
  target: agentExecutionTargetSchema.optional(),
  notifications: runNotificationSchema.optional(),
});

export const singleAgentDefinitionSchema = z
  .strictObject({
    agentName: nonEmptyStringSchema.optional(),
    config: agentConfigSchema.optional(),
    prompt: agentPromptSchema.optional(),
    target: agentExecutionTargetSchema.optional(),
    notifications: runNotificationSchema.optional(),
  })
  .refine(
    ({ agentName, config }) => agentName !== undefined || config !== undefined,
    { message: "agentName or config is required" },
  );

export const agentWorkflowModeSchema = z.enum(["all", "pipe"]);

export const agentWorkflowDefinitionSchema = z.strictObject({
  mode: agentWorkflowModeSchema,
  agents: z.array(singleAgentDefinitionSchema).min(1),
  // oxlint-disable-next-line unicorn/no-thenable -- workflow definitions expose the public then/catch DSL.
  then: singleAgentDefinitionSchema.optional(),
  catch: singleAgentDefinitionSchema.optional(),
});

export const agentDefinitionSchema = z.union([
  singleAgentDefinitionSchema,
  agentWorkflowDefinitionSchema,
]);

export const cronIdInputSchema = z.strictObject({
  cronId: nonEmptyStringSchema,
});

export const createCronInputSchema = z.strictObject({
  name: nonEmptyStringSchema,
  expression: nonEmptyStringSchema,
  invalidateAt: nonEmptyStringSchema.optional(),
  definition: agentDefinitionSchema,
});

export const listCronsInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
});

export const cronRecordSchema = z.strictObject({
  id: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  expression: nonEmptyStringSchema,
  invalidateAt: z.string().nullable(),
  definition: agentDefinitionSchema,
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
  lastTriggeredAt: z.string().nullable(),
  lastRunId: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

export const webhookIdInputSchema = z.strictObject({
  webhookId: nonEmptyStringSchema,
});

export const webhookRouteNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message:
      "Webhook names may contain letters, numbers, underscores, and hyphens",
  });

export const createWebhookInputSchema = z.strictObject({
  name: webhookRouteNameSchema,
  definition: agentDefinitionSchema,
});

export const listWebhooksInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
});

export const webhookRecordSchema = z.strictObject({
  id: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
  uid: nonEmptyStringSchema,
  name: webhookRouteNameSchema,
  path: nonEmptyStringSchema,
  definition: agentDefinitionSchema,
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
  deletedAt: z.string().nullable(),
});

export const webhookTriggerPayloadSchema = z.strictObject({
  config: agentConfigSchema.optional(),
  prompt: agentPromptSchema.optional(),
});

export const threadEventTypeSchema = z.enum([
  "thread.started",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "item.started",
  "item.updated",
  "item.completed",
  "error",
]);

export const threadItemTypeSchema = z.enum([
  "agent_message",
  "reasoning",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "web_search",
  "todo_list",
  "error",
]);

const threadItemStatusSchema = z.enum(["in_progress", "completed", "failed"]);

const usageSchema = z.strictObject({
  input_tokens: z.number().finite(),
  cached_input_tokens: z.number().finite(),
  output_tokens: z.number().finite(),
  reasoning_output_tokens: z.number().finite().default(0),
});

const threadErrorSchema = z.strictObject({
  message: z.string(),
});

const agentMessageItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("agent_message"),
  text: z.string(),
});

const reasoningItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("reasoning"),
  text: z.string(),
});

const commandExecutionItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("command_execution"),
  command: z.string(),
  aggregated_output: z.string(),
  exit_code: z.number().optional(),
  status: z.enum(["in_progress", "completed", "failed"]),
});

const fileChangeItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("file_change"),
  changes: z.array(
    z.strictObject({
      path: nonEmptyStringSchema,
      kind: z.enum(["add", "delete", "update"]),
    }),
  ),
  status: z.enum(["completed", "failed"]),
});

const mcpToolCallItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("mcp_tool_call"),
  server: nonEmptyStringSchema,
  tool: nonEmptyStringSchema,
  arguments: z.unknown(),
  result: z
    .strictObject({
      content: z.array(mcpContentBlockSchema),
      structured_content: z.unknown(),
    })
    .optional(),
  error: threadErrorSchema.optional(),
  status: z.enum(["in_progress", "completed", "failed"]),
});

const webSearchItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("web_search"),
  query: z.string(),
});

const todoListItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("todo_list"),
  items: z.array(
    z.strictObject({
      text: z.string(),
      completed: z.boolean(),
    }),
  ),
});

const errorItemSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: z.literal("error"),
  message: z.string(),
});

export const threadItemSchema = z.discriminatedUnion("type", [
  agentMessageItemSchema,
  reasoningItemSchema,
  commandExecutionItemSchema,
  fileChangeItemSchema,
  mcpToolCallItemSchema,
  webSearchItemSchema,
  todoListItemSchema,
  errorItemSchema,
]);

export const threadEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("thread.started"),
    thread_id: nonEmptyStringSchema,
  }),
  z.strictObject({ type: z.literal("turn.started") }),
  z.strictObject({
    type: z.literal("turn.completed"),
    usage: usageSchema,
  }),
  z.strictObject({
    type: z.literal("turn.failed"),
    error: threadErrorSchema,
  }),
  z.strictObject({
    type: z.literal("item.started"),
    item: threadItemSchema,
  }),
  z.strictObject({
    type: z.literal("item.updated"),
    item: threadItemSchema,
  }),
  z.strictObject({
    type: z.literal("item.completed"),
    item: threadItemSchema,
  }),
  z.strictObject({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

export const threadEventsPayloadSchema = z.union([
  threadEventSchema,
  z.array(threadEventSchema),
]);

export const agentRunEventRecordSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  runId: nonEmptyStringSchema,
  eventType: threadEventTypeSchema,
  itemId: nonEmptyStringSchema.optional(),
  itemStatus: threadItemStatusSchema.optional(),
  itemType: threadItemTypeSchema.optional(),
  event: threadEventSchema,
  createdAt: nonEmptyStringSchema,
});

export const runIdInputSchema = z.strictObject({
  runId: nonEmptyStringSchema,
});

export const listRunsInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
});

export const runEventRecordsInputSchema = z.strictObject({
  afterEventId: z.number().int().min(0).optional(),
  eventType: threadEventTypeSchema.optional(),
  limit: z.number().int().min(1).max(500).default(100),
  runId: nonEmptyStringSchema.optional(),
});

export const liveRunEventsInputSchema = runIdInputSchema.extend({
  afterEventId: z.number().int().min(0).optional(),
  eventType: threadEventTypeSchema.optional(),
});

export const runnerRunConfigSchema = z.strictObject({
  runId: nonEmptyStringSchema.optional(),
  prompt: nonEmptyStringSchema,
  workspace: workspaceRefSchema.optional(),
  systemPrompt: agentSystemPromptSchema.optional(),
  baseInstructions: nonEmptyStringSchema.optional(),
  mcpServers: mcpServersSchema.optional(),
  skills: z.array(skillRefSchema).optional(),
  env: openAiEnvSchema,
  sandbox: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .optional(),
  approvalPolicy: z
    .enum(["never", "on-request", "on-failure", "untrusted"])
    .optional(),
});

export const runCompletionSchema = z.strictObject({
  status: z.enum(["completed", "failed", "canceled"]),
  artifacts: z.array(artifactRefSchema).optional(),
  lastMessage: z.string().optional(),
});

export const appendRunEventsInputSchema = runIdInputSchema.extend({
  events: threadEventsPayloadSchema,
});

export const appendRunEventsResultSchema = z.strictObject({
  appended: z.number().int().min(0),
});

export const completeRunInputSchema = runIdInputSchema.extend({
  completion: runCompletionSchema,
});

const artifactBlobSchema = z.instanceof(Blob);

export const uploadRunArtifactInputSchema = runIdInputSchema
  .extend({
    file: artifactBlobSchema,
    path: nonEmptyStringSchema,
  })
  .superRefine(({ file }, context) => {
    if (file.size > MAX_ARTIFACT_UPLOAD_BYTES) {
      context.addIssue({
        code: "too_big",
        maximum: MAX_ARTIFACT_UPLOAD_BYTES,
        message: "Artifact upload must be 100MB or smaller",
        origin: "file",
      });
    }
  });

export const downloadRunArtifactInputSchema = runIdInputSchema.extend({
  path: nonEmptyStringSchema,
});
