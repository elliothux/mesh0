import { webhookTriggerPayloadSchema } from "@mesh0/sdk/schema";
import type {
  AgentDefinition,
  AgentWorkflowDefinition,
  SingleAgentDefinition,
  WebhookTriggerPayload,
} from "@mesh0/sdk/types";
import { AgentNotFoundError, AgentRunConfigError } from "@mesh0/services/agent";
import { RunNotificationConfigError } from "@mesh0/services/run";
import { WebhookNotFoundError } from "@mesh0/services/webhook";
import { z } from "zod";
import type { Context } from "./context";

const webhookRoutePattern = /^\/webhook\/([^/]+)\/([^/]+)$/;

export async function handleWebhookRequest(request: Request, context: Context) {
  const match = webhookRoutePattern.exec(new URL(request.url).pathname);
  if (match === null) {
    return undefined;
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const uid = match[1];
  const name = match[2];
  if (uid === undefined || name === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const webhook = await context.services.webhook.getActiveByRoute({
      name: decodeURIComponent(name),
      uid: decodeURIComponent(uid),
    });
    const payload = await readWebhookPayload(request);
    const runs = await context.services.executeAgentDefinition({
      definition: withWebhookPayload(webhook.definition, payload),
      userId: webhook.userId,
    });

    return Response.json(runs.length === 1 ? runs[0] : { runs }, {
      status: 202,
    });
  } catch (error) {
    if (error instanceof WebhookNotFoundError) {
      return new Response(error.message, { status: 404 });
    }

    if (
      error instanceof AgentNotFoundError ||
      error instanceof AgentRunConfigError ||
      error instanceof RunNotificationConfigError ||
      error instanceof z.ZodError
    ) {
      return new Response(error.message, { status: 400 });
    }

    throw error;
  }
}

async function readWebhookPayload(request: Request) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength === "0" || request.body === null) {
    return webhookTriggerPayloadSchema.parse({});
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return webhookTriggerPayloadSchema.parse({});
  }

  return webhookTriggerPayloadSchema.parse(await request.json());
}

function withWebhookPayload(
  definition: AgentDefinition,
  payload: WebhookTriggerPayload,
): AgentDefinition {
  if (isAgentWorkflowDefinition(definition)) {
    return {
      ...definition,
      agents: definition.agents.map((agent) =>
        withSingleAgentWebhookPayload(agent, payload),
      ),
      catch:
        definition.catch === undefined
          ? undefined
          : withSingleAgentWebhookPayload(definition.catch, payload),
      // oxlint-disable-next-line unicorn/no-thenable -- workflow definitions expose the public then/catch DSL.
      then:
        definition.then === undefined
          ? undefined
          : withSingleAgentWebhookPayload(definition.then, payload),
    };
  }

  return withSingleAgentWebhookPayload(definition, payload);
}

function withSingleAgentWebhookPayload(
  definition: SingleAgentDefinition,
  payload: WebhookTriggerPayload,
): SingleAgentDefinition {
  return {
    ...definition,
    config: payload.config ?? definition.config,
    prompt: payload.prompt ?? definition.prompt,
  };
}

function isAgentWorkflowDefinition(
  definition: AgentDefinition,
): definition is AgentWorkflowDefinition {
  return "mode" in definition;
}
