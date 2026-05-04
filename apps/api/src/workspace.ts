import { workspaceSnapshotManifestSchema } from "@mesh0/sdk/schema";
import type {
  WorkspaceSnapshotFileEntry,
  WorkspaceSnapshotManifest,
  WorkspaceSnapshotSegment,
  WorkspaceTreeEntry,
} from "@mesh0/sdk/types";
import { RunNotFoundError } from "@mesh0/services/run";
import { ORPCError } from "@orpc/server";
import {
  authenticateContextRunner,
  authenticateContextUser,
  type Context,
} from "./context";

const workspaceRoutePattern =
  /^\/runs\/([^/]+)\/workspace\/(tree|file|download)$/;
const workspaceSourceRoutePattern =
  /^\/runs\/([^/]+)\/workspace-source\/(tree|file)$/;
const workspaceManifestPath = "output/workspace/manifest.json";

export async function handleRunWorkspaceRequest(
  request: Request,
  context: Context,
) {
  const url = new URL(request.url);
  const workspaceMatch = workspaceRoutePattern.exec(url.pathname);
  if (workspaceMatch !== null) {
    return handleUserWorkspaceRequest({
      context,
      match: workspaceMatch,
      request,
      url,
    });
  }

  const sourceMatch = workspaceSourceRoutePattern.exec(url.pathname);
  if (sourceMatch !== null) {
    return handleSourceWorkspaceRequest({
      context,
      match: sourceMatch,
      request,
      url,
    });
  }

  return undefined;
}

async function handleUserWorkspaceRequest({
  context,
  match,
  request,
  url,
}: {
  context: Context;
  match: RegExpExecArray;
  request: Request;
  url: URL;
}) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const encodedRunId = match[1];
  const action = match[2];
  if (encodedRunId === undefined || action === undefined) {
    return undefined;
  }

  const runId = decodeURIComponent(encodedRunId);
  const authResponse = await authenticateRunAccess({ context, runId });
  if (authResponse !== undefined) {
    return authResponse;
  }

  const manifest = await readWorkspaceManifest({ context, runId });
  if (manifest === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  if (action === "tree") {
    return Response.json({
      entries: manifest.entries.map(workspaceTreeEntry),
    });
  }

  const path = parseWorkspacePath(url.searchParams.get("path"));
  if (path instanceof Response) {
    return path;
  }

  if (path.length === 0) {
    return new Response("Missing file path", { status: 400 });
  }

  const entry = manifest.entries.find(
    (item): item is WorkspaceSnapshotFileEntry =>
      item.type === "file" && item.path === path,
  );
  if (entry === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Length": String(entry.size),
    "Content-Type": entry.contentType ?? "application/octet-stream",
    "X-Mesh0-Workspace-File-Size": String(entry.size),
  });
  if (action === "download") {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${downloadFileName(entry.path)}"`,
    );
  }

  return new Response(
    streamWorkspaceFile({
      context,
      entry,
      runId,
    }),
    { headers },
  );
}

