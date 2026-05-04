import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CopyablePre,
  DetailRow,
  RunStatusBadge,
  formatDate,
} from "../../components/dashboard-fields";
import { DashboardState } from "../../components/dashboard-page";
import { apiClient } from "../../lib/api";

export const Route = createFileRoute("/_dashboard/run/$runId/")({
  component: RunInfoPage,
});

function RunInfoPage() {
  const { runId } = Route.useParams();
  const runQuery = useQuery({
    queryFn: () => apiClient.runs.get({ runId }),
    queryKey: ["run", runId],
  });

  if (runQuery.isLoading) {
    return <DashboardState title="Loading run info" variant="loading" />;
  }

  if (runQuery.isError) {
    return (
      <DashboardState
        description={
          runQuery.error instanceof Error
            ? runQuery.error.message
            : String(runQuery.error)
        }
        title="Run info failed to load"
        variant="error"
      />
    );
  }

  const run = runQuery.data;
  if (run === undefined) {
    return <DashboardState title="Run info unavailable" />;
  }

  return (
    <main className="grid content-start gap-4">
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
    </main>
  );
}
