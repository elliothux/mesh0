import type { Db } from "@mesh0/db";
import { agents } from "@mesh0/db/schema";
import type { Agent } from "@mesh0/db/types";
import { agentRecordSchema, agentRunInputSchema } from "@mesh0/sdk/schema";
import type {
  AgentConfig,
  AgentPrompt,
  AgentRecord,
  AgentRunInput,
  ListAgentsInput,
  PersistAgentInput,
  SingleAgentDefinition,
} from "@mesh0/sdk/types";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export class AgentNotFoundError extends Error {
  constructor() {
    super("Agent not found");
    this.name = "AgentNotFoundError";
  }
}

export class AgentRunConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRunConfigError";
  }
}

export class AgentService {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async upsert({
    config,
    name,
    userId,
  }: PersistAgentInput & { userId: string }): Promise<AgentRecord> {
    const existingAgent = await this.#getUserAgentRow({ name, userId });
    const now = new Date().toISOString();

    if (existingAgent === undefined) {
      const agent: Agent = {
        config: JSON.stringify(config),
        createdAt: now,
        id: `agent_${nanoid()}`,
        name,
        updatedAt: now,
        userId,
      };
      await this.#db.insert(agents).values(agent);
      return parseAgent(agent);
    }

    const updatedAgent: Agent = {
      ...existingAgent,
      config: JSON.stringify(config),
      updatedAt: now,
    };
    await this.#db
      .update(agents)
      .set({
        config: updatedAgent.config,
        updatedAt: updatedAgent.updatedAt,
      })
      .where(eq(agents.id, existingAgent.id));

    return parseAgent(updatedAgent);
  }

  async list({
    limit,
    userId,
  }: ListAgentsInput & { userId: string }): Promise<AgentRecord[]> {
    const rows = await this.#db
      .select()
      .from(agents)
      .where(eq(agents.userId, userId))
      .orderBy(desc(agents.updatedAt))
      .limit(limit);

    return rows.map(parseAgent);
  }

  async get({
    name,
    userId,
  }: {
    name: string;
    userId: string;
  }): Promise<AgentRecord> {
    const agent = await this.#getUserAgentRow({ name, userId });
    if (agent === undefined) {
      throw new AgentNotFoundError();
    }

    return parseAgent(agent);
  }

  async delete({
    name,
    userId,
  }: {
    name: string;
    userId: string;
  }): Promise<AgentRecord> {
    const agent = await this.#getUserAgentRow({ name, userId });
    if (agent === undefined) {
      throw new AgentNotFoundError();
    }

    await this.#db.delete(agents).where(eq(agents.id, agent.id));
    return parseAgent(agent);
  }

  async buildRunInput({
    agentName,
    config,
    notifications,
    prompt,
    target,
    userId,
  }: SingleAgentDefinition & { userId: string }): Promise<AgentRunInput> {
    const storedConfig =
      agentName === undefined
        ? undefined
        : (await this.get({ name: agentName, userId })).config;
    const mergedConfig = mergeAgentConfig(storedConfig, config);
    const resolvedPrompt = resolvePrompt({
      base: mergedConfig.prompt,
      override: prompt,
    });

    if (mergedConfig.env === undefined) {
      throw new AgentRunConfigError("Agent env is required before running");
    }

    if (resolvedPrompt === undefined) {
      throw new AgentRunConfigError("Agent prompt is required before running");
    }

    return agentRunInputSchema.parse({
      env: mergedConfig.env,
      mcpServers: mergedConfig.mcpServers,
      notifications,
      prompt: resolvedPrompt,
      skills: mergedConfig.skills,
      systemPrompt: mergedConfig.systemPrompt,
      target,
      workspace: mergedConfig.workspace,
    });
  }

  async #getUserAgentRow({ name, userId }: { name: string; userId: string }) {
    const [agent] = await this.#db
      .select()
      .from(agents)
      .where(and(eq(agents.userId, userId), eq(agents.name, name)))
      .limit(1);

    return agent;
  }
}

export function parseAgent(agent: Agent): AgentRecord {
  return agentRecordSchema.parse({
    config: JSON.parse(agent.config),
    createdAt: agent.createdAt,
    id: agent.id,
    name: agent.name,
    updatedAt: agent.updatedAt,
    userId: agent.userId,
  });
}

function mergeAgentConfig(
  base: AgentConfig | undefined,
  override: AgentConfig | undefined,
): AgentConfig {
  return {
    env: override?.env ?? base?.env,
    mcpServers: override?.mcpServers ?? base?.mcpServers,
    prompt: override?.prompt ?? base?.prompt,
    skills: override?.skills ?? base?.skills,
    systemPrompt: override?.systemPrompt ?? base?.systemPrompt,
    workspace: override?.workspace ?? base?.workspace,
  };
}

function resolvePrompt({
  base,
  override,
}: {
  base: AgentPrompt | undefined;
  override: AgentPrompt | undefined;
}) {
  return applyPrompt(applyPrompt(undefined, base), override);
}

function applyPrompt(
  current: string | undefined,
  prompt: AgentPrompt | undefined,
) {
  if (prompt === undefined) {
    return current;
  }

  if (typeof prompt === "string") {
    return appendPrompt(current, prompt);
  }

  if ("replace" in prompt) {
    return prompt.replace;
  }

  return appendPrompt(current, prompt.append);
}

function appendPrompt(current: string | undefined, value: string) {
  return current === undefined ? value : `${current}\n\n${value}`;
}
