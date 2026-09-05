import { agentDefinitionSchema } from "@mesh0/sdk/schema";
import type { AgentDefinition, CronRecord } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { Input } from "@mesh0/ui/input";
import { Label } from "@mesh0/ui/label";
import { Textarea } from "@mesh0/ui/textarea";
import { IconCalendarPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CopyableValue,
  DetailRow,
  formatDate,
} from "../../components/dashboard-fields";
import { DashboardPage, DashboardState } from "../../components/dashboard-page";
import { apiClient, queryClient } from "../../lib/api";

const defaultDefinitionText = JSON.stringify(
  {
    agentName: "daily-agent",
    prompt: { append: "Run the scheduled task." },
  },
  null,
  2,
);

export const Route = createFileRoute("/_dashboard/crons")({
  component: CronsPage,
});

function CronsPage() {
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("0 9 * * *");
  const [invalidateAt, setInvalidateAt] = useState("");
  const [definitionText, setDefinitionText] = useState(defaultDefinitionText);
  const cronsQuery = useQuery({
    queryFn: () => apiClient.crons.list({ limit: 100 }),
    queryKey: ["crons"],
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const definitionValue: unknown = JSON.parse(definitionText);
      return apiClient.crons.create({
        definition: agentDefinitionSchema.parse(definitionValue),
        expression: expression.trim(),
        invalidateAt: invalidateAt.trim() || undefined,
        name: name.trim(),
      });
    },
    onError: showErrorToast,
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["crons"] });
      toast.success("Cron saved");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (cronId: string) => apiClient.crons.delete({ cronId }),
    onError: showErrorToast,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crons"] });
      toast.success("Cron deleted");
    },
  });

  function createCron(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      name.trim().length === 0 ||
      expression.trim().length === 0 ||
      createMutation.isPending
    ) {
      return;
    }

    createMutation.mutate();
  }

  return (
    <DashboardPage
      description="Store schedules that target persisted agents or inline agent definitions."
      title="Crons"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <form
          className="grid content-start gap-4 border border-[var(--mesh-line)] bg-black/20 p-4"
          onSubmit={createCron}
        >
          <div className="grid gap-2">
            <Label htmlFor="cron-name">Name</Label>
            <Input
              id="cron-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cron-expression">Expression</Label>
            <Input
              id="cron-expression"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cron-invalidate-at">Invalidate at</Label>
            <Input
              id="cron-invalidate-at"
              placeholder="2026-12-31T23:59:59Z"
              value={invalidateAt}
              onChange={(event) => setInvalidateAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cron-definition">Definition JSON</Label>
            <Textarea
              className="min-h-56 font-mono text-xs"
              id="cron-definition"
              spellCheck={false}
              value={definitionText}
              onChange={(event) => setDefinitionText(event.target.value)}
            />
          </div>
          <Button disabled={createMutation.isPending} type="submit">
            <IconCalendarPlus aria-hidden="true" />
            Save cron
          </Button>
        </form>
        <CronList
          crons={cronsQuery.data ?? []}
          error={cronsQuery.error}
          loading={cronsQuery.isLoading}
          onDelete={(cronId) => deleteMutation.mutate(cronId)}
        />
      </div>
    </DashboardPage>
  );
}

function CronList({
  crons,
  error,
  loading,
  onDelete,
}: {
  crons: CronRecord[];
  error: Error | null;
  loading: boolean;
  onDelete: (cronId: string) => void;
}) {
  if (loading) {
    return <DashboardState title="Loading crons" variant="loading" />;
  }

  if (error !== null) {
    return (
      <DashboardState
        description={error.message}
        title="Crons failed to load"
        variant="error"
      />
    );
  }

  if (crons.length === 0) {
    return <DashboardState title="No crons" />;
  }

  return (
    <div className="grid gap-3">
      {crons.map((cron) => (
        <article
          className="grid gap-4 border border-[var(--mesh-line)] bg-black/20 p-4"
          key={cron.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 gap-2">
              <h2 className="truncate text-lg font-bold text-[var(--mesh-white)]">
                {cron.name}
              </h2>
              <CopyableValue label="Copy cron ID" value={cron.id} />
            </div>
            <Button
              size="sm"
              type="button"
              variant="danger"
              onClick={() => onDelete(cron.id)}
            >
              <IconTrash aria-hidden="true" />
              Delete
            </Button>
          </div>
          <table className="border-t border-[var(--mesh-line)] pt-3">
            <tbody>
              <DetailRow label="Expression" value={cron.expression} />
              <DetailRow
                label="Agent"
                value={formatDefinitionTarget(cron.definition)}
              />
              <DetailRow label="Updated" value={formatDate(cron.updatedAt)} />
              <DetailRow
                label="Invalidate"
                value={formatDate(cron.invalidateAt)}
              />
              <DetailRow
                label="Last trigger"
                value={formatDate(cron.lastTriggeredAt)}
              />
              <DetailRow label="Last run" value={cron.lastRunId ?? "n/a"} />
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}

function showErrorToast(error: Error) {
  toast.error(error.message);
}

function formatDefinitionTarget(definition: AgentDefinition) {
  if ("mode" in definition) {
    return `${definition.mode} workflow (${definition.agents.length} agents)`;
  }

  return definition.agentName ?? "Inline";
}
