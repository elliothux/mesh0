import { parseRunStoragePathname } from "@mesh0/sdk/artifacts";
import { workspaceTreeResultSchema } from "@mesh0/sdk/schema";
import type { ArtifactRef, WorkspaceTreeEntry } from "@mesh0/sdk/types";
import { buttonVariants } from "@mesh0/ui/button";
import { cn } from "@mesh0/ui/lib/utils";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { IconDownload } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { CopyablePre } from "../../components/dashboard-fields";
import { DashboardState } from "../../components/dashboard-page";
import { apiClient, apiUrl } from "../../lib/api";

type RunArtifactsSearch = z.infer<typeof runArtifactsSearchSchema>;
type FileTreeStyle = CSSProperties & {
  "--trees-bg-override": string;
  "--trees-border-color-override": string;
  "--trees-fg-override": string;
};

const runArtifactsSearchSchema = z.strictObject({
  path: z.string().min(1).optional(),
});
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const defaultRunArtifactsSearch: RunArtifactsSearch = {};
const fallbackRunArtifactsSearchSchema = runArtifactsSearchSchema.catch(
  defaultRunArtifactsSearch,
);
const fileTreeStyle: FileTreeStyle = {
  "--trees-bg-override": "transparent",
  "--trees-border-color-override": "var(--mesh-line)",
  "--trees-fg-override": "var(--mesh-white)",
  height: "42rem",
};

export const Route = createFileRoute("/_dashboard/run/$runId/artifacts")({
  validateSearch: (search): RunArtifactsSearch =>
    fallbackRunArtifactsSearchSchema.parse(search),
  component: RunArtifactsPage,
});

function RunArtifactsPage() {
  const { runId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const treeQuery = useQuery({
    queryFn: () => fetchWorkspaceTree(runId),
    queryKey: ["workspace-tree", runId],
  });
  const runQuery = useQuery({
    queryFn: () => apiClient.runs.get({ runId }),
    queryKey: ["run", runId],
  });
  const entries = treeQuery.data?.entries ?? [];
  const rawArtifacts = useMemo(
    () =>
      (runQuery.data?.artifacts ?? []).filter(
        (artifact) => !isWorkspaceDirectoryArtifact(artifact),
      ),
    [runQuery.data?.artifacts],
  );
  const treePaths = useMemo(
    () => entries.map(workspaceTreePath).filter((path) => path.length > 0),
    [entries],
  );
  const selectedEntry = useMemo(
    () =>
      search.path === undefined
        ? undefined
        : entries.find((entry) => entry.path === search.path),
    [entries, search.path],
  );
  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    initialExpansion: 2,
    initialSelectedPaths:
      selectedEntry === undefined ? [] : [workspaceTreePath(selectedEntry)],
    onSelectionChange: (selectedPaths) => {
      const selectedPath = selectedPaths.at(-1);
      void navigate({
        search: {
          path:
            selectedPath === undefined
              ? undefined
              : normalizeSelectedTreePath(selectedPath),
        },
      });
    },
    paths: treePaths,
    search: true,
  });

  useEffect(() => {
    model.resetPaths(treePaths);
  }, [model, treePaths]);

  useEffect(() => {
    if (selectedEntry === undefined) {
      return;
    }

    const treePath = workspaceTreePath(selectedEntry);
    model.getItem(treePath)?.select();
    model.focusPath(treePath);
  }, [model, selectedEntry]);

  if (treeQuery.isLoading || runQuery.isLoading) {
    return <DashboardState title="Loading workspace files" variant="loading" />;
  }

  if (treeQuery.isError) {
    return (
      <DashboardState
        description={
          treeQuery.error instanceof Error
            ? treeQuery.error.message
            : String(treeQuery.error)
        }
        title="Workspace files failed to load"
        variant="error"
      />
    );
  }

  if (runQuery.isError) {
    return (
      <DashboardState
        description={
          runQuery.error instanceof Error
            ? runQuery.error.message
            : String(runQuery.error)
        }
        title="Run artifacts failed to load"
        variant="error"
      />
    );
  }

  if (entries.length === 0) {
    return (
      <main className="grid content-start gap-6">
        <DashboardState
          description="This run did not write workspace files."
          title="No workspace files"
        />
        <RunArtifactList artifacts={rawArtifacts} />
      </main>
    );
  }

  return (
    <main className="grid content-start gap-6">
      <section className="grid min-h-[42rem] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <WorkspacePreview entry={selectedEntry} runId={runId} />
        <aside className="min-h-0 border border-[var(--mesh-line)] bg-black/20">
          <FileTree model={model} style={fileTreeStyle} />
        </aside>
      </section>
      <RunArtifactList artifacts={rawArtifacts} />
    </main>
  );
}

