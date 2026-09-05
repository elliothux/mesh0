import type { RpcClient } from "@mesh0/api";
import { createMesh0 } from "@mesh0/sdk";
import {
  agentRunEventRecordSchema,
  agentRunRecordSchema,
} from "@mesh0/sdk/schema";
import type { AgentRunEventRecord } from "@mesh0/sdk/types";
import type { RunNotificationDelivery } from "@mesh0/services/run";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { expect, test } from "bun:test";
import { z } from "zod";
import { startLocalDashboardApi } from "../support/local-api";

const openAiEnv = {
  OPENAI_API_KEY: "sk_control_plane_test",
  OPENAI_BASE_URL: "http://127.0.0.1:1/v1",
  OPENAI_MODEL: "control-plane-test",
};

test("agents, crons, webhooks, and webhook triggers use API-owned state", async () => {
  const api = await startLocalDashboardApi();

  try {
    const mesh0 = createMesh0({
      apiKey: api.seed.activeKeyValue,
      apiUrl: api.apiUrl,
    });
    const agent = await mesh0
      .agent()
      .name("Control plane test agent")
      .env(openAiEnv)
      .prompt("Run the control plane test.")
      .persist();
    expect(agent.name).toBe("Control plane test agent");

    const agents = await mesh0.listAgents();
    expect(agents.some((item) => item.id === agent.id)).toBe(true);

    const run = await mesh0
      .agent(agent.name)
      .prompt({ append: "Queued through a persisted agent." })
      .execute();
    expect(run.id).toStartWith("run_");
    expect(run.record.status).toBe("queued");

    const cron = await mesh0.createCron({
      definition: { agentName: agent.name },
      expression: "0 9 * * *",
      name: "Control plane cron",
    });
    expect(cron.definition.agentName).toBe(agent.name);

    const webhook = await mesh0.createWebhook({
      definition: { agentName: agent.name },
      name: "control-plane-webhook",
    });
    const cronFromBuilder = await mesh0
      .cron({
        expression: "0 10 * * *",
        name: "Control plane builder cron",
      })
      .agent(mesh0.agent(agent.name).prompt({ append: "Builder cron" }));
    const webhookFromBuilder = await mesh0
      .webhook({ name: "control-plane-builder-webhook" })
      .agent(mesh0.agent(agent.name).prompt({ append: "Builder webhook" }));
    expect(webhook.path).toContain("/webhook/");
    expect(cronFromBuilder.definition.agentName).toBe(agent.name);
    expect(webhookFromBuilder.definition.agentName).toBe(agent.name);

    const webhookResponse = await fetch(new URL(webhook.path, api.apiUrl), {
      body: JSON.stringify({
        prompt: { append: "Queued through webhook HTTP." },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(webhookResponse.status).toBe(202);
    const webhookRunValue: unknown = await webhookResponse.json();
    const webhookRun = agentRunRecordSchema.parse(webhookRunValue);
    expect(webhookRun.status).toBe("queued");

    await mesh0.deleteCron({ cronId: cron.id });
    await mesh0.deleteCrons({ cronId: cronFromBuilder.id });
    await mesh0.deleteWebhook({ webhookId: webhook.id });
    await mesh0.deleteWebhooks({ webhookId: webhookFromBuilder.id });
    await mesh0.deleteAgent(agent.name);
  } finally {
    api.close();
  }
});

test("workflow crons and webhooks enqueue agent groups", async () => {
  const api = await startLocalDashboardApi();

  try {
    const mesh0 = createMesh0({
      apiKey: api.seed.activeKeyValue,
      apiUrl: api.apiUrl,
    });
    const agent = await mesh0
      .agent()
      .name("Workflow control plane agent")
      .env(openAiEnv)
      .prompt("Run the workflow control plane test.")
      .persist();
    const workflowCron = await mesh0
      .cron({
        expression: "* * * * *",
        name: "Workflow control plane cron",
      })
      .all([
        mesh0.agent(agent.name).prompt({ append: "First cron branch." }),
        mesh0.agent(agent.name).prompt({ append: "Second cron branch." }),
      ]);
    const workflowWebhook = await mesh0
      .webhook({ name: "workflow-control-plane-webhook" })
      .workflow(
        mesh0
          .all([
            mesh0.agent(agent.name).prompt({ append: "First webhook branch." }),
            mesh0
              .agent(agent.name)
              .prompt({ append: "Second webhook branch." }),
          ])
          .then(mesh0.agent(agent.name).prompt({ append: "Webhook then." })),
      );

    expect("mode" in workflowCron.definition).toBe(true);
    expect("mode" in workflowWebhook.definition).toBe(true);

    const cronRuns = await api.runDueCrons(new Date("2026-05-04T12:34:00Z"));
    expect(cronRuns).toHaveLength(2);
    expect(cronRuns.map((run) => run.input.prompt)).toContain(
      "Run the workflow control plane test.\n\nFirst cron branch.",
    );
    expect(cronRuns.map((run) => run.input.prompt)).toContain(
      "Run the workflow control plane test.\n\nSecond cron branch.",
    );

    const webhookResponse = await fetch(
      new URL(workflowWebhook.path, api.apiUrl),
      { method: "POST" },
    );
    expect(webhookResponse.status).toBe(202);
    const webhookRunsValue: unknown = await webhookResponse.json();
    const webhookRuns = z
      .strictObject({ runs: agentRunRecordSchema.array() })
      .parse(webhookRunsValue).runs;
    expect(webhookRuns).toHaveLength(3);
    expect(webhookRuns.map((run) => run.input.prompt)).toContain(
      "Run the workflow control plane test.\n\nWebhook then.",
    );
  } finally {
    api.close();
  }
});

test("run notifications dispatch completed results", async () => {
  const deliveries: RunNotificationDelivery[] = [];
  const api = await startLocalDashboardApi({
    notifications: {
      deliver: async (delivery) => {
        deliveries.push(delivery);
      },
    },
  });

  try {
    const mesh0 = createMesh0({
      apiKey: api.seed.activeKeyValue,
      apiUrl: api.apiUrl,
    });
    const run = await mesh0
      .agent()
      .env(openAiEnv)
      .prompt("Run with notification.")
      .notify({ email: "ops@example.com" })
      .execute();

    await api.completeRun(run.id, {
      artifacts: [
        {
          id: "artifact_notification",
          kind: "text",
          name: "summary.txt",
          runId: run.id,
          uri: `/runs/${run.id}/artifacts/summary.txt`,
        },
      ],
      lastMessage: "notification completed",
      status: "completed",
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.dashboardPath).toBe(`/run/${run.id}`);
    expect(deliveries[0]?.artifactUris).toEqual([
      `/runs/${run.id}/artifacts/summary.txt`,
    ]);
    expect(deliveries[0]?.notification.email).toBe("ops@example.com");
  } finally {
    api.close();
  }
});

test("run live events stream through oRPC SSE", async () => {
  const api = await startLocalDashboardApi();

  try {
    const rpc: RpcClient = createORPCClient(
      new RPCLink({
        headers: () => {
          const headers = new Headers();
          headers.set("Authorization", `Bearer ${api.seed.activeKeyValue}`);
          return headers;
        },
        url: `${api.apiUrl}/rpc`,
      }),
    );
    const stream = await rpc.runs.liveEvents({
      runId: api.seed.runningRunId,
    });
    const firstRecord = await readLiveEvent(stream);

    expect(firstRecord.event.type).toBe("thread.started");

    await api.appendEvents({
      events: { type: "turn.started" },
      runId: api.seed.runningRunId,
    });

    const secondRecord = await readLiveEvent(stream);
    expect(secondRecord.event.type).toBe("turn.started");

    await stream.return?.();
  } finally {
    api.close();
  }
});

test("workflow catch agents receive backend execution errors", async () => {
  const api = await startLocalDashboardApi();

  try {
    const mesh0 = createMesh0({
      apiKey: api.seed.activeKeyValue,
      apiUrl: api.apiUrl,
    });
    const catchAgent = await mesh0
      .agent()
      .name("Workflow catch control plane agent")
      .env(openAiEnv)
      .prompt("Handle workflow failure.")
      .persist();
    await mesh0.createCron({
      definition: {
        agents: [{ agentName: "missing-agent" }],
        catch: {
          agentName: catchAgent.name,
          prompt: { append: "Catch branch." },
        },
        mode: "all",
      },
      expression: "* * * * *",
      name: "Workflow catch cron",
    });

    const runs = await api.runDueCrons(new Date("2026-05-04T12:36:00Z"));

    expect(runs).toHaveLength(1);
    expect(runs[0]?.input.prompt).toBe(
      "Handle workflow failure.\n\nCatch branch.\n\nAgent not found",
    );
  } finally {
    api.close();
  }
});

async function readLiveEvent(stream: AsyncIterator<AgentRunEventRecord>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Timed out waiting for live run event")),
      5_000,
    );
  });

  try {
    const result = await Promise.race([stream.next(), timeoutPromise]);
    expect(result.done).toBe(false);
    return agentRunEventRecordSchema.parse(result.value);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

test("notify fails fast without a notification dispatcher", async () => {
  const api = await startLocalDashboardApi();

  try {
    const mesh0 = createMesh0({
      apiKey: api.seed.activeKeyValue,
      apiUrl: api.apiUrl,
    });

    await expect(
      mesh0
        .agent()
        .env(openAiEnv)
        .prompt("Run without notification dispatcher.")
        .notify({ email: "ops@example.com" })
        .execute(),
    ).rejects.toThrow("Run notification dispatcher is required");
  } finally {
    api.close();
  }
});

test("due crons enqueue runs once per scheduled minute", async () => {
  const api = await startLocalDashboardApi();

  try {
    const mesh0 = createMesh0({
      apiKey: api.seed.activeKeyValue,
      apiUrl: api.apiUrl,
    });
    const agent = await mesh0
      .agent()
      .name("Due cron test agent")
      .env(openAiEnv)
      .prompt("Run from a due cron.")
      .persist();
    const cron = await mesh0.createCron({
      definition: { agentName: agent.name },
      expression: "* * * * *",
      name: "Due cron test",
    });
    const now = new Date("2026-05-04T12:34:56Z");

    const firstRuns = await api.runDueCrons(now);
    const duplicateRuns = await api.runDueCrons(now);
    const nextRuns = await api.runDueCrons(new Date("2026-05-04T12:35:00Z"));
    const updatedCron = (await mesh0.listCrons()).find(
      (item) => item.id === cron.id,
    );

    expect(firstRuns).toHaveLength(1);
    expect(duplicateRuns).toHaveLength(0);
    expect(nextRuns).toHaveLength(1);
    expect(updatedCron?.lastTriggeredAt).toBe("2026-05-04T12:35:00.000Z");
    expect(updatedCron?.lastRunId).toBe(nextRuns[0]?.id);
  } finally {
    api.close();
  }
});
