import { resolve } from "node:path";
import { readSmokeEnv, runSdkUserFlow } from "./support/user-flow";

const ROOT_DIR = resolve(import.meta.dir, "..");
const WORKER_API_URL =
  process.env.MESH0_WORKER_API_URL ?? "http://127.0.0.1:5592";
const WORKER_READY_URL =
  process.env.MESH0_WORKER_READY_URL ?? "http://127.0.0.1:5592";
const ARM64_CONTAINER_EGRESS_IMAGE =
  "cloudflare/proxy-everything:main@sha256:ebe64ae8efbc0a020dcb9242377f9d981895755a2c59b928501e59d5d293e95a";

const smokeEnv = readSmokeEnv();

await runChecked(["bun", "run", "db:migrate"], {
  cwd: ROOT_DIR,
});

const apiDev = Bun.spawn(["bun", "run", "api:dev"], {
  cwd: ROOT_DIR,
  env: await apiDevEnv(),
  stderr: "pipe",
  stdout: "pipe",
});
const outputTask = Promise.all([
  forwardOutput(apiDev.stdout, process.stdout),
  forwardOutput(apiDev.stderr, process.stderr),
]);

try {
  await waitForApiDev(apiDev);
  await runSdkUserFlow({
    apiKey: smokeEnv.mesh0ApiKey,
    apiUrl: WORKER_API_URL,
    env: smokeEnv.openai,
    label: "worker-api-dev-smoke",
  });
} finally {
  apiDev.kill();
  await apiDev.exited;
  await outputTask;
}

async function waitForApiDev(proc: ReturnType<typeof Bun.spawn>) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const exitCode = await Promise.race([
      proc.exited,
      sleep(500).then(() => undefined),
    ]);
    if (exitCode !== undefined) {
      throw new Error(`api dev exited before it was ready: ${exitCode}`);
    }

    try {
      await fetch(WORKER_READY_URL);
      return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`api dev did not become ready at ${WORKER_READY_URL}`);
}

async function runChecked(command: string[], { cwd }: { cwd: string }) {
  const proc = Bun.spawn(command, {
    cwd,
    env: {
      ...process.env,
      CI: "1",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `${command.join(" ")} failed with exit code ${exitCode}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }
}

async function apiDevEnv() {
  const env = {
    ...process.env,
    CI: "1",
  };

  if (env.MINIFLARE_CONTAINER_EGRESS_IMAGE !== undefined) {
    return env;
  }

  const arch = await dockerArchitecture();
  if (arch === "aarch64" || arch === "arm64") {
    env.MINIFLARE_CONTAINER_EGRESS_IMAGE = ARM64_CONTAINER_EGRESS_IMAGE;
  }

  return env;
}

async function dockerArchitecture() {
  const proc = Bun.spawn(["docker", "info", "--format", "{{.Architecture}}"], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      [`docker info failed with exit code ${exitCode}`, stdout, stderr].join(
        "\n",
      ),
    );
  }

  return stdout.trim();
}

async function forwardOutput(
  stream: ReadableStream<Uint8Array> | number | undefined,
  output: NodeJS.WriteStream,
) {
  if (stream === undefined || typeof stream === "number") {
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      output.write(decoder.decode());
      return;
    }

    output.write(decoder.decode(value, { stream: true }));
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
