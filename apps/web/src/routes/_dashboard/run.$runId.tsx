import { Button, buttonVariants } from "@mesh0/ui/button";
import { cn } from "@mesh0/ui/lib/utils";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CopyButton, RunStatusBadge } from "../../components/dashboard-fields";
import { DashboardPage, DashboardState } from "../../components/dashboard-page";
import { apiClient } from "../../lib/api";

const runDetailTabs = [
  { label: "Info", to: "/run/$runId" },
  { label: "Artifacts", to: "/run/$runId/artifacts" },
  { label: "Observability", to: "/run/$runId/observability" },
];

export const Route = createFileRoute("/_dashboard/run/$runId")({
  component: RunDetailPage,
});

function RunDetailPage() {
  const { runId } = Route.useParams();
  const runQuery = useQuery({
    queryFn: () => apiClient.runs.get({ runId }),
    queryKey: ["run", runId],
  });

  async function refreshRun() {
    const result = await runQuery.refetch();
    if (result.isError) {
      toast.error(
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
      );
      return;
    }

    toast.success("Run refreshed");
  }

  return (
    <DashboardPage
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={cn(buttonVariants({ variant: "ghost" }))}
            search={{ page: 1, status: "all" }}
            to="/runs"
          >
            <IconArrowLeft aria-hidden="true" />
            Runs
          </Link>
          <Button
            disabled={runQuery.isFetching}
            type="button"
            onClick={() => void refreshRun()}
          >
            <IconRefresh aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
      description="Inspect run metadata, collected workspace files, and raw event payloads."
      title={runId}
    >
      {runQuery.isLoading ? (
        <DashboardState
          description="Loading run detail."
          title="Loading run"
          variant="loading"
        />
      ) : runQuery.isError ? (
        <DashboardState
          description={
            runQuery.error instanceof Error
              ? runQuery.error.message
              : String(runQuery.error)
          }
          title="Run failed to load"
          variant="error"
        />
      ) : runQuery.data === undefined ? (
        <DashboardState title="Run detail unavailable" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="grid content-start gap-4 border-b border-[var(--mesh-line)] pb-4 lg:border-r lg:border-b-0 lg:pr-4 lg:pb-0">
            <div className="flex items-center gap-2">
              <RunStatusBadge status={runQuery.data.status} />
              <CopyButton label="Copy run ID" value={runQuery.data.id} />
            </div>
            <nav className="grid gap-1 text-sm">
              {runDetailTabs.map((tab) => (
                <Link
                  key={tab.to}
                  activeOptions={{ exact: tab.to === "/run/$runId" }}
                  activeProps={{
                    className:
                      "border-[var(--mesh-line-strong)] text-[var(--mesh-white)]",
                  }}
                  className="border border-transparent px-3 py-2 text-[var(--mesh-muted)] hover:border-[var(--mesh-line)] hover:text-[var(--mesh-white)]"
                  params={{ runId }}
                  to={tab.to}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </aside>
          <Outlet />
        </div>
      )}
    </DashboardPage>
  );
}