async function handleSourceWorkspaceRequest({
  context,
  match,
  request,
  url,
}: {
  context: Context;
  match: RegExpExecArray;
  request: Request;
  url: URL;
}) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const encodedRunId = match[1];
  const action = match[2];
  if (encodedRunId === undefined || action === undefined) {
    return undefined;
  }

  const runId = decodeURIComponent(encodedRunId);
  const authResponse = await authenticateRunnerAccess({ context, runId });
  if (authResponse !== undefined) {
    return authResponse;
  }

  const source = await context.services.run.workspaceSource({ runId });
  if (source === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  const manifest = await readWorkspaceManifest({
    context,
    runId: source.runId,
  });
  if (manifest === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  const sourcePath = parseWorkspacePath(source.path ?? null);
  if (sourcePath instanceof Response) {
    return sourcePath;
  }

  const scopedEntries = scopeManifestEntries({ manifest, sourcePath });
  if (scopedEntries instanceof Response) {
    return scopedEntries;
  }

  if (action === "tree") {
    return Response.json({
      entries: scopedEntries.map(workspaceTreeEntry),
    });
  }

  const path = parseWorkspacePath(url.searchParams.get("path"));
  if (path instanceof Response) {
    return path;
  }

  if (path.length === 0) {
    return new Response("Missing file path", { status: 400 });
  }

  const entry = scopedEntries.find(
    (item): item is WorkspaceSnapshotFileEntry =>
      item.type === "file" && item.path === path,
  );
  if (entry === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(
    streamWorkspaceFile({
      context,
      entry,
      runId: source.runId,
    }),
    {
      headers: {
        "Content-Length": String(entry.size),
        "Content-Type": entry.contentType ?? "application/octet-stream",
      },
    },
  );
}

async function authenticateRunAccess({
  context,
  runId,
}: {
  context: Context;
  runId: string;
}) {
  try {
    const user = await authenticateContextUser(context);
    await context.services.run.get({
      runId,
      userId: user.id,
    });
    return undefined;
  } catch (error) {
    if (error instanceof ORPCError) {
      return new Response(error.message, { status: error.status });
    }

    if (error instanceof RunNotFoundError) {
      return new Response("Not Found", { status: 404 });
    }

    throw error;
  }
}

async function authenticateRunnerAccess({
  context,
  runId,
}: {
  context: Context;
  runId: string;
}) {
  try {
    await authenticateContextRunner(context, runId);
    return undefined;
  } catch (error) {
    if (error instanceof ORPCError) {
      return new Response(error.message, { status: error.status });
    }

    if (error instanceof RunNotFoundError) {
      return new Response("Not Found", { status: 404 });
    }

    throw error;
  }
}

async function readWorkspaceManifest({
  context,
  runId,
}: {
  context: Context;
  runId: string;
}): Promise<WorkspaceSnapshotManifest | undefined> {
  const object = await context.storage.get({
    path: workspaceManifestPath,
    runId,
  });
  if (object === undefined) {
    return undefined;
  }

  return workspaceSnapshotManifestSchema.parse(
    await new Response(object.body).json(),
  );
}

function workspaceTreeEntry(
  entry: WorkspaceSnapshotManifest["entries"][number],
) {
  const treeEntry: WorkspaceTreeEntry = {
    mode: entry.mode,
    path: entry.path,
    type: entry.type,
  };
  if (entry.type === "file") {
    return {
      ...treeEntry,
      contentType: entry.contentType,
      size: entry.size,
    };
  }

  if (entry.type === "symlink") {
    return {
      ...treeEntry,
      target: entry.target,
    };
  }

  return treeEntry;
}

function scopeManifestEntries({
  manifest,
  sourcePath,
}: {
  manifest: WorkspaceSnapshotManifest;
  sourcePath: string;
}) {
  if (sourcePath.length === 0) {
    return manifest.entries;
  }

  const root = manifest.entries.find((entry) => entry.path === sourcePath);
  if (root?.type !== "dir") {
    return new Response("Workspace source path must be a directory", {
      status: 400,
    });
  }

  const prefix = `${sourcePath}/`;
  return manifest.entries
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => ({
      ...entry,
      path: entry.path.slice(prefix.length),
    }));
}

function streamWorkspaceFile({
  context,
  entry,
  runId,
}: {
  context: Context;
  entry: WorkspaceSnapshotFileEntry;
  runId: string;
}) {
  let segmentIndex = 0;
  let reader: WorkspaceSegmentReader | undefined;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        let activeReader = reader;
        if (activeReader === undefined) {
          const segment = nextNonEmptySegment(entry.segments, segmentIndex);
          segmentIndex = segment.nextIndex;
          if (segment.value === undefined) {
            controller.close();
            return;
          }

          const object = await context.storage.getRange({
            length: segment.value.length,
            offset: segment.value.offset,
            path: segment.value.key,
            runId,
          });
          if (object === undefined) {
            throw new Error(
              `Missing workspace pack segment: ${segment.value.key}`,
            );
          }

          activeReader = object.body.getReader();
          reader = activeReader;
        }

        const { done, value } = await activeReader.read();
        if (done) {
          reader = undefined;
          continue;
        }

        controller.enqueue(value);
        return;
      }
    },
    async cancel(reason) {
      await reader?.cancel(reason);
    },
  });
}

type WorkspaceSegmentReader = {
  cancel(reason?: unknown): Promise<void>;
  read(): Promise<
    | {
        done: false;
        value: Uint8Array;
      }
    | {
        done: true;
        value?: Uint8Array;
      }
  >;
};

function nextNonEmptySegment(
  segments: WorkspaceSnapshotSegment[],
  startIndex: number,
) {
  for (let index = startIndex; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment !== undefined && segment.length > 0) {
      return { nextIndex: index + 1, value: segment };
    }
  }

  return { nextIndex: segments.length, value: undefined };
}

function parseWorkspacePath(value: string | null) {
  if (value === null) {
    return "";
  }

  const parts = value.split("/").filter((part) => part.length > 0);
  if (parts.includes("..")) {
    return new Response(`Invalid workspace path: ${value}`, {
      status: 400,
    });
  }

  return parts.join("/");
}

function downloadFileName(path: string) {
  return (path.split("/").at(-1) ?? "download").replaceAll('"', "");
}
