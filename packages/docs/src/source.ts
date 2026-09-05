import type { DocsBlock, DocsNavigationGroup, DocsPage } from "./types";

const quickstartSdk = sdkTabs({
  py: `from mesh0 import Mesh0

mesh0 = Mesh0(
    api_url="https://api.mesh0.run",
    api_key="mesh0.key_xxx.secret",
)

run = (
    mesh0.agent()
    .env({
        "OPENAI_API_KEY": "sk_...",
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "OPENAI_MODEL": "gpt-5.4",
    })
    .prompt("Audit this repository and produce a patch.")
    .execute()
)

print(run.id)`,
  rs: `use mesh0::Mesh0;
use serde_json::json;

let mesh0 = Mesh0::new("https://api.mesh0.run")
    .with_api_key("mesh0.key_xxx.secret");

let run = mesh0
    .agent()
    .env(json!({
        "OPENAI_API_KEY": "sk_...",
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "OPENAI_MODEL": "gpt-5.4"
    }))
    .prompt("Audit this repository and produce a patch.")
    .execute()?;

println!("{}", run.id);`,
  ts: `import { createMesh0 } from "@mesh0/sdk";

const mesh0 = createMesh0({
  apiUrl: "https://api.mesh0.run",
  apiKey: process.env.MESH0_API_KEY,
});

const run = await mesh0
  .agent()
  .env({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: "gpt-5.4",
  })
  .prompt("Audit this repository and produce a patch.")
  .execute();

console.log(run.id);`,
});

const workflowSdk = sdkTabs({
  py: `from mesh0 import Mesh0

mesh0 = Mesh0(api_url="https://api.mesh0.run", api_key="mesh0.key_xxx.secret")
agent = mesh0.agent("audit-agent")

mesh0.cron({"expression": "0 9 * * *", "name": "daily-audit"}).workflow(
    mesh0.all([
        agent.prompt({"append": "Check API changes."}),
        agent.prompt({"append": "Check web changes."}),
    ]).then(agent.prompt({"append": "Summarize risks."}))
)`,
  rs: `use mesh0::{CronOptions, Mesh0};
use serde_json::json;

let mesh0 = Mesh0::new("https://api.mesh0.run")
    .with_api_key("mesh0.key_xxx.secret");
let agent = mesh0.named_agent("audit-agent");

mesh0
    .cron(CronOptions::new("0 9 * * *").name("daily-audit"))
    .workflow(
        &mesh0
            .all(vec![
                agent.clone().prompt(json!({ "append": "Check API changes." })),
                agent.clone().prompt(json!({ "append": "Check web changes." })),
            ])
            .then(agent.prompt(json!({ "append": "Summarize risks." }))),
    )?;`,
  ts: `const auditAgent = await mesh0
  .agent()
  .name("audit-agent")
  .env({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: "gpt-5.4",
  })
  .prompt("Audit this repository and produce a patch.")
  .persist();

await mesh0.cron({ expression: "0 9 * * *", name: "daily-audit" }).workflow(
  mesh0
    .all([
      mesh0.agent(auditAgent.name).prompt({ append: "Check API changes." }),
      mesh0.agent(auditAgent.name).prompt({ append: "Check web changes." }),
    ])
    .then(mesh0.agent(auditAgent.name).prompt({ append: "Summarize risks." })),
);`,
});

const runEventsSdk = sdkTabs({
  py: `handle = mesh0.run({
    "env": env,
    "prompt": "Investigate failing tests.",
})

result = handle.wait()
print(result["status"])`,
  rs: `use std::time::Duration;

let handle = mesh0.run(json!({
    "env": env,
    "prompt": "Investigate failing tests."
}))?;

let result = handle.wait(Duration::from_secs(1), Duration::from_secs(600))?;
println!("{}", result["status"]);`,
  ts: `const handle = await mesh0
  .agent()
  .env(env)
  .prompt("Investigate failing tests.")
  .execute();

const result = await handle.wait();
const records = await handle.eventRecords({
  eventType: "item.completed",
  limit: 100,
});

for (const record of records) {
  console.log(record.id, record.eventType, record.event);
}`,
});

