/// <reference types="@cloudflare/workers-types" />

import type { RpcClient } from "@mesh0/api";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import api from "../apps/api/src/index";

const smokeEnvSchema = z.strictObject({
  CODEX_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_MODEL_PROVIDER: z.string().min(1).optional(),
  OPENAI_WIRE_API: z.enum(["chat", "responses"]).default("chat"),
  RUNNER_IMAGE: z.string().min(1),
});

const smokeEnv = smokeEnvSchema.parse({
  CODEX_API_KEY: process.env.RUNNER_SMOKE_API_KEY ?? process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL:
    process.env.RUNNER_SMOKE_BASE_URL ?? process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.RUNNER_SMOKE_MODEL ?? process.env.OPENAI_MODEL,
  OPENAI_MODEL_PROVIDER:
    process.env.RUNNER_SMOKE_MODEL_PROVIDER ??
    process.env.OPENAI_MODEL_PROVIDER,
  OPENAI_WIRE_API:
    process.env.RUNNER_SMOKE_WIRE_API ?? process.env.OPENAI_WIRE_API,
  RUNNER_IMAGE: process.env.RUNNER_IMAGE ?? "mesh0/runner:local",
});

const unusedDb: D1Database = {
  batch<T = unknown>(
    _statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    throw new Error("D1 is not used by runs smoke test routes");
  },
  dump(): Promise<ArrayBuffer> {
    throw new Error("D1 is not used by runs smoke test routes");
  },
  exec(_query: string): Promise<D1ExecResult> {
    throw new Error("D1 is not used by runs smoke test routes");
  },
  prepare(_query: string): D1PreparedStatement {
    throw new Error("D1 is not used by runs smoke test routes");
  },
  withSession(
    _constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint,
  ): D1DatabaseSession {
    throw new Error("D1 is not used by runs smoke test routes");
  },
};

const apiEnv = {
  DB: unusedDb,
};

const server = Bun.serve({
  fetch: (request) => api.fetch(request, apiEnv),
  hostname: "0.0.0.0",
  port: 0,
});

try {
  const hostApiUrl = `http://127.0.0.1:${server.port}`;
  const runnerApiUrl = `http://host.docker.internal:${server.port}`;
  const mesh0 = createMesh0({ apiUrl: hostApiUrl });
  const rpcClient: RpcClient = createORPCClient(
    new RPCLink({ url: `${hostApiUrl}/rpc` }),
  );
  const agent = mesh0
    .agent()
    .baseUrl(smokeEnv.OPENAI_BASE_URL)
    .systemPrompt({
      append: "Keep this smoke-test response to the requested exact text.",
    })
    .wireApi(smokeEnv.OPENAI_WIRE_API)
    .prompt("Respond with exactly: mesh0-runner-smoke-ok");
  if (smokeEnv.OPENAI_MODEL !== undefined) {
    agent.model(smokeEnv.OPENAI_MODEL, smokeEnv.OPENAI_MODEL_PROVIDER);
  } else if (smokeEnv.OPENAI_MODEL_PROVIDER !== undefined) {
    agent.modelProvider(smokeEnv.OPENAI_MODEL_PROVIDER);
  }

  const run = await agent.start();

  const runConfig = runnerRunConfigSchema.parse(
    await rpcClient.runs.input({ runId: run.id }),
  );
  const runtimeDir = await mkdtemp(join(tmpdir(), "mesh0-sdk-api-runner-"));
  const workspaceDir = join(runtimeDir, "workspace");
  await mkdir(workspaceDir);
  await writeFile(
    join(runtimeDir, "run.json"),
    `${JSON.stringify(runConfig, null, 2)}\n`,
  );

  await runDockerRunner({
    apiUrl: runnerApiUrl,
    image: smokeEnv.RUNNER_IMAGE,
    runtimeDir,
    workspaceDir,
  });

  const result = await run.result();
  if (result.status !== "completed") {
    throw new Error(`Expected completed run, got ${result.status}`);
  }

  const lastMessage = await readFile(
    join(runtimeDir, "output", "codex", "last-message.txt"),
    "utf8",
  );
  if (!lastMessage.includes("mesh0-runner-smoke-ok")) {
    throw new Error(`Unexpected last message: ${lastMessage}`);
  }

  let eventCount = 0;
  for await (const _event of run.events()) {
    eventCount += 1;
  }

  if (eventCount === 0) {
    throw new Error("Expected runner to post at least one event");
  }

  console.log(`sdk-api-runner-smoke-ok ${run.id}`);
} finally {
  server.stop(true);
}

async function runDockerRunner({
  apiUrl,
  image,
  runtimeDir,
  workspaceDir,
}: {
  apiUrl: string;
  image: string;
  runtimeDir: string;
  workspaceDir: string;
}) {
  const proc = Bun.spawn(
    [
      "docker",
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "--entrypoint",
      "bash",
      "-v",
      `${runtimeDir}:/mesh0-runtime`,
      "-v",
      `${workspaceDir}:/workspace/smoke`,
      "-e",
      `CODEX_API_KEY=${smokeEnv.CODEX_API_KEY}`,
      "-e",
      `MESH0_SMOKE_API_URL=${apiUrl}`,
      image,
      "-lc",
      [
        "set -euo pipefail",
        "cd /workspace/smoke",
        "git init -q",
        "git config user.email smoke@mesh0.local",
        'git config user.name "Mesh0 Smoke"',
        'printf "mesh0 sdk api runner smoke test\\n" > README.md',
        "git add README.md",
        'git commit -qm "init"',
        'mesh0-runner run --runtime-dir /mesh0-runtime --workspace /workspace/smoke --output-dir /mesh0-runtime/output --api-url "${MESH0_SMOKE_API_URL}"',
      ].join("\n"),
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `runner exited with code ${exitCode}`,
        "stdout:",
        redact(stdout),
        "stderr:",
        redact(stderr),
      ].join("\n"),
    );
  }
}

function redact(value: string) {
  const secrets = [
    smokeEnv.CODEX_API_KEY,
    smokeEnv.OPENAI_BASE_URL,
    smokeEnv.OPENAI_BASE_URL.replace("https://", "wss://").replace(
      "http://",
      "ws://",
    ),
  ];

  return secrets.reduce(
    (output, secret) => output.replaceAll(secret, "[redacted]"),
    value,
  );
}
