import { workspaceTreeResultSchema } from "@mesh0/sdk/schema";
import type { WorkspaceTreeEntry } from "@mesh0/sdk/types";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { endWritable, writeChunk } from "./io";

export async function materializeRunWorkspaceSource({
  apiUrl,
  currentRunId,
  log,
  runnerToken,
  workspace,
}: {
  apiUrl: string;
  currentRunId: string;
  log: (message: string) => Promise<void>;
  runnerToken: string;
  workspace: string;
}) {
  await log("restore workspace from source run");
  const tree = await fetchWorkspaceSourceTree({
    apiUrl,
    currentRunId,
    runnerToken,
  });
  const entries = [...tree.entries].sort(compareWorkspaceEntries);

  for (const entry of entries) {
    const absolutePath = join(workspace, entry.path);
    if (entry.type === "dir") {
      await mkdir(absolutePath, { recursive: true });
      await chmodIfPresent(absolutePath, entry.mode);
      continue;
    }

    await mkdir(dirname(absolutePath), { recursive: true });
    if (entry.type === "symlink") {
      if (entry.target === undefined) {
        throw new Error(`Workspace symlink target missing: ${entry.path}`);
      }

      await symlink(entry.target, absolutePath);
      continue;
    }

    await writeWorkspaceSourceFile({
      absolutePath,
      apiUrl,
      currentRunId,
      entry,
      runnerToken,
    });
    await chmodIfPresent(absolutePath, entry.mode);
  }
}

async function fetchWorkspaceSourceTree({
  apiUrl,
  currentRunId,
  runnerToken,
}: {
  apiUrl: string;
  currentRunId: string;
  runnerToken: string;
}) {
  const response = await fetch(
    new URL(
      `/runs/${encodeURIComponent(currentRunId)}/workspace-source/tree`,
      apiUrl,
    ),
    { headers: runnerHeaders(runnerToken) },
  );
  if (!response.ok) {
    throw new Error(
      `Workspace source tree failed with status ${response.status}: ${await response.text()}`,
    );
  }

  return workspaceTreeResultSchema.parse(await response.json());
}

async function writeWorkspaceSourceFile({
  absolutePath,
  apiUrl,
  currentRunId,
  entry,
  runnerToken,
}: {
  absolutePath: string;
  apiUrl: string;
  currentRunId: string;
  entry: WorkspaceTreeEntry;
  runnerToken: string;
}) {
  const url = new URL(
    `/runs/${encodeURIComponent(currentRunId)}/workspace-source/file`,
    apiUrl,
  );
  url.searchParams.set("path", entry.path);
  const response = await fetch(url, { headers: runnerHeaders(runnerToken) });
  if (!response.ok || response.body === null) {
    throw new Error(
      `Workspace source file failed with status ${response.status}: ${await response.text()}`,
    );
  }

  await pipeToFile(response.body, absolutePath);
}

async function pipeToFile(stream: ReadableStream<Uint8Array>, path: string) {
  const output = createWriteStream(path);
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        await endWritable(output);
        return;
      }

      await writeChunk(output, value);
    }
  } catch (error) {
    output.destroy();
    throw error;
  }
}

function runnerHeaders(runnerToken: string) {
  return {
    Authorization: `Bearer ${runnerToken}`,
  };
}

async function chmodIfPresent(path: string, mode: number | undefined) {
  if (mode !== undefined) {
    await chmod(path, mode & 0o7777);
  }
}

function compareWorkspaceEntries(
  left: WorkspaceTreeEntry,
  right: WorkspaceTreeEntry,
) {
  if (left.type === "dir" && right.type !== "dir") {
    return -1;
  }

  if (left.type !== "dir" && right.type === "dir") {
    return 1;
  }

  return left.path.localeCompare(right.path);
}
