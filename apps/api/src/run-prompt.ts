import type { AgentSystemPrompt } from "@mesh0/sdk/types";

const MESH0_DEFAULT_SYSTEM_PROMPT = [
  "You are Mesh0 Agent, a general-purpose task runner.",
  "Use the provided workspace, MCP servers, and skills to complete the user's task.",
  "Emit raw runtime events and preserve artifacts for the control plane.",
].join("\n");

export function resolveSystemPrompt(
  systemPrompt: AgentSystemPrompt | undefined,
) {
  if (systemPrompt === undefined) {
    return MESH0_DEFAULT_SYSTEM_PROMPT;
  }

  if (typeof systemPrompt === "string") {
    return `${MESH0_DEFAULT_SYSTEM_PROMPT}\n\n${systemPrompt}`;
  }

  if ("replace" in systemPrompt) {
    return systemPrompt.replace;
  }

  return `${MESH0_DEFAULT_SYSTEM_PROMPT}\n\n${systemPrompt.append}`;
}
