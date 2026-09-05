import { threadEventTypeSchema } from "@mesh0/sdk/schema";
import type { AgentRunEventRecord } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { DataTable, DataTablePagination } from "@mesh0/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mesh0/ui/select";
import { IconActivity, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  CopyablePre,
  CopyableValue,
  DetailRow,
  eventSummary,
  formatDate,
} from "../../components/dashboard-fields";
import { DashboardState } from "../../components/dashboard-page";
import { apiClient, queryClient } from "../../lib/api";

type EventTypeFilter = z.infer<typeof eventTypeFilterSchema>;
type LiveStatus = "idle" | "connecting" | "live" | "ended" | "error";
type RunObservabilitySearch = z.infer<typeof runObservabilitySearchSchema>;

const eventTypes = [
  "thread.started",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "item.started",
  "item.updated",
  "item.completed",
  "error",
] satisfies AgentRunEventRecord["eventType"][];
const eventTypeFilterSchema = z.union([
  z.literal("all"),
  threadEventTypeSchema,
]);
const pageSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().min(1));
const optionalEventIdSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().nonnegative().optional());
const runObservabilitySearchSchema = z.strictObject({
  eventId: optionalEventIdSearchSchema,
  eventType: eventTypeFilterSchema,
  page: pageSearchSchema,
});
const defaultRunObservabilitySearch: RunObservabilitySearch = {
  eventType: "all",
  page: 1,
};
const fallbackRunObservabilitySearchSchema = runObservabilitySearchSchema.catch(
  defaultRunObservabilitySearch,
);

const eventColumns: ColumnDef<AgentRunEventRecord>[] = [
  {
    accessorKey: "id",
    cell: ({ row }) => (
      <CopyableValue label="Copy event ID" value={String(row.original.id)} />
    ),
    header: "Event ID",
  },
  {
    accessorKey: "eventType",
    cell: ({ row }) => row.original.eventType,
    header: "Event type",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => formatDate(row.original.createdAt),
    header: "Created order",
  },
  {
    accessorFn: (record) => eventSummary(record),
    cell: ({ row }) => (
      <span className="block max-w-96 truncate text-[var(--mesh-muted)]">
        {eventSummary(row.original)}
      </span>
    ),
    header: "Summary",
    id: "summary",
  },
];

export const Route = createFileRoute("/_dashboard/run/$runId/observability")({
  validateSearch: (search): RunObservabilitySearch =>
    fallbackRunObservabilitySearchSchema.parse(search),
  beforeLoad: ({ location, params }) => {
    if (location.searchStr.length === 0) {
      return;
    }

    const result = runObservabilitySearchSchema.safeParse(
      Object.fromEntries(new URLSearchParams(location.searchStr)),
    );
    if (!result.success) {
      throw redirect({
        params,
        replace: true,
        search: defaultRunObservabilitySearch,
        to: "/run/$runId/observability",
      });
    }
  },
  component: RunObservabilityPage,
});

