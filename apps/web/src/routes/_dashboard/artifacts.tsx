import { parseRunStoragePathname } from "@mesh0/sdk/artifacts";
import type { AgentRunRecord, ArtifactRef } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { DataTable, DataTablePagination } from "@mesh0/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@mesh0/ui/dialog";
import { Input } from "@mesh0/ui/input";
import { IconDownload, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  CopyableValue,
  DetailRow,
  RunStatusBadge,
  formatDate,
} from "../../components/dashboard-fields";
import { DashboardPage, DashboardState } from "../../components/dashboard-page";
import { apiClient, apiUrl } from "../../lib/api";

type ArtifactRow = {
  artifact: ArtifactRef;
  path: string;
  run: AgentRunRecord;
};
type ArtifactsSearch = z.infer<typeof artifactsSearchSchema>;

const pageSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().min(1));
const optionalSearchStringSchema = z.string().min(1).optional();
const artifactsSearchSchema = z.strictObject({
  artifactId: optionalSearchStringSchema,
  page: pageSearchSchema,
  runId: optionalSearchStringSchema,
});
const defaultArtifactsSearch: ArtifactsSearch = {
  page: 1,
};
const fallbackArtifactsSearchSchema = artifactsSearchSchema.catch(
  defaultArtifactsSearch,
);

const artifactColumns: ColumnDef<ArtifactRow>[] = [
  {
    accessorKey: "path",
    cell: ({ row }) => (
      <span className="block max-w-96 truncate font-bold text-[var(--mesh-white)]">
        {row.original.path}
      </span>
    ),
    header: "Artifact path",
  },
  {
    accessorFn: (row) => row.run.id,
    cell: ({ row }) => (
      <CopyableValue
        label="Copy run ID"
        value={row.original.run.id}
        valueClassName="truncate"
      />
    ),
    header: "Run ID",
    id: "runId",
  },
  {
    accessorFn: (row) => row.run.status,
    cell: ({ row }) => <RunStatusBadge status={row.original.run.status} />,
    header: "Run status",
    id: "status",
  },
  {
    accessorFn: (row) => row.run.createdAt,
    cell: ({ row }) => formatDate(row.original.run.createdAt),
    header: "Run created",
    id: "createdAt",
  },
  {
    accessorFn: (row) => row.run.finishedAt,
    cell: ({ row }) => formatDate(row.original.run.finishedAt),
    header: "Run finished",
    id: "finishedAt",
  },
];

export const Route = createFileRoute("/_dashboard/artifacts")({
  validateSearch: (search): ArtifactsSearch =>
    fallbackArtifactsSearchSchema.parse(search),
  beforeLoad: ({ location }) => {
    if (location.searchStr.length === 0) {
      return;
    }

    const result = artifactsSearchSchema.safeParse(
      Object.fromEntries(new URLSearchParams(location.searchStr)),
    );
    if (!result.success) {
      throw redirect({
        replace: true,
        search: defaultArtifactsSearch,
        to: "/artifacts",
      });
    }
  },
  component: ArtifactsPage,
});

function ArtifactsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "createdAt" },
  ]);
  const runsQuery = useQuery({
    queryFn: () => apiClient.runs.list({ limit: 100 }),
    queryKey: ["runs", 100],
  });
  const artifacts = useMemo(
    () => buildArtifactRows(runsQuery.data ?? []),
    [runsQuery.data],
  );
  const runIdFilter = search.runId ?? "";
  const filteredArtifacts = useMemo(
    () =>
      runIdFilter.trim().length === 0
        ? artifacts
        : artifacts.filter((row) => row.run.id.includes(runIdFilter.trim())),
    [artifacts, runIdFilter],
  );
  const selectedArtifact = useMemo(
    () =>
      search.artifactId === undefined
        ? undefined
        : filteredArtifacts.find(
            (row) => row.artifact.id === search.artifactId,
          ),
    [filteredArtifacts, search.artifactId],
  );
  const pagination = useMemo(
    () =>
      ({
        pageIndex: search.page - 1,
        pageSize: 10,
      }) satisfies PaginationState,
    [search.page],
  );
  const table = useReactTable({
    columns: artifactColumns,
    data: filteredArtifacts,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      void navigate({
        search: (previous) => ({
          ...previous,
          artifactId: undefined,
          page: nextPagination.pageIndex + 1,
        }),
      });
    },
    onSortingChange: setSorting,
    state: { pagination, sorting },
  });

  useEffect(() => {
    if (runsQuery.isLoading || search.artifactId === undefined) {
      return;
    }

    if (selectedArtifact !== undefined) {
      return;
    }

    void navigate({
      replace: true,
      search: defaultArtifactsSearch,
    });
  }, [navigate, runsQuery.isLoading, search.artifactId, selectedArtifact]);

  useEffect(() => {
    if (runsQuery.isLoading) {
      return;
    }

    const pageCount = Math.max(table.getPageCount(), 1);
    if (search.page <= pageCount) {
      return;
    }

    void navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        artifactId: undefined,
        page: 1,
      }),
    });
  }, [navigate, runsQuery.isLoading, search.page, table]);

  async function refreshArtifacts() {
    const result = await runsQuery.refetch();
    if (result.isError) {
      toast.error(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      return;
    }

    toast.success("Artifacts refreshed");
  }

  function changeRunIdFilter(value: string) {
    void navigate({
      search: (previous) => ({
        ...previous,
        artifactId: undefined,
        page: 1,
        runId: value.trim().length === 0 ? undefined : value,
      }),
    });
  }

  function openArtifact(artifactId: string) {
    void navigate({ search: (previous) => ({ ...previous, artifactId }) });
  }

  function closeArtifact() {
    void navigate({
      search: (previous) => ({ ...previous, artifactId: undefined }),
    });
  }

  function changeArtifactDialogOpen(open: boolean) {
    if (!open) {
      closeArtifact();
    }
  }

  return (
    <DashboardPage
      action={
        <Button
          disabled={runsQuery.isFetching}
          type="button"
          onClick={() => void refreshArtifacts()}
        >
          <IconRefresh aria-hidden="true" />
          Refresh
        </Button>
      }
      description="Browse files produced by current-user runs and open download actions."
      title="Run artifacts"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Search by run ID"
            className="w-full max-w-sm"
            placeholder="Search run id"
            value={runIdFilter}
            onChange={(event) => changeRunIdFilter(event.currentTarget.value)}
          />
        </div>
        {runsQuery.isLoading ? (
          <DashboardState
            description="Loading artifact records."
            title="Loading artifacts"
            variant="loading"
          />
        ) : runsQuery.isError ? (
          <DashboardState
            description={
              runsQuery.error instanceof Error
                ? runsQuery.error.message
                : String(runsQuery.error)
            }
            title="Artifacts failed to load"
            variant="error"
          />
        ) : artifacts.length === 0 ? (
          <DashboardState
            description="Runs have not produced artifacts yet."
            title="No artifacts"
          />
        ) : (
          <>
            <DataTable
              emptyMessage="No artifacts match the current run filter."
              table={table}
              onRowClick={(row) => openArtifact(row.original.artifact.id)}
            />
            <DataTablePagination
              label={`${filteredArtifacts.length} artifacts`}
              table={table}
            />
          </>
        )}
      </div>
      {selectedArtifact !== undefined && (
        <Dialog open onOpenChange={changeArtifactDialogOpen}>
          <DialogContent className="max-h-[90svh] overflow-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-3xl leading-none font-light">
                Artifact detail
              </DialogTitle>
            </DialogHeader>
            <ArtifactDetail artifactRow={selectedArtifact} />
          </DialogContent>
        </Dialog>
      )}
    </DashboardPage>
  );
}

function ArtifactDetail({ artifactRow }: { artifactRow: ArtifactRow }) {
  const { artifact, path, run } = artifactRow;
  const downloadUrl = new URL(artifact.uri, apiUrl).toString();

  return (
    <div className="grid content-start gap-4">
      <span className="text-sm text-[var(--mesh-muted)]">{artifact.kind}</span>
      <table className="w-full text-sm">
        <tbody className="[&_tr]:border-b [&_tr]:border-[var(--mesh-line)]">
          <DetailRow label="Path" value={path} />
          <DetailRow label="Run ID" value={run.id} />
          <DetailRow label="Run status" value={run.status} />
          <DetailRow label="Created" value={formatDate(run.createdAt)} />
          <DetailRow label="Finished" value={formatDate(run.finishedAt)} />
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <a
          className="inline-flex min-h-10 items-center gap-2 border border-[var(--mesh-line)] px-3 text-sm font-bold hover:border-[var(--mesh-line-strong)]"
          download
          href={downloadUrl}
        >
          <IconDownload aria-hidden="true" className="size-4" />
          Download
        </a>
        <Link
          className="inline-flex min-h-10 items-center gap-2 border border-[var(--mesh-line)] px-3 text-sm font-bold hover:border-[var(--mesh-line-strong)]"
          search={{ page: 1, runId: run.id, status: "all" }}
          to="/runs"
        >
          Open run
        </Link>
      </div>
    </div>
  );
}

function buildArtifactRows(runs: AgentRunRecord[]) {
  return runs.flatMap((run) =>
    run.artifacts.map((artifact) => ({
      artifact,
      path: artifactPath(artifact),
      run,
    })),
  );
}

function artifactPath(artifact: ArtifactRef) {
  const parsed = parseRunStoragePathname(artifact.uri);
  if (parsed === undefined) {
    throw new Error(`Invalid artifact URI: ${artifact.uri}`);
  }

  return parsed.path;
}
