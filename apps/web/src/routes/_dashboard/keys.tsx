import type { ApiKey, RenameApiKeyInput } from "@mesh0/sdk/types";
import { Alert, AlertDescription, AlertTitle } from "@mesh0/ui/alert";
import { Button } from "@mesh0/ui/button";
import { DataTable, DataTablePagination } from "@mesh0/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@mesh0/ui/dialog";
import { openConfirmDialog } from "@mesh0/ui/dialog-portal";
import { Input } from "@mesh0/ui/input";
import { Label } from "@mesh0/ui/label";
import {
  IconAlertCircle,
  IconLoader2,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ApiKeyCreateControl } from "../../components/api-key-dialog";
import {
  ApiKeyStatusBadge,
  DetailRow,
  formatDate,
} from "../../components/dashboard-fields";
import { DashboardPage, DashboardState } from "../../components/dashboard-page";
import { apiClient, queryClient } from "../../lib/api";

type ApiKeysSearch = z.infer<typeof apiKeysSearchSchema>;

const pageSearchSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return value;
}, z.number().int().min(1));
const optionalKeyIdSearchSchema = z
  .string()
  .regex(/^key_[A-Za-z0-9_-]+$/)
  .optional();
const apiKeysSearchSchema = z.strictObject({
  keyId: optionalKeyIdSearchSchema,
  page: pageSearchSchema,
});
const defaultApiKeysSearch: ApiKeysSearch = {
  page: 1,
};
const fallbackApiKeysSearchSchema =
  apiKeysSearchSchema.catch(defaultApiKeysSearch);

const apiKeyColumns: ColumnDef<ApiKey>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <span className="font-bold text-[var(--mesh-white)]">
        {row.original.name}
      </span>
    ),
    header: "Name",
  },
  {
    accessorFn: apiKeyPreview,
    cell: ({ row }) => apiKeyPreview(row.original),
    header: "API Key",
    id: "apiKey",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => formatDate(row.original.createdAt),
    header: "Created",
  },
  {
    accessorKey: "lastUsedAt",
    cell: ({ row }) => formatDate(row.original.lastUsedAt),
    header: "Last used",
  },
  {
    accessorFn: (apiKey) => (apiKey.revokedAt === null ? "active" : "revoked"),
    cell: ({ row }) => <ApiKeyStatusBadge apiKey={row.original} />,
    header: "Status",
    id: "status",
  },
];

export const Route = createFileRoute("/_dashboard/keys")({
  validateSearch: (search): ApiKeysSearch =>
    fallbackApiKeysSearchSchema.parse(search),
  beforeLoad: ({ location }) => {
    const result = apiKeysSearchSchema.safeParse(
      Object.fromEntries(new URLSearchParams(location.searchStr)),
    );
    if (!result.success) {
      throw redirect({
        replace: true,
        search: defaultApiKeysSearch,
        to: "/keys",
      });
    }
  },
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "createdAt" },
  ]);
  const apiKeysQuery = useQuery({
    queryFn: () => apiClient.apiKeys.list(),
    queryKey: ["api-keys"],
  });
  const revokeMutation = useMutation({
    mutationFn: (apiKeyId: string) => apiClient.apiKeys.revoke({ apiKeyId }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
  });
  const renameMutation = useMutation({
    mutationFn: (input: RenameApiKeyInput) => apiClient.apiKeys.rename(input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key renamed");
    },
  });
  const apiKeys = apiKeysQuery.data ?? [];
  const selectedKey = useMemo(
    () =>
      search.keyId === undefined
        ? undefined
        : apiKeys.find((apiKey) => apiKey.id === search.keyId),
    [apiKeys, search.keyId],
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
    columns: apiKeyColumns,
    data: apiKeys,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      void navigate({
        search: (previous) => ({
          ...previous,
          keyId: undefined,
          page: nextPagination.pageIndex + 1,
        }),
      });
    },
    onSortingChange: setSorting,
    state: { pagination, sorting },
  });
  useEffect(() => {
    if (apiKeysQuery.isLoading || search.keyId === undefined) {
      return;
    }

    if (selectedKey !== undefined) {
      return;
    }

    void navigate({
      replace: true,
      search: defaultApiKeysSearch,
    });
  }, [apiKeysQuery.isLoading, navigate, search.keyId, selectedKey]);

  useEffect(() => {
    if (apiKeysQuery.isLoading) {
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
        keyId: undefined,
        page: 1,
      }),
    });
  }, [apiKeysQuery.isLoading, navigate, search.page, table]);

  function openApiKey(keyId: string) {
    void navigate({ search: (previous) => ({ ...previous, keyId }) });
  }

  function closeApiKey() {
    void navigate({
      search: (previous) => ({ ...previous, keyId: undefined }),
    });
  }

  function changeApiKeyDialogOpen(open: boolean) {
    if (!open) {
      closeApiKey();
    }
  }

  function confirmRevoke(apiKey: ApiKey) {
    openConfirmDialog({
      confirmText: "Revoke key",
      confirmVariant: "danger",
      description: `Revoke ${apiKey.name}? SDK requests using this key will stop authenticating.`,
      onConfirm: () => revokeMutation.mutateAsync(apiKey.id),
      title: "Revoke API key",
      titleClassName: "font-serif text-3xl leading-none font-light",
    });
  }

  return (
    <DashboardPage
      action={
        <ApiKeyCreateControl
          onCreated={() =>
            void queryClient.invalidateQueries({ queryKey: ["api-keys"] })
          }
        />
      }
      description="Create, inspect, and revoke API keys for SDK access."
      title="API keys"
    >
      <div className="grid gap-4">
        {apiKeysQuery.isLoading ? (
          <DashboardState
            description="Loading API keys."
            title="Loading keys"
            variant="loading"
          />
        ) : apiKeysQuery.isError ? (
          <DashboardState
            description={
              apiKeysQuery.error instanceof Error
                ? apiKeysQuery.error.message
                : String(apiKeysQuery.error)
            }
            title="API keys failed to load"
            variant="error"
          />
        ) : (
          <>
            <DataTable
              emptyMessage="No API keys have been created."
              table={table}
              onRowClick={(row) => openApiKey(row.original.id)}
            />
            <DataTablePagination
              label={`${apiKeys.length} keys`}
              table={table}
            />
          </>
        )}
      </div>
      {selectedKey !== undefined && (
        <Dialog open onOpenChange={changeApiKeyDialogOpen}>
          <DialogContent
            className="max-h-[90svh] overflow-auto sm:max-w-2xl"
            initialFocus={false}
          >
            <DialogHeader>
              <DialogTitle className="font-serif text-3xl leading-none font-light">
                Key detail
              </DialogTitle>
            </DialogHeader>
            <ApiKeyDetail
              apiKey={selectedKey}
              renaming={renameMutation.isPending}
              revokeError={revokeMutation.error}
              revoking={revokeMutation.isPending}
              onRename={(input) => renameMutation.mutate(input)}
              onRevoke={confirmRevoke}
            />
          </DialogContent>
        </Dialog>
      )}
    </DashboardPage>
  );
}

