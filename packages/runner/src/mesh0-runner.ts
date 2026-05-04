#!/usr/bin/env bun

import { kindForArtifactPath } from "@mesh0/adapters/utils";
import type { RpcClient } from "@mesh0/api";
import { artifactRefSchema } from "@mesh0/sdk/schema";
import type { ArtifactRef, RunnerRunConfig } from "@mesh0/sdk/types";
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
  parseRuntimeEvent,
  readJsonFile,
  readJsonFileIfExists,
  readTextIfExists,
  runCommand,
  teeStream,
} from "./io";
import { prepareSkills } from "./skills";
import type { OutputObject, RunnerOptions, RunnerStatus } from "./types";
import {
  WORKSPACE_ARTIFACT_STORAGE_PATH,
  createWorkspaceSnapshot,
} from "./workspace-snapshot";
import { materializeRunWorkspaceSource } from "./workspace-source";

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

  const apiClient =
    options.apiUrl === undefined
      ? undefined
      : createApiClient(options.apiUrl, requireRunnerToken(options));
  const config = await readRunnerConfig({
    apiClient,
    runId: options.runId,
    runJsonPath,
  });
  const runId = options.runId ?? config.runId ?? `run_${nanoid()}`;
  const baseInstructions =
    config.baseInstructions ?? resolveSystemPrompt(config.systemPrompt);

  try {
    await prepareWorkspace({
      apiUrl: options.apiUrl,
      config,
      log,
      runId,
      runnerToken: options.runnerToken,
      workspace,
    });
    const preparedSkills = await prepareSkills({ config, log, runtimeDir });
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

    const prompt = buildPrompt({
      config,
      preparedSkills,
      runId,
      runtimeDir,
      workspace,
    });
    const codexBin = process.env.MESH0_CODEX_BIN ?? "codex";
    const codexArgs = buildCodexArgs({
      lastMessagePath: paths.lastMessagePath,
      model: config.env.OPENAI_MODEL,
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
        ...config.env,
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

    const status: RunnerStatus = exitCode === 0 ? "completed" : "failed";
    const lastMessage = await readTextIfExists(paths.lastMessagePath);
    await log(`run ${runId} ${status}`);

    const outputObjects = await collectOutputObjects({
      config,
      paths,
      runId,
      workspace,
    });

    await writeOutputManifest({
      outputObjects,
      manifestPath: paths.manifestPath,
      runId,
      status,
    });

    const artifacts = await buildCompletionArtifacts({
      apiClient,
      outputObjects,
      runId,
    });

    await maybeCompleteApiRun({
      apiClient,
      artifacts,
      lastMessage,
      runId,
      status,
    });

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  } catch (error) {
    const message = formatError(error);
    await log(`run ${runId} failed: ${message}`);
    await maybeCompleteApiRun({
      apiClient,
      artifacts: [],
      lastMessage: message,
      runId,
      status: "failed",
    });
    throw error;
  }
}

function parseOptions(args: string[]): RunnerOptions {
  const runtimeDir = process.env.MESH0_RUNTIME_DIR ?? "/mesh0-runtime";
  const workspace = process.env.MESH0_WORKSPACE ?? "/workspace";
  const outputDir = process.env.MESH0_OUTPUT_DIR ?? join(runtimeDir, "output");
  const options: RunnerOptions = {
    outputDir,
    runJson: process.env.MESH0_RUN_JSON ?? join(runtimeDir, "run.json"),
    runnerToken: process.env.MESH0_RUNNER_TOKEN,
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

    if (arg === "--runner-token") {
      options.runnerToken = readOptionValue(args, (index += 1), arg);
      continue;
    }

    throw new Error(`Unknown run option: ${arg}`);
  }

  return options;
}

function requireRunnerToken({ runnerToken }: { runnerToken?: string }) {
  if (runnerToken === undefined || runnerToken.length === 0) {
    throw new Error("runnerToken is required when apiUrl is provided");
  }

  return runnerToken;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readRunnerConfig({
  apiClient,
  runId,
  runJsonPath,
}: {
  apiClient: RpcClient | undefined;
  runId: string | undefined;
  runJsonPath: string;
}) {
  const fileConfig = await readJsonFileIfExists(runJsonPath);
  if (fileConfig !== undefined) {
    return parseRunConfig(fileConfig);
  }

  if (apiClient !== undefined && runId !== undefined) {
    return parseRunConfig(await apiClient.runs.input({ runId }));
  }

  return parseRunConfig(await readJsonFile(runJsonPath));
}

async function prepareWorkspace({
  apiUrl,
  config,
  log,
  runId,
  runnerToken,
  workspace,
}: {
  apiUrl: string | undefined;
  config: RunnerRunConfig;
  log: (message: string) => Promise<void>;
  runId: string;
  runnerToken: string | undefined;
  workspace: string;
}) {
  const source = config.workspace?.source;
  if (source === undefined) {
    return;
  }

  if (source.type === "run") {
    if (apiUrl === undefined) {
      throw new Error("apiUrl is required for run workspace source");
    }

    await materializeRunWorkspaceSource({
      apiUrl,
      currentRunId: runId,
      log,
      runnerToken: requireRunnerToken({ runnerToken }),
      workspace,
    });
    return;
  }

  await log(`clone ${redactGitUrl(source.url)}`);
  await runCommand("git", ["clone", source.url, workspace], {
    check: true,
    secrets: [source.url],
  });
  if (source.ref !== undefined) {
    await log(`checkout ${source.ref}`);
    await runCommand("git", ["-C", workspace, "checkout", source.ref], {
      check: true,
    });
  }
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
  model: string;
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
    "--model",
    model,
    "--config",
    `approval_policy="${approvalPolicy}"`,
  ];

  args.push(prompt);
  return args;
}

async function collectOutputObjects({
  config,
  paths,
  runId,
  workspace,
}: {
  config: RunnerRunConfig;
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
  await collectIfFile(
    outputObjects,
    runId,
    paths.runnerLogPath,
    "mesh0/runner.log",
  );
  const workspaceSnapshot = await createWorkspaceSnapshot({
    ignorePatterns: config.workspace?.ignorePatterns,
    runId,
    workspace,
    workspaceOutputDir: paths.workspaceOutputDir,
  });
  outputObjects.push(...workspaceSnapshot.outputObjects);
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

async function buildCompletionArtifacts({
  apiClient,
  outputObjects,
  runId,
}: {
  apiClient: RpcClient | undefined;
  outputObjects: OutputObject[];
  runId: string;
}): Promise<ArtifactRef[]> {
  if (apiClient === undefined) {
    return outputObjects.map((object) => {
      const path = outputObjectStoragePath(object, runId);
      const artifact: ArtifactRef = {
        contentType: object.contentType,
        id: object.key,
        kind: kindForArtifactPath(path),
        runId,
        uri: object.path,
      };

      if (path !== WORKSPACE_ARTIFACT_STORAGE_PATH) {
        return artifact;
      }

      const workspaceArtifact: ArtifactRef = {
        ...artifact,
        kind: "directory",
        name: "workspace",
      };
      return workspaceArtifact;
    });
  }

  const artifacts: ArtifactRef[] = [];
  for (const object of outputObjects) {
    const path = outputObjectStoragePath(object, runId);
    const artifact = await uploadOutputObject({
      apiClient,
      object,
      runId,
    });
    if (path !== WORKSPACE_ARTIFACT_STORAGE_PATH) {
      artifacts.push(artifact);
      continue;
    }

    artifacts.push({
      ...artifact,
      kind: "directory",
      name: "workspace",
    });
  }

  return artifacts;
}

async function uploadOutputObject({
  apiClient,
  object,
  runId,
}: {
  apiClient: RpcClient;
  object: OutputObject;
  runId: string;
}) {
  return artifactRefSchema.parse(
    await apiClient.runs.uploadArtifact({
      file: Bun.file(object.path, { type: object.contentType }),
      path: outputObjectStoragePath(object, runId),
      runId,
    }),
  );
}

function outputObjectStoragePath(object: OutputObject, runId: string) {
  const prefix = `runs/${runId}/`;
  if (!object.key.startsWith(prefix)) {
    throw new Error(`Unexpected output object key: ${object.key}`);
  }

  return object.key.slice(prefix.length);
}

async function maybeCompleteApiRun({
  apiClient,
  artifacts,
  lastMessage,
  runId,
  status,
}: {
  apiClient: RpcClient | undefined;
  artifacts: ArtifactRef[];
  lastMessage: string;
  runId: string;
  status: RunnerStatus;
}) {
  if (apiClient === undefined) {
    return;
  }

  await apiClient.runs.complete({
    completion: {
      artifacts,
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
  mesh0-runner run [--runtime-dir DIR] [--workspace DIR] [--output-dir DIR] [--run-json FILE] [--api-url URL] [--run-id ID] [--runner-token TOKEN]`);
}

function readOptionValue(args: string[], index: number, option: string) {
  const value = args[index];
  if (value === undefined) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function redactGitUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.username.length > 0) {
      parsed.username = "[redacted]";
    }
    if (parsed.password.length > 0) {
      parsed.password = "[redacted]";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
