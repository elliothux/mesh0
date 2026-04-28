import type { RpcClient } from "@mesh0/api";
import { threadEventSchema } from "@mesh0/sdk/schema";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OutputObject } from "./types";

export async function teeStream(
  stream: ReadableStream<Uint8Array>,
  path: string,
  onLine?: (line: string) => Promise<void>,
) {
  await mkdir(dirname(path), { recursive: true });
  const output = createWriteStream(path, { flags: "a" });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      await writeChunk(output, value);

      if (onLine !== undefined) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            await onLine(trimmed);
          }
        }
      }
    }

    if (onLine !== undefined) {
      buffer += decoder.decode();
      const trimmed = buffer.trim();
      if (trimmed.length > 0) {
        await onLine(trimmed);
      }
    }
  } finally {
    await endWritable(output);
  }
}

export function parseRuntimeEvent(line: string) {
  return threadEventSchema.parse(JSON.parse(line));
}

export function createApiClient(apiUrl: string): RpcClient {
  const link = new RPCLink({ url: `${apiUrl}/rpc` });
  return createORPCClient(link);
}

export async function createWorkspaceArtifacts({
  log,
  outputObjects,
  runId,
  workspace,
  workspaceOutputDir,
}: {
  log: (message: string) => Promise<void>;
  outputObjects: OutputObject[];
  runId: string;
  workspace: string;
  workspaceOutputDir: string;
}) {
  const snapshotPath = join(workspaceOutputDir, "snapshot.tar.gz");
  const snapshot = await runCommand("tar", [
    "-czf",
    snapshotPath,
    "-C",
    workspace,
    ".",
  ]);
  if (snapshot.exitCode === 0) {
    await collectIfFile(
      outputObjects,
      runId,
      snapshotPath,
      "workspace/snapshot.tar.gz",
    );
  } else {
    await log(`workspace snapshot failed: ${snapshot.stderr}`);
  }

  if (!(await pathExists(join(workspace, ".git")))) {
    return;
  }

  const diff = await runCommand("git", [
    "-C",
    workspace,
    "diff",
    "--binary",
    "HEAD",
  ]);
  if (diff.exitCode !== 0) {
    await log(`git diff failed: ${diff.stderr}`);
    return;
  }

  const diffPath = join(workspaceOutputDir, "git-diff.patch");
  await writeFile(diffPath, diff.stdout);
  await collectIfFile(
    outputObjects,
    runId,
    diffPath,
    "workspace/git-diff.patch",
  );
}

export async function collectIfFile(
  outputObjects: OutputObject[],
  runId: string,
  path: string,
  relativeKey: string,
) {
  const stats = await stat(path);
  if (!stats.isFile()) {
    return;
  }

  outputObjects.push({
    contentType: contentTypeForObjectKey(relativeKey),
    digest: `sha256:${await sha256File(path)}`,
    key: `runs/${runId}/output/${relativeKey}`,
    path,
    size: stats.size,
  });
}

export async function commandVersion(command: string, args: string[]) {
  const result = await runCommand(command, args);
  const output = result.stdout.trim() || result.stderr.trim();
  return output.length === 0 ? "unknown" : output;
}

interface RunCommandOptions {
  check?: boolean;
  secrets?: string[];
}

export async function runCommand(
  command: string,
  args: string[],
  { check = false, secrets = [] }: RunCommandOptions = {},
) {
  const proc = Bun.spawn([command, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (check && exitCode !== 0) {
    throw new Error(
      redact(
        [
          `${command} ${args.join(" ")} failed with exit code ${exitCode}`,
          stdout,
          stderr,
        ].join("\n"),
        secrets,
      ),
    );
  }

  return { exitCode, stderr, stdout };
}

export async function readJsonFile(path: string) {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return value;
}

export async function readJsonFileIfExists(path: string) {
  if (!(await pathExists(path))) {
    return undefined;
  }

  return readJsonFile(path);
}

export async function readTextIfExists(path: string) {
  if (!(await pathExists(path))) {
    return "";
  }

  return readFile(path, "utf8");
}

export async function appendLine(path: string, message: string) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${new Date().toISOString()} ${message}\n`);
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function writeChunk(
  output: ReturnType<typeof createWriteStream>,
  chunk: Uint8Array,
) {
  if (output.write(chunk)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    output.once("drain", resolve);
    output.once("error", reject);
  });
}

function endWritable(output: ReturnType<typeof createWriteStream>) {
  return new Promise<void>((resolve, reject) => {
    output.end(resolve);
    output.once("error", reject);
  });
}

function contentTypeForObjectKey(key: string) {
  if (key.endsWith(".json")) {
    return "application/json";
  }

  if (key.endsWith(".jsonl")) {
    return "application/x-ndjson";
  }

  if (key.endsWith(".tar.gz")) {
    return "application/gzip";
  }

  if (key.endsWith(".patch")) {
    return "text/x-patch";
  }

  return "text/plain";
}

function redact(value: string, secrets: string[]) {
  let output = value;
  for (const secret of secrets) {
    output = output.replaceAll(secret, "[redacted]");
  }

  return output;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
