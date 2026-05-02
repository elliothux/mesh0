import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RunnerSandbox,
  RunnerSandboxDispatch,
  RunnerSandboxStart,
} from "../index";

type DynamicValue = string | (() => string);

export class DockerSandbox implements RunnerSandbox {
  readonly #apiUrl: DynamicValue;
  readonly #image: DynamicValue;
  readonly #platform: DynamicValue | undefined;

  constructor({
    apiUrl,
    image,
    platform,
  }: {
    apiUrl: DynamicValue;
    image: DynamicValue;
    platform?: DynamicValue;
  }) {
    this.#apiUrl = apiUrl;
    this.#image = image;
    this.#platform = platform;
  }

  async start({
    run,
    runnerToken,
  }: RunnerSandboxStart): Promise<RunnerSandboxDispatch> {
    const apiUrl = resolveDynamicValue(this.#apiUrl, "apiUrl");
    const image = resolveDynamicValue(this.#image, "image");
    const runtimeDir = await mkdtemp(join(tmpdir(), "mesh0-run-"));
    const proc = Bun.spawn(
      [
        "docker",
        "run",
        "--rm",
        "--platform",
        this.#platform === undefined
          ? "linux/amd64"
          : resolveDynamicValue(this.#platform, "platform"),
        "--entrypoint",
        "bash",
        "-v",
        `${runtimeDir}:/mesh0-runtime`,
        "-e",
        `MESH0_API_URL=${apiUrl}`,
        "-e",
        `MESH0_RUN_ID=${run.id}`,
        "-e",
        `MESH0_RUNNER_TOKEN=${runnerToken}`,
        image,
        "-lc",
        buildRunnerCommand(),
      ],
      {
        stderr: "pipe",
        stdout: "pipe",
      },
    );

    return {
      completion: monitorDockerRun({
        apiUrl,
        proc,
        runId: run.id,
      }),
    };
  }
}

function buildRunnerCommand() {
  const parts = [
    "set -euo pipefail",
    [
      "mesh0-runner",
      "run",
      "--runtime-dir /mesh0-runtime",
      "--workspace /mesh0-runtime/workspace",
      "--output-dir /mesh0-runtime/output",
      "--run-json /mesh0-runtime/run.json",
      '--api-url "$MESH0_API_URL"',
      '--run-id "$MESH0_RUN_ID"',
      '--runner-token "$MESH0_RUNNER_TOKEN"',
    ].join(" "),
  ];

  return parts.join("\n");
}

async function monitorDockerRun({
  apiUrl,
  proc,
  runId,
}: {
  apiUrl: string;
  proc: ReturnType<typeof Bun.spawn>;
  runId: string;
}) {
  const [stdout, stderr, exitCode] = await Promise.all([
    readPipeText(proc.stdout),
    readPipeText(proc.stderr),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      redact(
        [
          `Docker runner failed for ${runId} with exit code ${exitCode}`,
          "stdout:",
          stdout,
          "stderr:",
          stderr,
        ].join("\n"),
        [apiUrl],
      ),
    );
  }
}

function readPipeText(stream: ReadableStream<Uint8Array> | number | undefined) {
  if (stream === undefined || typeof stream === "number") {
    throw new Error("Expected piped process output");
  }

  return new Response(stream).text();
}

function resolveDynamicValue(value: DynamicValue, name: string) {
  const resolved = typeof value === "function" ? value() : value;
  if (resolved.length === 0) {
    throw new Error(`${name} is required`);
  }

  return resolved;
}

function redact(value: string, secrets: string[]) {
  let output = value;
  for (const secret of secrets) {
    output = output.replaceAll(secret, "[redacted]");
  }

  return output;
}
