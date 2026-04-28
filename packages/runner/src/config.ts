import { join } from "node:path";

import { runnerRunConfigSchema } from "@mesh0/sdk/schema";

import type { AgentSystemPrompt, RunnerRunConfig } from "@mesh0/sdk/types";

const DEFAULT_SYSTEM_PROMPT = [
  "You are Mesh0 Agent, a general-purpose task runner.",
  "Use the provided workspace, MCP servers, and skills to complete the user's task.",
  "Emit raw runtime events and preserve artifacts for the control plane.",
].join("\n");

export function parseRunConfig(value: unknown): RunnerRunConfig {
  return runnerRunConfigSchema.parse(value);
}

export function resolveSystemPrompt(
  systemPrompt: AgentSystemPrompt | undefined,
) {
  if (systemPrompt === undefined) {
    return DEFAULT_SYSTEM_PROMPT;
  }

  if (typeof systemPrompt === "string") {
    return `${DEFAULT_SYSTEM_PROMPT}\n\n${systemPrompt}`;
  }

  if ("replace" in systemPrompt) {
    return systemPrompt.replace;
  }

  return `${DEFAULT_SYSTEM_PROMPT}\n\n${systemPrompt.append}`;
}

export function renderConfigToml(
  config: RunnerRunConfig,
  baseInstructions: string,
) {
  const lines: string[] = [
    `base_instructions = ${tomlValue(baseInstructions)}`,
  ];

  if (config.model !== undefined) {
    lines.push(`model = ${tomlValue(config.model)}`);
  }

  if (config.modelProvider !== undefined) {
    lines.push(`model_provider = ${tomlValue(config.modelProvider)}`);
  }

  appendTables(lines, "model_providers", config.modelProviders);
  appendTables(lines, "mcp_servers", config.mcpServers);

  return `${lines.join("\n")}\n`;
}

export function buildPrompt({
  config,
  runId,
  runtimeDir,
  workspace,
}: {
  config: RunnerRunConfig;
  runId: string;
  runtimeDir: string;
  workspace: string;
}) {
  const context = {
    currentDate: new Date().toISOString().slice(0, 10),
    cwd: workspace,
    mcpServers: Object.keys(config.mcpServers ?? {}),
    runId,
    skills: config.skills ?? [],
    skillsRoot: join(runtimeDir, "skills"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  return `<mesh0_context>\n${JSON.stringify(context, null, 2)}\n</mesh0_context>\n\n${config.prompt}`;
}

function appendTables(
  lines: string[],
  tableName: string,
  tables: Record<string, object> | undefined,
) {
  if (tables === undefined) {
    return;
  }

  for (const [name, table] of Object.entries(tables).sort()) {
    lines.push("", `[${tableName}.${tomlKey(name)}]`);
    for (const [key, value] of Object.entries(table).sort()) {
      if (value !== undefined) {
        lines.push(`${tomlKey(key)} = ${tomlValue(value)}`);
      }
    }
  }
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(tomlValue).join(", ")}]`;
  }

  if (isTomlTable(value)) {
    return `{ ${Object.entries(value)
      .sort()
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`)
      .join(", ")} }`;
  }

  throw new Error("Unsupported TOML config value");
}

function isTomlTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tomlKey(key: string) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}
