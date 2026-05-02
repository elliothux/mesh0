import { threadEventTypeSchema } from "@mesh0/sdk/schema";
import type { AgentRunEventRecord } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { DataTable, DataTablePagination } from "@mesh0/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@mesh0/ui/dialog";
import { Input } from "@mesh0/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mesh0/ui/select";
import { IconRefresh } from "@tabler/icons-react";
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  CopyablePre,
  CopyableValue,
  DetailRow,
  eventSummary,
  formatDate,
} from "../../components/dashboard-fields";
import { DashboardPage, DashboardState } from "../../components/dashboard-page";
import { apiClient } from "../../lib/api";

type EventTypeFilter = z.infer<typeof eventTypeFilterSchema>;
type ObservabilitySearch = z.infer<typeof observabilitySearchSchema>;

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
const eventTypeSelectItems = [
  { label: "all event types", value: "all" },
  ...eventTypes.map((eventType) => ({
    label: eventType,
    value: eventType,
  })),
];
const pageSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().min(1));
const optionalSearchStringSchema = z.string().min(1).optional();
const optionalEventIdSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().nonnegative().optional());
const observabilitySearchSchema = z.strictObject({
  eventId: optionalEventIdSearchSchema,
  eventType: eventTypeFilterSchema,
  page: pageSearchSchema,
  runId: optionalSearchStringSchema,
});
const defaultObservabilitySearch: ObservabilitySearch = {
  eventType: "all",
  page: 1,
};
const fallbackObservabilitySearchSchema = observabilitySearchSchema.catch(
  defaultObservabilitySearch,
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
    accessorKey: "runId",
    cell: ({ row }) => (
      <CopyableValue
        label="Copy run ID"
        value={row.original.runId}
        valueClassName="truncate"
      />
    ),
    header: "Run ID",
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

export const Route = createFileRoute("/_dashboard/observability")({
  validateSearch: (search): ObservabilitySearch =>
    fallbackObservabilitySearchSchema.parse(search),
  beforeLoad: ({ location }) => {
    if (location.searchStr.length === 0) {
      return;
    }

    const result = observabilitySearchSchema.safeParse(
      Object.fromEntries(new URLSearchParams(location.searchStr)),
    );
    if (!result.success) {
      throw redirect({
        replace: true,
        search: defaultObservabilitySearch,
        to: "/observability",
      });
    }
  },
  component: ObservabilityPage,
});

function ObservabilityPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "id" },
  ]);
  const runIdFilter = search.runId ?? "";
  const eventRecordsQuery = useQuery({
    queryFn: () =>
      apiClient.runs.eventRecords({
        eventType: search.eventType === "all" ? undefined : search.eventType,
        limit: 200,
        runId: runIdFilter.trim().length === 0 ? undefined : runIdFilter.trim(),
      }),
    queryKey: ["run-event-records", runIdFilter, search.eventType],
  });
  const eventRecords = eventRecordsQuery.data ?? [];
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
    if (eventRecordsQuery.isLoading || search.eventId === undefined) {
      return;
    }

    if (selectedEvent !== undefined) {
      return;
    }

    void navigate({
      replace: true,
      search: defaultObservabilitySearch,
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

  function changeRunIdFilter(value: string) {
    void navigate({
      search: (previous) => ({
        ...previous,
        eventId: undefined,
        page: 1,
        runId: value.trim().length === 0 ? undefined : value,
      }),
    });
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

  function closeEvent() {
    void navigate({
      search: (previous) => ({ ...previous, eventId: undefined }),
    });
  }

  function changeEventDialogOpen(open: boolean) {
    if (!open) {
      closeEvent();
    }
  }

  return (
    <DashboardPage
      action={
        <Button
          disabled={eventRecordsQuery.isFetching}
          type="button"
          onClick={() => void refreshEvents()}
        >
          <IconRefresh aria-hidden="true" />
          Refresh
        </Button>
      }
      description="Review normalized run event records and raw payloads for debugging."
      title="Agent observability"
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3 overflow-x-auto">
          <Input
            aria-label="Filter by run ID"
            className="w-96 flex-none"
            placeholder="Filter exact run id"
            value={runIdFilter}
            onChange={(event) => changeRunIdFilter(event.currentTarget.value)}
          />
          <Select
            items={eventTypeSelectItems}
            value={search.eventType}
            onValueChange={(value) => {
              changeEventType(
                parseEventTypeFilter(typeof value === "string" ? value : "all"),
              );
            }}
          >
            <SelectTrigger
              aria-label="Filter by event type"
              className="w-72 flex-none text-[var(--mesh-white)]"
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
        </div>
        {eventRecordsQuery.isLoading ? (
          <DashboardState
            description="Loading event records."
            title="Loading events"
            variant="loading"
          />
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
          </>
        )}
      </div>
      {selectedEvent !== undefined && (
        <Dialog open onOpenChange={changeEventDialogOpen}>
          <DialogContent className="max-h-[90svh] overflow-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-3xl leading-none font-light">
                Event detail
              </DialogTitle>
            </DialogHeader>
            <EventDetail eventRecord={selectedEvent} />
          </DialogContent>
        </Dialog>
      )}
    </DashboardPage>
  );
}

function EventDetail({ eventRecord }: { eventRecord: AgentRunEventRecord }) {
  const payload = JSON.stringify(eventRecord.event, null, 2);

  return (
    <div className="grid content-start gap-4">
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
    </div>
  );
}

function parseEventTypeFilter(value: string): EventTypeFilter {
  if (value === "all") {
    return value;
  }

  return eventTypes.find((eventType) => eventType === value) ?? "all";
}
