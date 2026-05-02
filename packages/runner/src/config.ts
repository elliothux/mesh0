import { join } from "node:path";

import { runnerRunConfigSchema } from "@mesh0/sdk/schema";

import type { RunnerRunConfig } from "@mesh0/sdk/types";
import type { PreparedSkill } from "./skills";

const MODEL_PROVIDER = "mesh0-openai";

export function parseRunConfig(value: unknown): RunnerRunConfig {
  return runnerRunConfigSchema.parse(value);
}

export function renderConfigToml(
  config: RunnerRunConfig,
  baseInstructions: string,
) {
  const lines: string[] = [
    `base_instructions = ${tomlValue(baseInstructions)}`,
    `model = ${tomlValue(config.env.OPENAI_MODEL)}`,
    `model_provider = ${tomlValue(MODEL_PROVIDER)}`,
  ];

  appendTables(lines, "model_providers", {
    [MODEL_PROVIDER]: {
      base_url: config.env.OPENAI_BASE_URL,
      env_key: "OPENAI_API_KEY",
      name: MODEL_PROVIDER,
      wire_api: "chat",
    },
  });
  appendTables(lines, "mcp_servers", config.mcpServers);

  return `${lines.join("\n")}\n`;
}

export function buildPrompt({
  config,
  preparedSkills,
  runId,
  runtimeDir,
  workspace,
}: {
  config: RunnerRunConfig;
  preparedSkills?: PreparedSkill[];
  runId: string;
  runtimeDir: string;
  workspace: string;
}) {
  const context = {
    currentDate: new Date().toISOString().slice(0, 10),
    cwd: workspace,
    mcpServers: Object.keys(config.mcpServers ?? {}),
    runId,
    skills:
      preparedSkills?.map(({ description, digest, name, path }) => ({
        description,
        digest,
        name,
        path,
      })) ?? [],
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
