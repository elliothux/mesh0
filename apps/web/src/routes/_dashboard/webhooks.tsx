import { agentDefinitionSchema } from "@mesh0/sdk/schema";
import type { AgentDefinition, WebhookRecord } from "@mesh0/sdk/types";
import { Button } from "@mesh0/ui/button";
import { Input } from "@mesh0/ui/input";
import { Label } from "@mesh0/ui/label";
import { Textarea } from "@mesh0/ui/textarea";
import { IconTrash, IconWebhook } from "@tabler/icons-react";
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
import { apiClient, apiUrl, queryClient } from "../../lib/api";

const defaultDefinitionText = JSON.stringify(
  {
    agentName: "webhook-agent",
    prompt: { append: "Handle the webhook payload." },
  },
  null,
  2,
);

export const Route = createFileRoute("/_dashboard/webhooks")({
  component: WebhooksPage,
});

function WebhooksPage() {
  const [name, setName] = useState("");
  const [definitionText, setDefinitionText] = useState(defaultDefinitionText);
  const webhooksQuery = useQuery({
    queryFn: () => apiClient.webhooks.list({ limit: 100 }),
    queryKey: ["webhooks"],
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const definitionValue: unknown = JSON.parse(definitionText);
      return apiClient.webhooks.create({
        definition: agentDefinitionSchema.parse(definitionValue),
        name: name.trim(),
      });
    },
    onError: showErrorToast,
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook saved");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (webhookId: string) => apiClient.webhooks.delete({ webhookId }),
    onError: showErrorToast,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook deleted");
    },
  });

  function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length === 0 || createMutation.isPending) {
      return;
    }

    createMutation.mutate();
  }

  return (
    <DashboardPage
      description="Create public webhook endpoints that enqueue agent runs."
      title="Webhooks"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <form
          className="grid content-start gap-4 border border-[var(--mesh-line)] bg-black/20 p-4"
          onSubmit={createWebhook}
        >
          <div className="grid gap-2">
            <Label htmlFor="webhook-name">Name</Label>
            <Input
              id="webhook-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="webhook-definition">Definition JSON</Label>
            <Textarea
              className="min-h-64 font-mono text-xs"
              id="webhook-definition"
              spellCheck={false}
              value={definitionText}
              onChange={(event) => setDefinitionText(event.target.value)}
            />
          </div>
          <Button disabled={createMutation.isPending} type="submit">
            <IconWebhook aria-hidden="true" />
            Save webhook
          </Button>
        </form>
        <WebhookList
          error={webhooksQuery.error}
          loading={webhooksQuery.isLoading}
          webhooks={webhooksQuery.data ?? []}
          onDelete={(webhookId) => deleteMutation.mutate(webhookId)}
        />
      </div>
    </DashboardPage>
  );
}

function WebhookList({
  error,
  loading,
  webhooks,
  onDelete,
}: {
  error: Error | null;
  loading: boolean;
  webhooks: WebhookRecord[];
  onDelete: (webhookId: string) => void;
}) {
  if (loading) {
    return <DashboardState title="Loading webhooks" variant="loading" />;
  }

  if (error !== null) {
    return (
      <DashboardState
        description={error.message}
        title="Webhooks failed to load"
        variant="error"
      />
    );
  }

  if (webhooks.length === 0) {
    return <DashboardState title="No webhooks" />;
  }

  return (
    <div className="grid gap-3">
      {webhooks.map((webhook) => (
        <article
          className="grid gap-4 border border-[var(--mesh-line)] bg-black/20 p-4"
          key={webhook.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 gap-2">
              <h2 className="truncate text-lg font-bold text-[var(--mesh-white)]">
                {webhook.name}
              </h2>
              <CopyableValue
                label="Copy webhook URL"
                value={`${apiUrl}${webhook.path}`}
              />
            </div>
            <Button
              size="sm"
              type="button"
              variant="danger"
              onClick={() => onDelete(webhook.id)}
            >
              <IconTrash aria-hidden="true" />
              Delete
            </Button>
          </div>
          <table className="border-t border-[var(--mesh-line)] pt-3">
            <tbody>
              <DetailRow
                label="Agent"
                value={formatDefinitionTarget(webhook.definition)}
              />
              <DetailRow
                label="Updated"
                value={formatDate(webhook.updatedAt)}
              />
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
