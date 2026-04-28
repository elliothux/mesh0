import type { ContainerStartConfigOptions } from "@cloudflare/containers";
import type {
  RunnerSandbox,
  RunnerSandboxDispatch,
  RunnerSandboxStart,
} from "../index";

interface CloudflareContainer {
  start(options: ContainerStartConfigOptions): Promise<void>;
}

export class CloudflareSandbox implements RunnerSandbox {
  readonly #apiUrl: string;
  readonly #getContainer: (name: string) => CloudflareContainer;

  constructor({
    apiUrl,
    getContainer,
  }: {
    apiUrl: string;
    getContainer(name: string): CloudflareContainer;
  }) {
    this.#apiUrl = apiUrl;
    this.#getContainer = getContainer;
  }

  async start({ run }: RunnerSandboxStart): Promise<RunnerSandboxDispatch> {
    await this.#getContainer(run.id).start({
      envVars: {
        MESH0_API_URL: this.#apiUrl,
        MESH0_RUN_ID: run.id,
      },
      entrypoint: buildRunnerEntrypoint(),
      labels: { "mesh0.run_id": run.id },
    });

    return {};
  }
}

function buildRunnerEntrypoint() {
  return [
    "bash",
    "-lc",
    [
      "sleep 5",
      [
        "exec mesh0-runner run",
        "--runtime-dir /mesh0-runtime",
        "--workspace /workspace",
        "--output-dir /mesh0-runtime/output",
        '--api-url "$MESH0_API_URL"',
        '--run-id "$MESH0_RUN_ID"',
      ].join(" "),
    ].join("; "),
  ];
}
