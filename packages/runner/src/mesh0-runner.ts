#!/usr/bin/env bun

import type { RpcClient } from "@mesh0/api";
import { resolveSystemPrompt } from "@mesh0/services/system-prompt";
import { nanoid } from "nanoid";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildPrompt, parseRunConfig, renderConfigToml } from "./config";
import {
  appendLine,
  collectIfFile,
  commandVersion,
  createApiClient,
  createWorkspaceArtifacts,
  kindForObjectKey,
  parseRuntimeEvent,
  readJsonFile,
  readTextIfExists,
  teeStream,
} from "./io";
import type { OutputObject, RunnerOptions, RunnerStatus } from "./types";

await main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === undefined) {
    await printReady();
    return;
  }

  if (command === "run") {
    await run(parseOptions(args));
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function run(options: RunnerOptions) {
  const runtimeDir = resolve(options.runtimeDir);
  const workspace = resolve(options.workspace);
  const outputDir = resolve(options.outputDir);
  const runJsonPath = resolve(options.runJson);
  const paths = await prepareOutputDirs({ outputDir, runtimeDir, workspace });
  const log = (message: string) => appendLine(paths.runnerLogPath, message);

  const config = parseRunConfig(await readJsonFile(runJsonPath));
  const runId = options.runId ?? config.runId ?? `run_${nanoid()}`;
  const baseInstructions =
    config.baseInstructions ?? resolveSystemPrompt(config.systemPrompt);

  await writeFile(
    join(runtimeDir, "config.toml"),
    renderConfigToml(config, baseInstructions),
  );
  await writeFile(paths.execJsonlPath, "");
  await writeFile(paths.stderrPath, "");
  await writeFile(paths.lastMessagePath, "");

  await log(`run ${runId} started`);
  await log(`runtimeDir=${runtimeDir}`);
  await log(`workspace=${workspace}`);
  await log(`outputDir=${outputDir}`);

  const prompt = buildPrompt({ config, runId, runtimeDir, workspace });
  const codexBin = process.env.MESH0_CODEX_BIN ?? "codex";
  const apiClient =
    options.apiUrl === undefined ? undefined : createApiClient(options.apiUrl);
  const codexArgs = buildCodexArgs({
    lastMessagePath: paths.lastMessagePath,
    model: config.model,
    prompt,
    sandbox: config.sandbox ?? "workspace-write",
    approvalPolicy: config.approvalPolicy ?? "never",
    workspace,
  });

  await log(`exec ${codexBin} ${codexArgs.slice(0, -1).join(" ")} <prompt>`);

  const proc = Bun.spawn([codexBin, ...codexArgs], {
    cwd: workspace,
    env: {
      ...process.env,
      CODEX_HOME: runtimeDir,
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  const stdoutTask = teeStream(
    proc.stdout,
    paths.execJsonlPath,
    async (line) => {
      const event = parseRuntimeEvent(line);
      if (apiClient !== undefined) {
        await apiClient.runs.appendEvents({ events: event, runId });
      }
    },
  );
  const stderrTask = teeStream(proc.stderr, paths.stderrPath);
  const [exitCode] = await Promise.all([proc.exited, stdoutTask, stderrTask]);

  await log(`codex exited with code ${exitCode}`);

  const outputObjects = await collectOutputObjects({
    paths,
    runId,
    workspace,
    log,
  });
  const status: RunnerStatus = exitCode === 0 ? "completed" : "failed";
  const lastMessage = await readTextIfExists(paths.lastMessagePath);

  await writeOutputManifest({
    outputObjects,
    manifestPath: paths.manifestPath,
    runId,
    status,
  });

  await maybeCompleteApiRun({
    apiClient,
    lastMessage,
    outputObjects,
    runId,
    status,
  });

  await log(`run ${runId} ${status}`);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function parseOptions(args: string[]): RunnerOptions {
  const runtimeDir = process.env.MESH0_RUNTIME_DIR ?? "/mesh0-runtime";
  const workspace = process.env.MESH0_WORKSPACE ?? "/workspace";
  const outputDir = process.env.MESH0_OUTPUT_DIR ?? join(runtimeDir, "output");
  const options: RunnerOptions = {
    outputDir,
    runJson: process.env.MESH0_RUN_JSON ?? join(runtimeDir, "run.json"),
    runtimeDir,
    workspace,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--runtime-dir") {
      options.runtimeDir = readOptionValue(args, (index += 1), arg);
      continue;
    }

    if (arg === "--workspace") {
      options.workspace = readOptionValue(args, (index += 1), arg);
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = readOptionValue(args, (index += 1), arg);
      continue;
    }

    if (arg === "--run-json") {
      options.runJson = readOptionValue(args, (index += 1), arg);
      continue;
    }

    if (arg === "--api-url") {
      options.apiUrl = readOptionValue(args, (index += 1), arg).replace(
        /\/$/,
        "",
      );
      continue;
    }

    if (arg === "--run-id") {
      options.runId = readOptionValue(args, (index += 1), arg);
      continue;
    }

    throw new Error(`Unknown run option: ${arg}`);
  }

  return options;
}

async function prepareOutputDirs({
  outputDir,
  runtimeDir,
  workspace,
}: {
  outputDir: string;
  runtimeDir: string;
  workspace: string;
}) {
  await mkdir(runtimeDir, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const codexOutputDir = join(outputDir, "codex");
  const mesh0OutputDir = join(outputDir, "mesh0");
  const workspaceOutputDir = join(outputDir, "workspace");
  await mkdir(codexOutputDir, { recursive: true });
  await mkdir(mesh0OutputDir, { recursive: true });
  await mkdir(workspaceOutputDir, { recursive: true });

  return {
    execJsonlPath: join(codexOutputDir, "exec.jsonl"),
    lastMessagePath: join(codexOutputDir, "last-message.txt"),
    manifestPath: join(mesh0OutputDir, "output-manifest.json"),
    runnerLogPath: join(mesh0OutputDir, "runner.log"),
    stderrPath: join(codexOutputDir, "stderr.log"),
    workspaceOutputDir,
  };
}

function buildCodexArgs({
  approvalPolicy,
  lastMessagePath,
  model,
  prompt,
  sandbox,
  workspace,
}: {
  approvalPolicy: string;
  lastMessagePath: string;
  model?: string;
  prompt: string;
  sandbox: string;
  workspace: string;
}) {
  const args = [
    "exec",
    "--json",
    "--cd",
    workspace,
    "--sandbox",
    sandbox,
    "--skip-git-repo-check",
    "--output-last-message",
    lastMessagePath,
    "--config",
    `approval_policy="${approvalPolicy}"`,
  ];

  if (model !== undefined) {
    args.push("--model", model);
  }

  args.push(prompt);
  return args;
}

async function collectOutputObjects({
  log,
  paths,
  runId,
  workspace,
}: {
  log: (message: string) => Promise<void>;
  paths: Awaited<ReturnType<typeof prepareOutputDirs>>;
  runId: string;
  workspace: string;
}) {
  const outputObjects: OutputObject[] = [];
  await collectIfFile(
    outputObjects,
    runId,
    paths.execJsonlPath,
    "codex/exec.jsonl",
  );
  await collectIfFile(
    outputObjects,
    runId,
    paths.stderrPath,
    "codex/stderr.log",
  );
  await collectIfFile(
    outputObjects,
    runId,
    paths.lastMessagePath,
    "codex/last-message.txt",
  );
  await createWorkspaceArtifacts({
    log,
    outputObjects,
    runId,
    workspace,
    workspaceOutputDir: paths.workspaceOutputDir,
  });
  return outputObjects;
}

async function writeOutputManifest({
  manifestPath,
  outputObjects,
  runId,
  status,
}: {
  manifestPath: string;
  outputObjects: OutputObject[];
  runId: string;
  status: RunnerStatus;
}) {
  await writeFile(
    manifestPath,
    `${JSON.stringify({ objects: outputObjects, runId, status }, null, 2)}\n`,
  );
  await collectIfFile(
    outputObjects,
    runId,
    manifestPath,
    "mesh0/output-manifest.json",
  );
}

async function maybeCompleteApiRun({
  apiClient,
  lastMessage,
  outputObjects,
  runId,
  status,
}: {
  apiClient: RpcClient | undefined;
  lastMessage: string;
  outputObjects: OutputObject[];
  runId: string;
  status: RunnerStatus;
}) {
  if (apiClient === undefined) {
    return;
  }

  await apiClient.runs.complete({
    completion: {
      artifacts: outputObjects.map((object) => ({
        id: object.digest,
        kind: kindForObjectKey(object.key),
        runId,
        uri: object.path,
      })),
      lastMessage,
      status,
    },
    runId,
  });
}

async function printReady() {
  console.log("mesh0-runner image is ready");
  console.log(`codex: ${await commandVersion("codex", ["--version"])}`);
  console.log(`node: ${await commandVersion("node", ["--version"])}`);
  console.log(`npm: ${await commandVersion("npm", ["--version"])}`);
  console.log(`python: ${await commandVersion("python", ["--version"])}`);
  console.log(`uv: ${await commandVersion("uv", ["--version"])}`);
  console.log(`bun: ${await commandVersion("bun", ["--version"])}`);
  console.log(`git: ${await commandVersion("git", ["--version"])}`);
}

function printHelp() {
  console.log(`Usage:
  mesh0-runner
  mesh0-runner run [--runtime-dir DIR] [--workspace DIR] [--output-dir DIR] [--run-json FILE] [--api-url URL] [--run-id ID]`);
}

function readOptionValue(args: string[], index: number, option: string) {
  const value = args[index];
  if (value === undefined) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}