function ApiKeyDetail({
  apiKey,
  renaming,
  revokeError,
  revoking,
  onRename,
  onRevoke,
}: {
  apiKey: ApiKey;
  renaming: boolean;
  revokeError: Error | null;
  revoking: boolean;
  onRename: (input: RenameApiKeyInput) => void;
  onRevoke: (apiKey: ApiKey) => void;
}) {
  const [name, setName] = useState(apiKey.name);
  const isRevoked = apiKey.revokedAt !== null;
  const trimmedName = name.trim();
  const canRename =
    trimmedName.length > 0 && trimmedName !== apiKey.name && !renaming;

  useEffect(() => {
    setName(apiKey.name);
  }, [apiKey.id, apiKey.name]);

  function renameApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRename) {
      return;
    }

    onRename({ apiKeyId: apiKey.id, name: trimmedName });
  }

  return (
    <div className="grid content-start gap-4">
      <ApiKeyStatusBadge apiKey={apiKey} />
      <form className="flex flex-wrap items-end gap-2" onSubmit={renameApiKey}>
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor={`api-key-name-${apiKey.id}`}>Name</Label>
          <Input
            aria-label="API key name"
            id={`api-key-name-${apiKey.id}`}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <Button disabled={!canRename} type="submit">
          {renaming ? (
            <IconLoader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <IconPencil aria-hidden="true" />
          )}
          Rename key
        </Button>
      </form>
      <table className="w-full text-sm">
        <tbody className="[&_tr]:border-b [&_tr]:border-[var(--mesh-line)]">
          <DetailRow label="Name" value={apiKey.name} />
          <DetailRow label="API Key" value={apiKeyPreview(apiKey)} />
          <DetailRow label="Created" value={formatDate(apiKey.createdAt)} />
          <DetailRow label="Last used" value={formatDate(apiKey.lastUsedAt)} />
          <DetailRow label="Revoked" value={formatDate(apiKey.revokedAt)} />
        </tbody>
      </table>
      {revokeError !== null && (
        <Alert className="border-[var(--mesh-line)] bg-black/20">
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>Revoke failed</AlertTitle>
          <AlertDescription>{revokeError.message}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button
          disabled={isRevoked || revoking}
          type="button"
          variant="danger"
          onClick={() => onRevoke(apiKey)}
        >
          <IconTrash aria-hidden="true" />
          Revoke key
        </Button>
      </div>
    </div>
  );
}

function apiKeyPreview(apiKey: ApiKey) {
  return `${apiKey.prefix}***`;
}
