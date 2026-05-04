import type { RpcClient } from "@mesh0/api";
import { threadEventSchema } from "@mesh0/sdk/schema";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
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

export function createApiClient(
  apiUrl: string,
  runnerToken: string,
): RpcClient {
  const link = new RPCLink({
    headers: () => ({ Authorization: `Bearer ${runnerToken}` }),
    url: `${apiUrl}/rpc`,
  });
  return createORPCClient(link);
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
    contentType: contentTypeForPath(relativeKey),
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

export function writeChunk(
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

export function endWritable(output: ReturnType<typeof createWriteStream>) {
  return new Promise<void>((resolve, reject) => {
    output.end(resolve);
    output.once("error", reject);
  });
}

export function contentTypeForPath(path: string) {
  const name = basename(path).toLowerCase();

  if (name.endsWith(".json")) {
    return "application/json";
  }

  if (name.endsWith(".jsonl")) {
    return "application/x-ndjson";
  }

  if (name.endsWith(".tar.gz")) {
    return "application/gzip";
  }

  if (name.endsWith(".patch")) {
    return "text/x-patch";
  }

  if (name.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (name.endsWith(".png")) {
    return "image/png";
  }

  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (name.endsWith(".gif")) {
    return "image/gif";
  }

  if (name.endsWith(".webp")) {
    return "image/webp";
  }

  if (name.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (name.endsWith(".webm")) {
    return "video/webm";
  }

  if (name.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (name.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (name.endsWith(".wav")) {
    return "audio/wav";
  }

  if (name.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (isTextFileName(name)) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function isTextFileName(name: string) {
  const textExtensions = [
    ".css",
    ".csv",
    ".env",
    ".html",
    ".js",
    ".jsx",
    ".md",
    ".mdx",
    ".mjs",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
  ];

  return textExtensions.some((extension) => name.endsWith(extension));
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
