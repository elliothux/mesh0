import type { RunnerSandbox } from "@mesh0/adapters";
import type {
  AgentDefinition,
  AgentPrompt,
  AgentRunInput,
  AgentRunRecord,
  AgentWorkflowDefinition,
  SingleAgentDefinition,
} from "@mesh0/sdk/types";
import { AgentService } from "./agent";
import { ApiKeyService } from "./api-key";
import { CronService } from "./cron";
import { RunService, type RunNotificationDispatcher } from "./run";
import { StatusService } from "./status";
import { UserService } from "./user";
import { WebhookService } from "./webhook";

import type { Db } from "@mesh0/db";

export class Services {
  readonly agent: AgentService;
  readonly apiKey: ApiKeyService;
  readonly cron: CronService;
  readonly run: RunService;
  readonly status: StatusService;
  readonly user: UserService;
  readonly webhook: WebhookService;

  constructor({
    db,
    notifications,
    sandbox,
  }: {
    db: Db;
    notifications?: RunNotificationDispatcher;
    sandbox?: RunnerSandbox;
  }) {
    this.agent = new AgentService(db);
    this.apiKey = new ApiKeyService(db);
    this.cron = new CronService(db);
    this.run = new RunService(db, sandbox, notifications);
    this.status = new StatusService(db);
    this.user = new UserService(db);
    this.webhook = new WebhookService(db);
  }

  async runDueCrons(now = new Date()): Promise<AgentRunRecord[]> {
    const dueCrons = await this.cron.due({ now });
    const runs: AgentRunRecord[] = [];

    for (const cron of dueCrons) {
      const cronRuns = await this.executeAgentDefinition({
        definition: cron.definition,
        userId: cron.userId,
      });
      const firstRun = cronRuns[0];
      if (firstRun === undefined) {
        throw new Error(`Cron did not enqueue any runs: ${cron.id}`);
      }
      await this.cron.markTriggered({
        cronId: cron.id,
        runId: firstRun.id,
        triggeredAt: now,
      });
      runs.push(...cronRuns);
    }

    return runs;
  }

  async executeAgentDefinition({
    definition,
    userId,
  }: {
    definition: AgentDefinition;
    userId: string;
  }): Promise<AgentRunRecord[]> {
    if (isAgentWorkflowDefinition(definition)) {
      return this.#executeWorkflowDefinition({ definition, userId });
    }

    return [await this.#executeSingleAgentDefinition({ definition, userId })];
  }

  async #executeWorkflowDefinition({
    definition,
    userId,
  }: {
    definition: AgentWorkflowDefinition;
    userId: string;
  }) {
    try {
      const runs =
        definition.mode === "all"
          ? await this.#executeAllAgentDefinitions({
              definitions: definition.agents,
              userId,
            })
          : await this.#executePipeAgentDefinitions({
              definitions: definition.agents,
              userId,
            });

      if (definition.then !== undefined) {
        runs.push(
          await this.#executeSingleAgentDefinition({
            definition: definition.then,
            userId,
          }),
        );
      }

      return runs;
    } catch (error) {
      if (definition.catch === undefined) {
        throw error;
      }

      return [
        await this.#executeSingleAgentDefinition({
          definition: withCatchPrompt(definition.catch, error),
          userId,
        }),
      ];
    }
  }

  async #executeAllAgentDefinitions({
    definitions,
    userId,
  }: {
    definitions: SingleAgentDefinition[];
    userId: string;
  }) {
    return Promise.all(
      definitions.map((definition) =>
        this.#executeSingleAgentDefinition({ definition, userId }),
      ),
    );
  }

  async #executePipeAgentDefinitions({
    definitions,
    userId,
  }: {
    definitions: SingleAgentDefinition[];
    userId: string;
  }) {
    const runs: AgentRunRecord[] = [];
    let previousRun: AgentRunRecord | undefined;

    for (const definition of definitions) {
      const input = await this.agent.buildRunInput({ ...definition, userId });
      const run = await this.run.create(
        userId,
        withPipeWorkspaceSource(input, previousRun),
      );
      runs.push(run);
      previousRun = run;
    }

    return runs;
  }

  async #executeSingleAgentDefinition({
    definition,
    userId,
  }: {
    definition: SingleAgentDefinition;
    userId: string;
  }) {
    const input = await this.agent.buildRunInput({ ...definition, userId });
    return this.run.create(userId, input);
  }
}

function isAgentWorkflowDefinition(
  definition: AgentDefinition,
): definition is AgentWorkflowDefinition {
  return "mode" in definition;
}

function withPipeWorkspaceSource(
  input: AgentRunInput,
  previousRun: AgentRunRecord | undefined,
): AgentRunInput {
  if (previousRun === undefined || !hasWorkspaceArtifact(previousRun)) {
    return input;
  }

  return {
    ...input,
    workspace:
      input.workspace === undefined
        ? { source: { runId: previousRun.id, type: "run" } }
        : {
            ...input.workspace,
            source: { runId: previousRun.id, type: "run" },
          },
  };
}

function hasWorkspaceArtifact(run: AgentRunRecord) {
  return run.artifacts.some(
    (artifact) =>
      artifact.kind === "directory" && artifact.name === "workspace",
  );
}

function withCatchPrompt(
  definition: SingleAgentDefinition,
  error: unknown,
): SingleAgentDefinition {
  return {
    ...definition,
    prompt: appendPrompt(definition.prompt, formatError(error)),
  };
}

function appendPrompt(
  prompt: AgentPrompt | undefined,
  value: string,
): AgentPrompt {
  if (prompt === undefined) {
    return value;
  }

  if (typeof prompt === "string") {
    return { append: `${prompt}\n\n${value}` };
  }

  if ("replace" in prompt) {
    return { replace: `${prompt.replace}\n\n${value}` };
  }

  return { append: `${prompt.append}\n\n${value}` };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
