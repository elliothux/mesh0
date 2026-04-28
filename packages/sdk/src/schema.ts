import { z } from "zod";

import type { ContentBlock as McpContentBlock } from "@modelcontextprotocol/sdk/types.js";

const nonEmptyStringSchema = z.string().min(1);
const urlStringSchema = z.string().url();
const toolApprovalModeSchema = z.enum(["auto", "prompt", "approve"]);
const mcpContentBlockSchema = z.custom<McpContentBlock>();

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
    url: nonEmptyStringSchema,
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

export const workspaceRefSchema = z.strictObject({
  git: z
    .strictObject({
      url: nonEmptyStringSchema,
      ref: nonEmptyStringSchema.optional(),
    })
    .optional(),
});

export const wireApiSchema = z.enum(["chat", "responses"]);

export const agentRunInputSchema = z
  .strictObject({
    workspace: workspaceRefSchema.optional(),
    mcpServers: mcpServersSchema.optional(),
    skills: z.array(skillRefSchema).optional(),
    systemPrompt: agentSystemPromptSchema.optional(),
    prompt: nonEmptyStringSchema,
    baseUrl: urlStringSchema.optional(),
    model: nonEmptyStringSchema.optional(),
    modelProvider: nonEmptyStringSchema.optional(),
    wireApi: wireApiSchema.optional(),
  })
  .superRefine(({ baseUrl, wireApi }, context) => {
    if (wireApi !== undefined && baseUrl === undefined) {
      context.addIssue({
        code: "custom",
        message: "wireApi requires baseUrl",
        path: ["wireApi"],
      });
    }
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
  uri: nonEmptyStringSchema,
  contentType: nonEmptyStringSchema.optional(),
});

export const agentRunRecordSchema = z.strictObject({
  id: nonEmptyStringSchema,
  input: agentRunInputSchema,
  status: agentRunStatusSchema,
  artifacts: z.array(artifactRefSchema),
  createdAt: nonEmptyStringSchema,
  startedAt: nonEmptyStringSchema.optional(),
  finishedAt: nonEmptyStringSchema.optional(),
  lastMessage: z.string().optional(),
});

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

export const runIdInputSchema = z.strictObject({
  runId: nonEmptyStringSchema,
});

export const modelProviderConfigSchema = z.strictObject({
  name: nonEmptyStringSchema,
  env_key: nonEmptyStringSchema,
  base_url: nonEmptyStringSchema,
  wire_api: wireApiSchema.optional(),
});

export const runnerRunConfigSchema = z.strictObject({
  runId: nonEmptyStringSchema.optional(),
  prompt: nonEmptyStringSchema,
  systemPrompt: agentSystemPromptSchema.optional(),
  baseInstructions: nonEmptyStringSchema.optional(),
  mcpServers: mcpServersSchema.optional(),
  skills: z.array(skillRefSchema).optional(),
  model: nonEmptyStringSchema.optional(),
  modelProvider: nonEmptyStringSchema.optional(),
  modelProviders: z
    .record(nonEmptyStringSchema, modelProviderConfigSchema)
    .optional(),
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