function RunArtifactList({ artifacts }: { artifacts: ArtifactRef[] }) {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <header className="grid gap-1">
        <h2 className="text-sm font-bold text-[var(--mesh-white)] uppercase">
          Run artifacts
        </h2>
        <p className="text-xs text-[var(--mesh-muted)]">
          Logs and raw runner output captured for this run.
        </p>
      </header>
      <div className="overflow-hidden border border-[var(--mesh-line)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--mesh-line)] text-xs text-[var(--mesh-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Path</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Content type</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Download</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--mesh-line)]">
            {artifacts.map((artifact) => (
              <tr key={artifact.id}>
                <td className="min-w-0 px-3 py-2 font-mono text-xs break-all text-[var(--mesh-white)]">
                  {artifactDisplayPath(artifact)}
                </td>
                <td className="px-3 py-2 text-[var(--mesh-muted)]">
                  {artifact.kind}
                </td>
                <td className="px-3 py-2 text-[var(--mesh-muted)]">
                  {artifact.contentType ?? ""}
                </td>
                <td className="px-3 py-2 text-right">
                  <a
                    className={cn(buttonVariants({ variant: "ghost" }))}
                    href={artifactDownloadUrl(artifact)}
                  >
                    <IconDownload aria-hidden="true" />
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorkspacePreview({
  entry,
  runId,
}: {
  entry: WorkspaceTreeEntry | undefined;
  runId: string;
}) {
  if (entry === undefined) {
    return (
      <DashboardState
        description="Select a workspace file from the tree."
        title="No file selected"
      />
    );
  }

  if (entry.type !== "file") {
    return (
      <DashboardState
        description="Directory and symlink entries are listed but not previewed."
        title="No file preview"
      />
    );
  }

  const fileUrl = workspaceFileUrl(runId, entry.path);
  const downloadUrl = workspaceDownloadUrl(runId, entry.path);

  return (
    <section className="grid min-h-0 content-start gap-4">
      <header className="grid gap-2 border-b border-[var(--mesh-line)] pb-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-[var(--mesh-white)]">
            {entry.path}
          </h2>
          <p className="text-xs text-[var(--mesh-muted)]">
            {formatBytes(entry.size ?? 0)}
            {entry.contentType === undefined ? "" : ` · ${entry.contentType}`}
          </p>
        </div>
        <a className={cn(buttonVariants())} href={downloadUrl}>
          <IconDownload aria-hidden="true" />
          Download
        </a>
      </header>
      <PreviewContent entry={entry} fileUrl={fileUrl} runId={runId} />
    </section>
  );
}

function PreviewContent({
  entry,
  fileUrl,
  runId,
}: {
  entry: WorkspaceTreeEntry;
  fileUrl: string;
  runId: string;
}) {
  const textQuery = useQuery({
    enabled: canPreviewAsText(entry),
    queryFn: async () => {
      const response = await fetch(fileUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.text();
    },
    queryKey: ["workspace-file-text", runId, entry.path],
  });

  if (canPreviewAsText(entry)) {
    if (textQuery.isLoading) {
      return <DashboardState title="Loading text preview" variant="loading" />;
    }

    if (textQuery.isError) {
      return (
        <DashboardState
          description={
            textQuery.error instanceof Error
              ? textQuery.error.message
              : String(textQuery.error)
          }
          title="Text preview failed"
          variant="error"
        />
      );
    }

    return (
      <CopyablePre
        className="max-h-[36rem]"
        label="Copy file content"
        value={textQuery.data ?? ""}
      />
    );
  }

  if (isImageContent(entry)) {
    return (
      <img
        alt={entry.path}
        className="max-h-[36rem] max-w-full border border-[var(--mesh-line)] object-contain"
        src={fileUrl}
      />
    );
  }

  if (isVideoContent(entry)) {
    return (
      <video
        className="max-h-[36rem] w-full border border-[var(--mesh-line)]"
        controls
        src={fileUrl}
      />
    );
  }

  if (isAudioContent(entry)) {
    return <audio className="w-full" controls src={fileUrl} />;
  }

  if (isPdfContent(entry)) {
    return (
      <iframe
        className="h-[36rem] w-full border border-[var(--mesh-line)]"
        src={fileUrl}
        title={entry.path}
      />
    );
  }

  return (
    <DashboardState
      description="Preview supports browser-native media and text files up to 2 MB."
      title="Preview unavailable"
    />
  );
}

function formatBytes(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function isWorkspaceDirectoryArtifact(artifact: ArtifactRef) {
  return (
    artifact.kind === "directory" &&
    artifact.name === "workspace" &&
    artifactStoragePath(artifact) === "output/workspace/manifest.json"
  );
}

function artifactDisplayPath(artifact: ArtifactRef) {
  return artifactStoragePath(artifact) ?? artifact.uri;
}

function artifactStoragePath(artifact: ArtifactRef) {
  const { pathname } = new URL(artifact.uri, apiUrl);
  const parsed = parseRunStoragePathname(pathname);
  return parsed?.path;
}

function artifactDownloadUrl(artifact: ArtifactRef) {
  return new URL(artifact.uri, apiUrl).toString();
}

async function fetchWorkspaceTree(runId: string) {
  const response = await fetch(workspaceTreeUrl(runId), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return workspaceTreeResultSchema.parse(await response.json());
}

function workspaceTreeUrl(runId: string) {
  return `${apiUrl}/runs/${encodeURIComponent(runId)}/workspace/tree`;
}

function workspaceFileUrl(runId: string, path: string) {
  const url = new URL(
    `/runs/${encodeURIComponent(runId)}/workspace/file`,
    apiUrl,
  );
  url.searchParams.set("path", path);
  return url.toString();
}

function workspaceDownloadUrl(runId: string, path: string) {
  const url = new URL(
    `/runs/${encodeURIComponent(runId)}/workspace/download`,
    apiUrl,
  );
  url.searchParams.set("path", path);
  return url.toString();
}

function workspaceTreePath(entry: WorkspaceTreeEntry) {
  return entry.type === "dir" ? `${entry.path}/` : entry.path;
}

function normalizeSelectedTreePath(path: string) {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function canPreviewAsText(entry: WorkspaceTreeEntry) {
  if (entry.type !== "file" || entry.size === undefined) {
    return false;
  }

  return entry.size <= MAX_TEXT_PREVIEW_BYTES && isTextContent(entry);
}

function isImageContent(entry: WorkspaceTreeEntry) {
  return entry.contentType?.startsWith("image/") ?? false;
}

function isVideoContent(entry: WorkspaceTreeEntry) {
  return entry.contentType?.startsWith("video/") ?? false;
}

function isAudioContent(entry: WorkspaceTreeEntry) {
  return entry.contentType?.startsWith("audio/") ?? false;
}

function isPdfContent(entry: WorkspaceTreeEntry) {
  return entry.contentType === "application/pdf";
}

function isTextContent(entry: WorkspaceTreeEntry) {
  const contentType = entry.contentType ?? "";
  return (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/x-ndjson" ||
    contentType === "application/xml"
  );
}
