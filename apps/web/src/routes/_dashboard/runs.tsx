import type { AgentRunRecord } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { DataTable, DataTablePagination } from "@mesh0/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@mesh0/ui/dialog";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
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
  CopyButton,
  CopyablePre,
  CopyableValue,
  DetailRow,
  RunStatusBadge,
  formatDate,
  runPromptSummary,
} from "../../components/dashboard-fields";
import { DashboardPage, DashboardState } from "../../components/dashboard-page";
import { apiClient } from "../../lib/api";

type RunStatusFilter = z.infer<typeof runStatusFilterSchema>;
type RunsSearch = z.infer<typeof runsSearchSchema>;

const runStatusFilterSchema = z.enum([
  "all",
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
]);
const pageSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().min(1));
const optionalRunIdSearchSchema = z
  .string()
  .regex(/^run_[A-Za-z0-9_-]+$/)
  .optional();
const runsSearchSchema = z.strictObject({
  page: pageSearchSchema,
  runId: optionalRunIdSearchSchema,
  status: runStatusFilterSchema,
});
const defaultRunsSearch: RunsSearch = {
  page: 1,
  status: "all",
};
const fallbackRunsSearchSchema = runsSearchSchema.catch(defaultRunsSearch);
const runStatusFilters: RunStatusFilter[] = [
  "all",
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
];

const runColumns: ColumnDef<AgentRunRecord>[] = [
  {
    accessorKey: "id",
    cell: ({ row }) => (
      <CopyableValue
        label="Copy run ID"
        value={row.original.id}
        valueClassName="truncate font-bold text-[var(--mesh-white)]"
      />
    ),
    header: "Run ID",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => <RunStatusBadge status={row.original.status} />,
    header: "Status",
  },
  {
    accessorFn: (run) => runPromptSummary(run),
    cell: ({ row }) => (
      <span className="block max-w-96 truncate text-[var(--mesh-muted)]">
        {runPromptSummary(row.original)}
      </span>
    ),
    header: "Prompt",
    id: "prompt",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => formatDate(row.original.createdAt),
    header: "Created",
  },
  {
    accessorKey: "finishedAt",
    cell: ({ row }) => formatDate(row.original.finishedAt),
    header: "Finished",
  },
];

export const Route = createFileRoute("/_dashboard/runs")({
  validateSearch: (search): RunsSearch =>
    fallbackRunsSearchSchema.parse(search),
  beforeLoad: ({ location }) => {
    const result = runsSearchSchema.safeParse(
      Object.fromEntries(new URLSearchParams(location.searchStr)),
    );
    if (!result.success) {
      throw redirect({
        replace: true,
        search: defaultRunsSearch,
        to: "/runs",
      });
    }
  },
  component: RunsPage,
});

function RunsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "createdAt" },
  ]);
  const runsQuery = useQuery({
    queryFn: () => apiClient.runs.list({ limit: 100 }),
    queryKey: ["runs", 100],
  });
  const runs = runsQuery.data ?? [];
  const filteredRuns = useMemo(
    () =>
      search.status === "all"
        ? runs
        : runs.filter((run) => run.status === search.status),
    [runs, search.status],
  );
  const selectedRun = useMemo(
    () =>
      search.runId === undefined
        ? undefined
        : runs.find((run) => run.id === search.runId),
    [runs, search.runId],
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
    columns: runColumns,
    data: filteredRuns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      void navigate({
        search: (previous) => ({
          ...previous,
          page: nextPagination.pageIndex + 1,
          runId: undefined,
        }),
      });
    },
    onSortingChange: setSorting,
    state: { pagination, sorting },
  });

  useEffect(() => {
    if (runsQuery.isLoading || search.runId === undefined) {
      return;
    }

    if (selectedRun !== undefined) {
      return;
    }

    void navigate({
      replace: true,
      search: defaultRunsSearch,
    });
  }, [navigate, runsQuery.isLoading, search.runId, selectedRun]);

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
        page: 1,
        runId: undefined,
      }),
    });
  }, [navigate, runsQuery.isLoading, search.page, table]);

  async function refreshRuns() {
    const result = await runsQuery.refetch();
    if (result.isError) {
      toast.error(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      return;
    }

    toast.success("Runs refreshed");
  }

  function changeStatus(status: RunStatusFilter) {
    void navigate({
      search: (previous) => ({
        ...previous,
        page: 1,
        runId: undefined,
        status,
      }),
    });
  }

  function openRun(runId: string) {
    void navigate({ search: (previous) => ({ ...previous, runId }) });
  }

  function closeRun() {
    void navigate({
      search: (previous) => ({ ...previous, runId: undefined }),
    });
  }

  function changeRunDialogOpen(open: boolean) {
    if (!open) {
      closeRun();
    }
  }

  return (
    <DashboardPage
      action={
        <Button
          disabled={runsQuery.isFetching}
          type="button"
          onClick={() => void refreshRuns()}
        >
          <IconRefresh aria-hidden="true" />
          Refresh
        </Button>
      }
      description="Inspect current-user agent runs, status, artifacts, and event links."
      title="Agent runs"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {runStatusFilters.map((status) => (
            <Button
              key={status}
              type="button"
              variant={search.status === status ? "white" : "default"}
              onClick={() => changeStatus(status)}
            >
              {formatStatusFilterLabel(status)}
            </Button>
          ))}
        </div>
        {runsQuery.isLoading ? (
          <DashboardState
            description="Loading run records."
            title="Loading runs"
            variant="loading"
          />
        ) : runsQuery.isError ? (
          <DashboardState
            description={
              runsQuery.error instanceof Error
                ? runsQuery.error.message
                : String(runsQuery.error)
            }
            title="Runs failed to load"
            variant="error"
          />
        ) : runs.length === 0 ? (
          <DashboardState
            description="No runs have been created by this account yet."
            title="No runs"
          />
        ) : (
          <>
            <DataTable
              emptyMessage="No runs match the selected status."
              table={table}
              onRowClick={(row) => openRun(row.original.id)}
            />
            <DataTablePagination
              label={`${filteredRuns.length} runs loaded`}
              table={table}
            />
          </>
        )}
      </div>
      {selectedRun !== undefined && (
        <Dialog open onOpenChange={changeRunDialogOpen}>
          <DialogContent
            action={<CopyButton label="Copy run ID" value={selectedRun.id} />}
            className="max-h-[90svh] overflow-auto sm:max-w-3xl"
          >
            <DialogHeader>
              <DialogTitle className="font-serif text-3xl leading-none font-light">
                Run detail
              </DialogTitle>
            </DialogHeader>
            <RunDetail run={selectedRun} />
          </DialogContent>
        </Dialog>
      )}
    </DashboardPage>
  );
}

function RunDetail({ run }: { run: AgentRunRecord }) {
  return (
    <div className="grid content-start gap-4">
      <RunStatusBadge status={run.status} />
      <table className="w-full text-sm">
        <tbody className="[&_tr]:border-b [&_tr]:border-[var(--mesh-line)]">
          <DetailRow label="Run ID" value={run.id} />
          <DetailRow label="Status" value={run.status} />
          <DetailRow label="Created" value={formatDate(run.createdAt)} />
          <DetailRow label="Started" value={formatDate(run.startedAt)} />
          <DetailRow label="Finished" value={formatDate(run.finishedAt)} />
          <DetailRow label="Artifacts" value={String(run.artifacts.length)} />
        </tbody>
      </table>
      <section className="grid gap-2">
        <h2 className="text-sm font-bold text-[var(--mesh-white)] uppercase">
          Prompt
        </h2>
        <CopyablePre label="Copy prompt" value={run.input.prompt} />
      </section>
      {run.lastMessage !== undefined && (
        <section className="grid gap-2">
          <h2 className="text-sm font-bold text-[var(--mesh-white)] uppercase">
            Last message
          </h2>
          <CopyablePre label="Copy last message" value={run.lastMessage} />
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          className="inline-flex min-h-10 items-center gap-2 border border-[var(--mesh-line)] px-3 text-sm font-bold hover:border-[var(--mesh-line-strong)]"
          search={{ eventType: "all", page: 1, runId: run.id }}
          to="/observability"
        >
          Events
          <IconArrowRight aria-hidden="true" className="size-4" />
        </Link>
        {run.artifacts.length > 0 && (
          <Link
            className="inline-flex min-h-10 items-center gap-2 border border-[var(--mesh-line)] px-3 text-sm font-bold hover:border-[var(--mesh-line-strong)]"
            search={{ page: 1, runId: run.id }}
            to="/artifacts"
          >
            Artifacts
            <IconArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

function formatStatusFilterLabel(status: RunStatusFilter) {
  return status[0].toUpperCase() + status.slice(1);
}
