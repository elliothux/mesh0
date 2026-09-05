import { agentConfigSchema } from "@mesh0/sdk/schema";
import type { AgentRecord } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { Input } from "@mesh0/ui/input";
import { Label } from "@mesh0/ui/label";
import { Textarea } from "@mesh0/ui/textarea";
import { IconPlayerPlay, IconTrash, IconUpload } from "@tabler/icons-react";
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

const defaultAgentConfigText = JSON.stringify(
  {
    env: {
      OPENAI_API_KEY: "sk_replace_me",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-5.4",
    },
    prompt: "Summarize the current workspace.",
  },
  null,
  2,
);

export const Route = createFileRoute("/_dashboard/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const [name, setName] = useState("");
  const [configText, setConfigText] = useState(defaultAgentConfigText);
  const agentsQuery = useQuery({
    queryFn: () => apiClient.agents.list({ limit: 100 }),
    queryKey: ["agents"],
  });
  const persistMutation = useMutation({
    mutationFn: async () => {
      const configValue: unknown = JSON.parse(configText);
      return apiClient.agents.persist({
        config: agentConfigSchema.parse(configValue),
        name: name.trim(),
      });
    },
    onError: showErrorToast,
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent saved");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (agentName: string) =>
      apiClient.agents.delete({ name: agentName }),
    onError: showErrorToast,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
    },
  });
  const runMutation = useMutation({
    mutationFn: (agentName: string) =>
      apiClient.agents.run({ name: agentName }),
    onError: showErrorToast,
    onSuccess: (run) => {
      toast.success(`Run queued: ${run.id}`);
    },
  });

  function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length === 0 || persistMutation.isPending) {
      return;
    }

    persistMutation.mutate();
  }

  return (
    <DashboardPage
      description="Persist reusable agent configuration for SDK, cron, webhook, and playground runs."
      title="Agents"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <form
          className="grid content-start gap-4 border border-[var(--mesh-line)] bg-black/20 p-4"
          onSubmit={saveAgent}
        >
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agent-config">Config JSON</Label>
            <Textarea
              className="min-h-80 font-mono text-xs"
              id="agent-config"
              spellCheck={false}
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
            />
          </div>
          <Button disabled={persistMutation.isPending} type="submit">
            <IconUpload aria-hidden="true" />
            Save agent
          </Button>
        </form>
        <AgentList
          agents={agentsQuery.data ?? []}
          error={agentsQuery.error}
          loading={agentsQuery.isLoading}
          runPending={runMutation.isPending}
          onDelete={(agentName) => deleteMutation.mutate(agentName)}
          onRun={(agentName) => runMutation.mutate(agentName)}
        />
      </div>
    </DashboardPage>
  );
}

function AgentList({
  agents,
  error,
  loading,
  runPending,
  onDelete,
  onRun,
}: {
  agents: AgentRecord[];
  error: Error | null;
  loading: boolean;
  runPending: boolean;
  onDelete: (name: string) => void;
  onRun: (name: string) => void;
}) {
  if (loading) {
    return <DashboardState title="Loading agents" variant="loading" />;
  }

  if (error !== null) {
    return (
      <DashboardState
        description={error.message}
        title="Agents failed to load"
        variant="error"
      />
    );
  }

  if (agents.length === 0) {
    return <DashboardState title="No agents" />;
  }

  return (
    <div className="grid gap-3">
      {agents.map((agent) => (
        <AgentPanel
          agent={agent}
          key={agent.id}
          runPending={runPending}
          onDelete={onDelete}
          onRun={onRun}
        />
      ))}
    </div>
  );
}

function AgentPanel({
  agent,
  runPending,
  onDelete,
  onRun,
}: {
  agent: AgentRecord;
  runPending: boolean;
  onDelete: (name: string) => void;
  onRun: (name: string) => void;
}) {
  return (
    <article className="grid gap-4 border border-[var(--mesh-line)] bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <h2 className="truncate text-lg font-bold text-[var(--mesh-white)]">
            {agent.name}
          </h2>
          <CopyableValue label="Copy agent ID" value={agent.id} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={runPending}
            size="sm"
            type="button"
            onClick={() => onRun(agent.name)}
          >
            <IconPlayerPlay aria-hidden="true" />
            Run
          </Button>
          <Button
            size="sm"
            type="button"
            variant="danger"
            onClick={() => onDelete(agent.name)}
          >
            <IconTrash aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>
      <table className="border-t border-[var(--mesh-line)] pt-3">
        <tbody>
          <DetailRow label="Updated" value={formatDate(agent.updatedAt)} />
          <DetailRow
            label="Model"
            value={agent.config.env?.OPENAI_MODEL ?? "Unset"}
          />
          <DetailRow
            label="Prompt"
            value={formatPromptValue(agent.config.prompt)}
          />
        </tbody>
      </table>
    </article>
  );
}

function formatPromptValue(prompt: AgentRecord["config"]["prompt"]) {
  if (prompt === undefined) {
    return "Unset";
  }

  if (typeof prompt === "string") {
    return prompt;
  }

  if ("append" in prompt) {
    return prompt.append;
  }

  return prompt.replace;
}

function showErrorToast(error: Error) {
  toast.error(error.message);
}
