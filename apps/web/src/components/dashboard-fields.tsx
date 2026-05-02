import type {
  AgentRunEventRecord,
  AgentRunRecord,
  AgentRunStatus,
  ApiKey,
} from "@mesh0/sdk/types";
import { Badge } from "@mesh0/ui/badge";
import { Button } from "@mesh0/ui/button";
import { cn } from "@mesh0/ui/lib/utils";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState, type MouseEvent } from "react";

type CopyButtonProps = {
  className?: string;
  label: string;
  value: string;
};

const statusBadgeClass = {
  canceled: "border-[oklch(62%_0.05_80)] text-[oklch(82%_0.05_80)]",
  completed: "border-[oklch(72%_0.12_155)] text-[oklch(82%_0.14_155)]",
  failed: "border-[oklch(65%_0.16_25)] text-[oklch(82%_0.14_25)]",
  queued: "border-[oklch(70%_0.03_250)] text-[oklch(82%_0.03_250)]",
  running: "border-[oklch(72%_0.11_210)] text-[oklch(82%_0.12_210)]",
} satisfies Record<AgentRunStatus, string>;

export function RunStatusBadge({ status }: { status: AgentRunStatus }) {
  return (
    <Badge
      className={cn("border bg-black/30 uppercase", statusBadgeClass[status])}
      variant="outline"
    >
      {status}
    </Badge>
  );
}

export function ApiKeyStatusBadge({ apiKey }: { apiKey: ApiKey }) {
  const revoked = apiKey.revokedAt !== null;

  return (
    <Badge
      className={
        revoked
          ? "border border-[oklch(65%_0.16_25)] bg-black/30 text-[oklch(82%_0.14_25)] uppercase"
          : "border border-[oklch(72%_0.12_155)] bg-black/30 text-[oklch(82%_0.14_155)] uppercase"
      }
      variant="outline"
    >
      {revoked ? "revoked" : "active"}
    </Badge>
  );
}

export function CopyButton({ className, label, value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <Button
      aria-label={label}
      className={className}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={copy}
    >
      {copied ? (
        <IconCheck aria-hidden="true" />
      ) : (
        <IconCopy aria-hidden="true" />
      )}
    </Button>
  );
}

export function CopyableValue({
  copyValue,
  label,
  value,
  valueClassName,
}: {
  copyValue?: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <span className="flex max-w-full min-w-0 items-center gap-2">
      <span className={cn("min-w-0", valueClassName)}>{value}</span>
      <CopyButton
        className="size-7 shrink-0"
        label={label}
        value={copyValue ?? value}
      />
    </span>
  );
}

export function CopyablePre({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="relative">
      <pre
        className={cn(
          "max-h-48 overflow-auto border border-[var(--mesh-line)] bg-black/30 p-3 pr-12 text-xs whitespace-pre-wrap text-[var(--mesh-muted)]",
          className,
        )}
      >
        {value}
      </pre>
      <CopyButton
        className="absolute top-2 right-2"
        label={label}
        value={value}
      />
    </div>
  );
}

export function DetailRow({
  copyValue,
  label,
  value,
}: {
  copyValue?: string;
  label: string;
  value: string;
}) {
  return (
    <tr>
      <th className="w-28 py-2 pr-3 text-left text-xs font-bold text-[var(--mesh-muted)] uppercase">
        {label}
      </th>
      <td className="py-2 text-[var(--mesh-white)]">
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <span className="min-w-0 break-all">{value}</span>
          <CopyButton
            className="justify-self-end"
            label={`Copy ${label}`}
            value={copyValue ?? value}
          />
        </span>
      </td>
    </tr>
  );
}

export function formatDate(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function runPromptSummary(run: AgentRunRecord) {
  return truncateText(run.input.prompt, 96);
}

export function eventSummary(record: AgentRunEventRecord) {
  const event = record.event;
  if (event.type === "error") {
    return truncateText(event.message, 120);
  }

  if (event.type === "turn.failed") {
    return truncateText(event.error.message, 120);
  }

  if (
    event.type === "item.started" ||
    event.type === "item.updated" ||
    event.type === "item.completed"
  ) {
    return `${event.item.type} ${event.item.id}`;
  }

  return event.type;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