export const docsNavigationSource = [
  {
    pages: ["quickstart", "concepts"],
    title: "Getting Started",
  },
  {
    pages: ["sdk-overview", "sdk-agents", "sdk-runs", "sdk-automation"],
    title: "SDK",
  },
  {
    pages: ["http-overview", "http-agents", "http-runs", "http-automation"],
    title: "HTTP API",
  },
  {
    pages: ["reference-schemas"],
    title: "Reference",
  },
] satisfies DocsNavigationGroup[];

export const docsPagesSource = [
  {
    description:
      "Create an API key, configure model credentials, start a run, and inspect the result.",
    sections: [
      {
        blocks: [
          {
            text: "mesh0 is a control plane for running Codex-style agents from SDKs, HTTP calls, scheduled jobs, and webhooks. The dashboard owns runs, events, artifacts, agents, schedules, and API keys; the runner only executes work and streams results back.",
            type: "paragraph",
          },
          {
            items: [
              {
                body: "Create an API key from the dashboard. Use the full secret once; the dashboard only stores the prefix afterwards.",
                title: "Create a mesh0 API key",
              },
              {
                body: "Pass OpenAI-compatible model credentials through the run input. Required keys are OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL.",
                title: "Configure model credentials",
              },
              {
                body: "Create a direct run for one-off work, or persist an agent when the same configuration should be reused by crons and webhooks.",
                title: "Start a run",
              },
              {
                body: "Use run detail pages to inspect event records, artifacts, raw payloads, and live logs for running work.",
                title: "Observe the run",
              },
            ],
            type: "steps",
          },
        ],
        id: "flow",
        title: "Flow",
      },
      {
        blocks: [
          quickstartSdk,
          {
            text: "The TypeScript SDK has the richest surface and mirrors the internal oRPC client. Python and Rust use the same backend RPC envelope and expose the core workflow builders.",
            title: "SDK maturity",
            type: "note",
          },
        ],
        id: "first-run",
        title: "First run",
      },
      {
        blocks: [
          {
            code: `POST /rpc/runs/create
Authorization: Bearer mesh0.key_xxx.secret
Content-Type: application/json

{
  "env": {
    "OPENAI_API_KEY": "sk_...",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_MODEL": "gpt-5.4"
  },
  "prompt": "Audit this repository and produce a patch."
}`,
            language: "http",
            title: "Create a run over HTTP",
            type: "code",
          },
          {
            columns: ["Field", "Required", "Description"],
            rows: [
              [
                "Authorization",
                "yes",
                "Bearer mesh0 API key for dashboard-owned routes.",
              ],
              [
                "env",
                "yes",
                "OpenAI-compatible model credentials passed to the runner.",
              ],
              ["prompt", "yes", "User task for this run."],
              [
                "workspace",
                "no",
                "Git source or previous run workspace source.",
              ],
              [
                "notifications",
                "no",
                "Email or Telegram notification destination.",
              ],
            ],
            type: "table",
          },
        ],
        id: "http-first-run",
        title: "HTTP first run",
      },
    ],
    slug: "quickstart",
    title: "Quick Start",
  },
  {
    description:
      "The core entities and ownership boundaries that make mesh0 predictable.",
    sections: [
      {
        blocks: [
          {
            text: "Agents are reusable configuration records. They can carry env, workspace, MCP servers, skills, system prompt, and a default prompt. A direct run can use the same fields without persisting an agent.",
            type: "paragraph",
          },
          {
            columns: ["Concept", "Owner", "Notes"],
            rows: [
              ["Agent", "API", "Reusable configuration addressed by name."],
              [
                "Run",
                "API",
                "Immutable request plus mutable status, artifacts, and event records.",
              ],
              [
                "Runner",
                "Runner runtime",
                "Executes a run with a runner token and writes events back.",
              ],
              [
                "Event record",
                "D1",
                "Normalized persisted event with id, type, item metadata, and raw event.",
              ],
              [
                "Artifact",
                "Storage provider",
                "File, directory manifest, patch, JSON, text, or log object.",
              ],
            ],
            type: "table",
          },
        ],
        id: "entities",
        title: "Entities",
      },
      {
        blocks: [
          {
            text: "Dashboard user state is API-owned. Web pages call API routes or thin web transport glue; they do not own persistence or auth decisions. Runner routes use runner tokens scoped to a run.",
            type: "paragraph",
          },
          {
            items: [
              "User API calls authenticate with a mesh0 API key or dashboard session cookie.",
              "Runner calls authenticate with the runner token issued at run creation.",
              "Persisted runtime state lives in D1, Durable Objects, R2, KV, or an explicit storage owner.",
              "Run events are normalized before write, so event tables can be filtered by type and item metadata.",
            ],
            type: "list",
          },
        ],
        id: "boundaries",
        title: "Ownership boundaries",
      },
      {
        blocks: [
          {
            text: "Workflows can run branches in parallel with all, or sequentially with pipe. Pipe passes the previous run workspace into the next branch and fails fast when an upstream run does not complete successfully.",
            type: "paragraph",
          },
          workflowSdk,
        ],
        id: "workflows",
        title: "Workflows",
      },
    ],
    slug: "concepts",
    title: "Core Concepts",
  },
  {
    description:
      "Install clients, create Mesh0 instances, and choose the right SDK surface.",
    sections: [
      {
        blocks: [
          {
            columns: ["Language", "Package", "Best for"],
            rows: [
              [
                "TypeScript",
                "@mesh0/sdk",
                "Full dashboard automation, rich types, event records, artifacts.",
              ],
              [
                "Python",
                "mesh0",
                "Scripting and CI jobs that create runs, agents, schedules, and webhooks.",
              ],
              [
                "Rust",
                "mesh0",
                "Small binaries and backend services that call the HTTP API directly.",
              ],
            ],
            type: "table",
          },
          {
            code: `bun add @mesh0/sdk
python3 -m pip install mesh0
cargo add mesh0`,
            language: "bash",
            title: "Install SDKs",
            type: "code",
          },
        ],
        id: "install",
        title: "Installation",
      },
      {
        blocks: [
          quickstartSdk,
          {
            text: "apiUrl defaults to http://localhost:5592 for local development. In production, use https://api.mesh0.run and pass a dashboard API key.",
            type: "paragraph",
          },
        ],
        id: "client",
        title: "Client setup",
      },
      {
        blocks: [
          {
            items: [
              "Use direct runs for one-off work that should not be reused.",
              "Use named agents when crons, webhooks, or workflows need the same configuration.",
              "Use prompt append when a scheduled or webhook trigger should add task-specific context to an agent's base prompt.",
              "Use workspace source from a previous run when chaining work across a pipe workflow.",
            ],
            type: "list",
          },
        ],
        id: "patterns",
        title: "SDK patterns",
      },
    ],
    slug: "sdk-overview",
    title: "SDK Overview",
  },
  {
    description:
      "Create direct agents, persist reusable agents, run named agents, and understand configuration fields.",
    sections: [
      {
        blocks: [
          {
            text: "A direct agent builder becomes a run when execute is called. It must include env and prompt because there is no persisted agent configuration to fill missing fields.",
            type: "paragraph",
          },
          quickstartSdk,
        ],
        id: "direct",
        title: "Direct agents",
      },
      {
        blocks: [
          {
            text: "Persisted agents are addressed by name. A named run may provide prompt append or replacement, target, notifications, and partial config overrides.",
            type: "paragraph",
          },
          workflowSdk,
        ],
        id: "persisted",
        title: "Persisted agents",
      },
      {
        blocks: [
          {
            columns: ["Field", "Type", "Description"],
            rows: [
              [
                "env",
                "object",
                "OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, plus any provider-specific variables.",
              ],
              [
                "prompt",
                "string | { append } | { replace }",
                "Default or trigger-specific prompt text.",
              ],
              ["workspace", "object", "Git source or previous run source."],
              [
                "systemPrompt",
                "string | { append } | { replace }",
                "Base instructions merged into the runner prompt.",
              ],
              ["mcpServers", "record", "Codex-compatible MCP server config."],
              ["skills", "array", "Well-known or git skill references."],
              [
                "notifications",
                "object",
                "Email or Telegram completion delivery.",
              ],
            ],
            type: "table",
          },
        ],
        id: "configuration",
        title: "Configuration fields",
      },
    ],
    slug: "sdk-agents",
    title: "Agents",
  },
  {
    description:
      "Read run status, wait for completion, inspect event records, download artifacts, and understand live logs.",
    sections: [
      {
        blocks: [
          {
            text: "Run handles expose the run id, the original record, a wait helper, static event reads, event record reads, and artifact downloads. Event records are the preferred observability shape because they include normalized metadata.",
            type: "paragraph",
          },
          runEventsSdk,
        ],
        id: "records",
        title: "Event records",
      },
      {
        blocks: [
          {
            text: "The dashboard live log uses the HTTP oRPC SSE stream. SDKs can still poll eventRecords today; use HTTP liveEvents when a raw streaming connection is required.",
            title: "Live logs",
            type: "note",
          },
          {
            code: `POST /rpc/runs/liveEvents
Authorization: Bearer mesh0.key_xxx.secret
Content-Type: application/json
Accept: text/event-stream

{
  "runId": "run_abc123",
  "afterEventId": 42,
  "eventType": "item.completed"
}`,
            language: "http",
            type: "code",
          },
        ],
        id: "live",
        title: "Live logs",
      },
      {
        blocks: [
          {
            code: `const response = await run.downloadArtifact("workspace/dashboard-artifact.txt");
const content = await response.text();`,
            language: "ts",
            title: "Download an artifact",
            type: "code",
          },
          {
            columns: ["Status", "Meaning"],
            rows: [
              [
                "queued",
                "Run has been created and is waiting for runner work.",
              ],
              ["running", "At least one runner event has been appended."],
              [
                "completed",
                "Run finished successfully and artifacts are stable.",
              ],
              [
                "failed",
                "Run completed with an error status and optional lastMessage.",
              ],
              [
                "canceled",
                "Run was explicitly canceled or stopped by the platform.",
              ],
            ],
            type: "table",
          },
        ],
        id: "artifacts-status",
        title: "Artifacts and status",
      },
    ],
    slug: "sdk-runs",
    title: "Runs and Events",
  },
  {
    description:
      "Use crons, webhooks, workflows, pipe chains, catch branches, and notifications.",
    sections: [
      {
        blocks: [
          {
            text: "Crons persist a schedule and agent definition. Webhooks persist a stable route and agent definition. Both enqueue runs through API-owned procedures, so they share the same validation and storage path as SDK calls.",
            type: "paragraph",
          },
          workflowSdk,
        ],
        id: "crons-webhooks",
        title: "Crons and webhooks",
      },
      {
        blocks: [
          {
            text: "all starts branches concurrently. pipe starts each branch after the previous run completes and uses the previous run workspace as the next workspace source.",
            type: "paragraph",
          },
          {
            code: `await mesh0
  .all([
    mesh0.agent("lint").prompt({ append: "Check the API package." }),
    mesh0.agent("lint").prompt({ append: "Check the web package." }),
  ])
  .catch(mesh0.agent("triage").prompt({ append: "Explain the failure." }))
  .execute();`,
            language: "ts",
            type: "code",
          },
        ],
        id: "workflow-runtime",
        title: "Workflow runtime",
      },
      {
        blocks: [
          {
            columns: ["Option", "Description"],
            rows: [
              [
                "email",
                "Send a completion email with dashboard path and artifact URIs.",
              ],
              [
                "telegramBotToken",
                "Telegram delivery token for completion notifications.",
              ],
            ],
            type: "table",
          },
          {
            text: "Notification dispatchers must be configured on the API service before runs with notifications are accepted. Missing notification infrastructure fails fast at run creation.",
            type: "paragraph",
          },
        ],
        id: "notifications",
        title: "Notifications",
      },
    ],
    slug: "sdk-automation",
    title: "Automation",
  },
  {
    description:
      "Use the oRPC HTTP transport directly, including auth, envelopes, errors, and SSE streaming.",
    sections: [
      {
        blocks: [
          {
            text: "All user-owned HTTP API routes live under /rpc and accept JSON request bodies. A successful non-streaming response is a JSON envelope with a json property. Defined errors are returned with an error property and an HTTP status.",
            type: "paragraph",
          },
          {
            code: `POST /rpc/runs/get
Authorization: Bearer mesh0.key_xxx.secret
Content-Type: application/json

{ "runId": "run_abc123" }

HTTP/1.1 200 OK
Content-Type: application/json

{ "json": { "id": "run_abc123", "status": "completed" } }`,
            language: "http",
            type: "code",
          },
        ],
        id: "transport",
        title: "Transport",
      },
      {
        blocks: [
          {
            items: [
              "Dashboard routes require Authorization: Bearer mesh0.key_xxx.secret or an authenticated dashboard session.",
              "Runner routes use the per-run runner token, never the dashboard API key.",
              "Do not send a revoked API key. Revoked keys remain visible for audit but cannot authenticate.",
            ],
            type: "list",
          },
        ],
        id: "auth",
        title: "Authentication",
      },
      {
        blocks: [
          {
            text: "Streaming procedures return text/event-stream. The liveEvents stream yields AgentRunEventRecord values and stops when the run reaches a terminal status or the client aborts the request.",
            type: "paragraph",
          },
          {
            code: `POST /rpc/runs/liveEvents
Authorization: Bearer mesh0.key_xxx.secret
Content-Type: application/json
Accept: text/event-stream

{ "runId": "run_abc123", "afterEventId": 12 }`,
            language: "http",
            type: "code",
          },
        ],
        id: "sse",
        title: "SSE streams",
      },
    ],
    slug: "http-overview",
    title: "HTTP Overview",
  },
  {
    description: "HTTP endpoints for persisted agents and named agent runs.",
    sections: [
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/agents/persist",
            "Persist agent",
            "Create or update a named agent for the current user.",
            `{
  "name": "audit-agent",
  "config": {
    "env": {
      "OPENAI_API_KEY": "sk_...",
      "OPENAI_BASE_URL": "https://api.openai.com/v1",
      "OPENAI_MODEL": "gpt-5.4"
    },
    "prompt": "Audit this repository."
  }
}`,
            "AgentRecord",
          ),
          endpoint(
            "POST",
            "/rpc/agents/run",
            "Run agent",
            "Build a run input from a named agent plus optional prompt/config overrides.",
            `{
  "name": "audit-agent",
  "prompt": { "append": "Focus on auth and billing." },
  "notifications": { "email": "ops@example.com" }
}`,
            "AgentRunRecord",
          ),
        ],
        id: "write",
        title: "Write endpoints",
      },
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/agents/list",
            "List agents",
            "Return the newest agents owned by the authenticated user.",
            `{ "limit": 50 }`,
            "AgentRecord[]",
          ),
          endpoint(
            "POST",
            "/rpc/agents/get",
            "Get agent",
            "Return one named agent.",
            `{ "name": "audit-agent" }`,
            "AgentRecord",
          ),
          endpoint(
            "POST",
            "/rpc/agents/delete",
            "Delete agent",
            "Delete one named agent and return the deleted record.",
            `{ "name": "audit-agent" }`,
            "AgentRecord",
          ),
        ],
        id: "read-delete",
        title: "Read and delete endpoints",
      },
    ],
    slug: "http-agents",
    title: "Agents API",
  },
  {
    description:
      "HTTP endpoints for run creation, status, observability, runner writes, and artifact upload.",
    sections: [
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/runs/create",
            "Create run",
            "Create a direct run for the current user.",
            `{
  "env": {
    "OPENAI_API_KEY": "sk_...",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_MODEL": "gpt-5.4"
  },
  "prompt": "Investigate flaky tests.",
  "target": "cloudflare"
}`,
            "AgentRunRecord",
          ),
          endpoint(
            "POST",
            "/rpc/runs/list",
            "List runs",
            "Return recent runs for the authenticated user.",
            `{ "limit": 50 }`,
            "AgentRunRecord[]",
          ),
          endpoint(
            "POST",
            "/rpc/runs/get",
            "Get run",
            "Return run metadata, input, status, artifacts, and last message.",
            `{ "runId": "run_abc123" }`,
            "AgentRunRecord",
          ),
        ],
        id: "run-lifecycle",
        title: "Run lifecycle",
      },
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/runs/events",
            "Read raw events",
            "Return the raw ThreadEvent list for a run.",
            `{ "runId": "run_abc123" }`,
            "ThreadEvent[]",
          ),
          endpoint(
            "POST",
            "/rpc/runs/eventRecords",
            "Read event records",
            "Return normalized event records. Use eventType and afterEventId for filtering.",
            `{
  "runId": "run_abc123",
  "eventType": "item.completed",
  "afterEventId": 50,
  "limit": 100
}`,
            "AgentRunEventRecord[]",
          ),
          endpoint(
            "POST",
            "/rpc/runs/liveEvents",
            "Stream live event records",
            "Return an oRPC SSE stream of AgentRunEventRecord values.",
            `{
  "runId": "run_abc123",
  "afterEventId": 50
}`,
            "text/event-stream",
          ),
        ],
        id: "observability",
        title: "Observability endpoints",
      },
      {
        blocks: [
          {
            text: "Runner-owned endpoints authenticate with the runner token created alongside the run. They are intended for runner runtimes, not dashboard users.",
            type: "paragraph",
          },
          endpoint(
            "POST",
            "/rpc/runs/appendEvents",
            "Append runner events",
            "Persist one or more Codex ThreadEvent payloads and mark queued runs as running.",
            `{
  "runId": "run_abc123",
  "events": [{ "type": "turn.started" }]
}`,
            "{ appended: number }",
          ),
          endpoint(
            "POST",
            "/rpc/runs/complete",
            "Complete run",
            "Set terminal status, artifacts, last message, and notification delivery.",
            `{
  "runId": "run_abc123",
  "completion": {
    "status": "completed",
    "lastMessage": "Done",
    "artifacts": []
  }
}`,
            "AgentRunRecord",
          ),
        ],
        id: "runner",
        title: "Runner endpoints",
      },
    ],
    slug: "http-runs",
    title: "Runs API",
  },
  {
    description:
      "HTTP endpoints for schedules, webhooks, API keys, and trigger payloads.",
    sections: [
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/crons/create",
            "Create cron",
            "Persist a scheduled agent definition.",
            `{
  "name": "daily-audit",
  "expression": "0 9 * * *",
  "definition": { "agentName": "audit-agent" }
}`,
            "CronRecord",
          ),
          endpoint(
            "POST",
            "/rpc/crons/list",
            "List crons",
            "Return recent non-deleted crons.",
            `{ "limit": 50 }`,
            "CronRecord[]",
          ),
          endpoint(
            "POST",
            "/rpc/crons/delete",
            "Delete cron",
            "Mark a cron as deleted.",
            `{ "cronId": "cron_abc123" }`,
            "CronRecord",
          ),
        ],
        id: "crons",
        title: "Crons",
      },
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/webhooks/create",
            "Create webhook",
            "Persist a webhook route and agent definition.",
            `{
  "name": "github-review",
  "definition": {
    "agentName": "audit-agent",
    "prompt": { "append": "Review the webhook payload." }
  }
}`,
            "WebhookRecord",
          ),
          endpoint(
            "POST",
            "/rpc/webhooks/list",
            "List webhooks",
            "Return recent non-deleted webhooks.",
            `{ "limit": 50 }`,
            "WebhookRecord[]",
          ),
          endpoint(
            "POST",
            "/rpc/webhooks/delete",
            "Delete webhook",
            "Mark a webhook as deleted.",
            `{ "webhookId": "webhook_abc123" }`,
            "WebhookRecord",
          ),
        ],
        id: "webhooks",
        title: "Webhooks",
      },
      {
        blocks: [
          endpoint(
            "POST",
            "/rpc/apiKeys/create",
            "Create API key",
            "Create an API key and return the secret once.",
            `{ "name": "CI deploy key" }`,
            "{ apiKey: ApiKey; key: string }",
          ),
          endpoint(
            "POST",
            "/rpc/apiKeys/list",
            "List API keys",
            "Return active and revoked keys without secret values.",
            "{}",
            "ApiKey[]",
          ),
          endpoint(
            "POST",
            "/rpc/apiKeys/revoke",
            "Revoke API key",
            "Revoke a key for future authentication.",
            `{ "apiKeyId": "key_abc123" }`,
            "ApiKey",
          ),
          endpoint(
            "POST",
            "/rpc/apiKeys/rename",
            "Rename API key",
            "Rename a key without rotating it.",
            `{ "apiKeyId": "key_abc123", "name": "Prod CI" }`,
            "ApiKey",
          ),
        ],
        id: "api-keys",
        title: "API keys",
      },
    ],
    slug: "http-automation",
    title: "Automation API",
  },
  {
    description: "Common input and output shapes shared by SDK and HTTP calls.",
    sections: [
      {
        blocks: [
          {
            columns: ["Schema", "Shape"],
            rows: [
              [
                "AgentRunInput",
                "{ env, prompt, workspace?, mcpServers?, skills?, systemPrompt?, target?, notifications? }",
              ],
              [
                "AgentConfig",
                "{ env?, prompt?, workspace?, mcpServers?, skills?, systemPrompt? }",
              ],
              [
                "AgentDefinition",
                "Single agent definition or workflow definition.",
              ],
              [
                "AgentRunEventRecord",
                "{ id, runId, eventType, itemId?, itemStatus?, itemType?, event, createdAt }",
              ],
              ["ArtifactRef", "{ id, runId, kind, name?, uri, contentType? }"],
              ["RunNotification", "{ email? } or { telegramBotToken? }"],
            ],
            type: "table",
          },
        ],
        id: "core-schemas",
        title: "Core schemas",
      },
      {
        blocks: [
          {
            columns: ["Value", "Description"],
            rows: [
              ["thread.started", "Codex thread created."],
              ["turn.started", "A turn began."],
              ["turn.completed", "A turn finished with usage."],
              ["turn.failed", "A turn failed with structured error."],
              ["item.started", "A thread item began."],
              ["item.updated", "A thread item changed."],
              ["item.completed", "A thread item completed."],
              ["error", "Runner emitted a general error message."],
            ],
            type: "table",
          },
        ],
        id: "event-types",
        title: "Event types",
      },
    ],
    slug: "reference-schemas",
    title: "Schemas",
  },
] satisfies DocsPage[];

function sdkTabs({
  py,
  rs,
  ts,
}: {
  py: string;
  rs: string;
  ts: string;
}): DocsBlock {
  return {
    tabs: [
      { code: ts, language: "ts", title: "TypeScript", value: "ts" },
      { code: py, language: "py", title: "Python", value: "py" },
      { code: rs, language: "rs", title: "Rust", value: "rs" },
    ],
    type: "codeGroup",
  };
}

function endpoint(
  method: "DELETE" | "GET" | "POST" | "PUT",
  path: string,
  title: string,
  body: string,
  request: string,
  response: string,
): DocsBlock {
  return {
    body,
    method,
    path,
    request,
    response,
    title,
    type: "endpoint",
  };
}
