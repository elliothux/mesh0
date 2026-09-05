import { agentConfigSchema, agentRunInputSchema } from "@mesh0/sdk/schema";
import type {
  AgentConfig,
  AgentPrompt,
  AgentRunRecord,
} from "@mesh0/sdk/types";
import { Button, buttonVariants } from "@mesh0/ui/button";
import { Input } from "@mesh0/ui/input";
import { Label } from "@mesh0/ui/label";
import { Textarea } from "@mesh0/ui/textarea";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CopyableValue,
  RunStatusBadge,
  runPromptSummary,
} from "../../components/dashboard-fields";
import { DashboardPage } from "../../components/dashboard-page";
import { apiClient } from "../../lib/api";

const defaultPlaygroundConfigText = JSON.stringify(
  {
    env: {
      OPENAI_API_KEY: "sk_replace_me",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-5.4",
    },
  },
  null,
  2,
);

export const Route = createFileRoute("/_dashboard/playground")({
  component: PlaygroundPage,
});

function PlaygroundPage() {
  const [agentName, setAgentName] = useState("");
  const [prompt, setPrompt] = useState("Say hello from mesh0.");
  const [configText, setConfigText] = useState(defaultPlaygroundConfigText);
  const [run, setRun] = useState<AgentRunRecord | null>(null);
  const runMutation = useMutation({
    mutationFn: async () => {
      const trimmedAgentName = agentName.trim();
      const trimmedPrompt = prompt.trim();
      if (trimmedAgentName.length > 0) {
        return apiClient.agents.run({
          name: trimmedAgentName,
          prompt:
            trimmedPrompt.length === 0 ? undefined : { append: trimmedPrompt },
        });
      }

      const configValue: unknown = JSON.parse(configText);
      const config = agentConfigSchema.parse(configValue);
      return apiClient.runs.create(buildDirectRunInput(config, trimmedPrompt));
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: (record) => {
      setRun(record);
      toast.success(`Run queued: ${record.id}`);
    },
  });

  function submitRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (runMutation.isPending) {
      return;
    }

    runMutation.mutate();
  }

  return (
    <DashboardPage
      description="Start an agent run from a saved agent or an inline config."
      title="Playground"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <form
          className="grid content-start gap-4 border border-[var(--mesh-line)] bg-black/20 p-4"
          onSubmit={submitRun}
        >
          <div className="grid gap-2">
            <Label htmlFor="playground-agent">Agent name</Label>
            <Input
              id="playground-agent"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="playground-prompt">Prompt</Label>
            <Textarea
              className="min-h-36"
              id="playground-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="playground-config">Inline config JSON</Label>
            <Textarea
              className="min-h-64 font-mono text-xs"
              id="playground-config"
              spellCheck={false}
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
            />
          </div>
          <Button disabled={runMutation.isPending} type="submit">
            <IconPlayerPlay aria-hidden="true" />
            Run
          </Button>
        </form>
        {run === null ? (
          <div className="grid min-h-72 place-items-center border border-dashed border-[var(--mesh-line-strong)] bg-black/20 p-6 text-center text-[var(--mesh-muted)]">
            <span className="text-sm font-bold text-[var(--mesh-white)]">
              No playground run
            </span>
          </div>
        ) : (
          <section className="grid content-start gap-4 border border-[var(--mesh-line)] bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <RunStatusBadge status={run.status} />
              <Link
                className={buttonVariants({ size: "sm" })}
                params={{ runId: run.id }}
                to="/run/$runId"
              >
                Open run
              </Link>
            </div>
            <CopyableValue label="Copy run ID" value={run.id} />
            <p className="text-sm leading-6 text-[var(--mesh-muted)]">
              {runPromptSummary(run)}
            </p>
          </section>
        )}
      </div>
    </DashboardPage>
  );
}

function buildDirectRunInput(config: AgentConfig, prompt: string) {
  const resolvedPrompt =
    prompt.length > 0 ? prompt : resolvePrompt(config.prompt);
  if (config.env === undefined) {
    throw new Error("Inline config env is required");
  }

  if (resolvedPrompt === undefined) {
    throw new Error("Prompt is required");
  }

  return agentRunInputSchema.parse({
    env: config.env,
    mcpServers: config.mcpServers,
    prompt: resolvedPrompt,
    skills: config.skills,
    systemPrompt: config.systemPrompt,
    workspace: config.workspace,
  });
}

function resolvePrompt(prompt: AgentPrompt | undefined) {
  if (prompt === undefined) {
    return undefined;
  }

  if (typeof prompt === "string") {
    return prompt;
  }

  if ("append" in prompt) {
    return prompt.append;
  }

  return prompt.replace;
}