function RunObservabilityPage() {
  const { runId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "id" },
  ]);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveError, setLiveError] = useState<string | undefined>();
  const [liveRecords, setLiveRecords] = useState<AgentRunEventRecord[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const runQuery = useQuery({
    queryFn: () => apiClient.runs.get({ runId }),
    queryKey: ["run", runId],
  });
  const eventRecordsQuery = useQuery({
    queryFn: () =>
      apiClient.runs.eventRecords({
        eventType: search.eventType === "all" ? undefined : search.eventType,
        limit: 200,
        runId,
      }),
    queryKey: ["run-event-records", runId, search.eventType],
  });
  const eventRecords = useMemo(
    () => mergeEventRecords(eventRecordsQuery.data ?? [], liveRecords),
    [eventRecordsQuery.data, liveRecords],
  );
  const canLive =
    runQuery.data?.status === "queued" || runQuery.data?.status === "running";
  const selectedEvent = useMemo(
    () =>
      search.eventId === undefined
        ? undefined
        : eventRecords.find((record) => record.id === search.eventId),
    [eventRecords, search.eventId],
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
    columns: eventColumns,
    data: eventRecords,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      void navigate({
        search: (previous) => ({
          ...previous,
          eventId: undefined,
          page: nextPagination.pageIndex + 1,
        }),
      });
    },
    onSortingChange: setSorting,
    state: { pagination, sorting },
  });

  useEffect(() => {
    setLiveError(undefined);
    setLiveRecords([]);
  }, [runId, search.eventType]);

  useEffect(() => {
    if (!liveEnabled) {
      return;
    }

    const abortController = new AbortController();

    async function streamLiveEvents() {
      setLiveError(undefined);
      setLiveStatus("connecting");

      try {
        const stream = await apiClient.runs.liveEvents(
          {
            eventType:
              search.eventType === "all" ? undefined : search.eventType,
            runId,
          },
          { signal: abortController.signal },
        );

        setLiveStatus("live");
        for await (const record of stream) {
          if (abortController.signal.aborted) {
            return;
          }

          setLiveRecords((records) => appendLiveRecord(records, record));
        }

        if (abortController.signal.aborted) {
          return;
        }

        setLiveStatus("ended");
        void queryClient.invalidateQueries({
          queryKey: ["run-event-records", runId, search.eventType],
        });
        void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setLiveError(error instanceof Error ? error.message : String(error));
        setLiveStatus("error");
      }
    }

    void streamLiveEvents();

    return () => abortController.abort();
  }, [liveEnabled, runId, search.eventType]);

  useEffect(() => {
    if (eventRecordsQuery.isLoading || search.eventId === undefined) {
      return;
    }

    if (selectedEvent !== undefined) {
      return;
    }

    void navigate({
      replace: true,
      search: defaultRunObservabilitySearch,
    });
  }, [eventRecordsQuery.isLoading, navigate, search.eventId, selectedEvent]);

  useEffect(() => {
    if (eventRecordsQuery.isLoading) {
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
        eventId: undefined,
        page: 1,
      }),
    });
  }, [eventRecordsQuery.isLoading, navigate, search.page, table]);

  async function refreshEvents() {
    const result = await eventRecordsQuery.refetch();
    if (result.isError) {
      toast.error(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      return;
    }

    toast.success("Events refreshed");
  }

  function changeEventType(value: EventTypeFilter) {
    void navigate({
      search: (previous) => ({
        ...previous,
        eventId: undefined,
        eventType: value,
        page: 1,
      }),
    });
  }

  function openEvent(eventId: number) {
    void navigate({ search: (previous) => ({ ...previous, eventId }) });
  }

  function toggleLiveEvents() {
    if (liveEnabled) {
      setLiveEnabled(false);
      setLiveError(undefined);
      setLiveStatus("idle");
      return;
    }

    setLiveEnabled(true);
  }

  return (
    <main className="grid min-h-[42rem] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="grid min-h-0 content-start gap-4">
        {eventRecordsQuery.isLoading ? (
          <DashboardState title="Loading events" variant="loading" />
        ) : eventRecordsQuery.isError ? (
          <DashboardState
            description={
              eventRecordsQuery.error instanceof Error
                ? eventRecordsQuery.error.message
                : String(eventRecordsQuery.error)
            }
            title="Events failed to load"
            variant="error"
          />
        ) : (
          <>
            <DataTable
              emptyMessage="No events match the current filters."
              table={table}
              onRowClick={(row) => openEvent(row.original.id)}
            />
            <DataTablePagination
              label={`${eventRecords.length} events`}
              table={table}
            />
            {liveEnabled ? (
              <LiveLogPanel
                error={liveError}
                records={eventRecords}
                status={liveStatus}
              />
            ) : null}
            <EventPreview eventRecord={selectedEvent} />
          </>
        )}
      </section>
      <aside className="grid content-start gap-3 border border-[var(--mesh-line)] bg-black/20 p-3">
        <Button
          disabled={!canLive && !liveEnabled}
          type="button"
          variant={liveEnabled ? "white" : "default"}
          onClick={toggleLiveEvents}
        >
          <IconActivity aria-hidden="true" />
          {liveEnabled ? "Close live" : "Live"}
        </Button>
        <Button
          disabled={eventRecordsQuery.isFetching}
          type="button"
          onClick={() => void refreshEvents()}
        >
          <IconRefresh aria-hidden="true" />
          Refresh
        </Button>
        <Select
          value={search.eventType}
          onValueChange={(value) => {
            changeEventType(
              parseEventTypeFilter(typeof value === "string" ? value : "all"),
            );
          }}
        >
          <SelectTrigger
            aria-label="Filter by event type"
            className="w-full text-[var(--mesh-white)]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border border-[var(--mesh-line)] bg-[var(--mesh-panel-raised)] text-[var(--mesh-white)]">
            <SelectItem value="all">all event types</SelectItem>
            {eventTypes.map((eventType) => (
              <SelectItem key={eventType} value={eventType}>
                {eventType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </aside>
    </main>
  );
}

function LiveLogPanel({
  error,
  records,
  status,
}: {
  error: string | undefined;
  records: AgentRunEventRecord[];
  status: LiveStatus;
}) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log === null) {
      return;
    }

    log.scrollTop = log.scrollHeight;
  }, [records.length]);

  const lines = records.map((record) => liveLogLine(record));

  return (
    <section className="grid gap-3 border border-[var(--mesh-line)] bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--mesh-white)]">Live log</h2>
        <span className="font-mono text-xs text-[var(--mesh-muted)] uppercase">
          {liveStatusLabel[status]}
        </span>
      </div>
      <pre
        ref={logRef}
        className="max-h-72 min-h-40 overflow-auto border border-[var(--mesh-line)] bg-black/50 p-3 font-mono text-xs whitespace-pre-wrap text-[var(--mesh-muted)]"
      >
        {lines.length === 0 ? liveStatusEmptyText[status] : lines.join("\n")}
      </pre>
      {error === undefined ? null : (
        <p className="text-sm text-[oklch(82%_0.14_25)]">{error}</p>
      )}
    </section>
  );
}

function EventPreview({
  eventRecord,
}: {
  eventRecord: AgentRunEventRecord | undefined;
}) {
  if (eventRecord === undefined) {
    return (
      <DashboardState
        description="Select an event row to inspect its raw payload."
        title="No event selected"
      />
    );
  }

  const payload = JSON.stringify(eventRecord.event, null, 2);

  return (
    <section className="grid content-start gap-4 border-t border-[var(--mesh-line)] pt-4">
      <span className="text-sm text-[var(--mesh-muted)]">
        {eventRecord.eventType}
      </span>
      <table className="w-full text-sm">
        <tbody className="[&_tr]:border-b [&_tr]:border-[var(--mesh-line)]">
          <DetailRow label="Event ID" value={String(eventRecord.id)} />
          <DetailRow label="Run ID" value={eventRecord.runId} />
          <DetailRow label="Event type" value={eventRecord.eventType} />
          <DetailRow
            label="Created"
            value={formatDate(eventRecord.createdAt)}
          />
          <DetailRow label="Item type" value={eventRecord.itemType ?? "n/a"} />
          <DetailRow
            label="Item status"
            value={eventRecord.itemStatus ?? "n/a"}
          />
        </tbody>
      </table>
      <CopyablePre
        className="max-h-[460px]"
        label="Copy event payload"
        value={payload}
      />
    </section>
  );
}

function parseEventTypeFilter(value: string): EventTypeFilter {
  if (value === "all") {
    return value;
  }

  return eventTypes.find((eventType) => eventType === value) ?? "all";
}

function appendLiveRecord(
  records: AgentRunEventRecord[],
  record: AgentRunEventRecord,
) {
  if (records.some((item) => item.id === record.id)) {
    return records;
  }

  return [...records, record].sort(sortEventRecords);
}

function mergeEventRecords(
  baseRecords: AgentRunEventRecord[],
  liveRecords: AgentRunEventRecord[],
) {
  const recordsById = new Map<number, AgentRunEventRecord>();
  for (const record of baseRecords) {
    recordsById.set(record.id, record);
  }
  for (const record of liveRecords) {
    recordsById.set(record.id, record);
  }

  return Array.from(recordsById.values()).sort(sortEventRecords);
}

function sortEventRecords(
  left: AgentRunEventRecord,
  right: AgentRunEventRecord,
) {
  return left.id - right.id;
}

function liveLogLine(record: AgentRunEventRecord) {
  return [
    `[${new Date(record.createdAt).toISOString()}]`,
    `#${record.id}`,
    record.eventType,
    eventSummary(record),
  ].join(" ");
}

const liveStatusLabel = {
  connecting: "connecting",
  ended: "ended",
  error: "error",
  idle: "idle",
  live: "live",
} satisfies Record<LiveStatus, string>;

const liveStatusEmptyText = {
  connecting: "Connecting to live log...",
  ended: "Live stream ended.",
  error: "Live stream failed.",
  idle: "Live stream idle.",
  live: "Waiting for events...",
} satisfies Record<LiveStatus, string>;
