import { Alert, AlertDescription, AlertTitle } from "@mesh0/ui/alert";
import { Button } from "@mesh0/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@mesh0/ui/dialog";
import { Input } from "@mesh0/ui/input";
import { Label } from "@mesh0/ui/label";
import { IconAlertCircle, IconKey, IconLoader2 } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiClient } from "../lib/api";
import { CopyButton } from "./dashboard-fields";

const defaultKeyName = "Dashboard key";

export function ApiKeyCreateControl({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="white" onClick={() => setOpen(true)}>
        <IconKey aria-hidden="true" />
        Create key
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-3xl font-light">
              Create API key
            </DialogTitle>
            <DialogDescription className="font-mono text-[var(--mesh-muted)]">
              API keys are shown once. Store the generated value before closing
              this dialog.
            </DialogDescription>
          </DialogHeader>
          <ApiKeyDialogContent onCreated={onCreated} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApiKeyDialogContent({ onCreated }: { onCreated?: () => void }) {
  const [createdKey, setCreatedKey] = useState("");
  const [error, setError] = useState("");
  const [keyName, setKeyName] = useState(defaultKeyName);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await apiClient.apiKeys.create({ name: keyName.trim() });
      setCreatedKey(result.key);
      onCreated?.();
      toast.success("API key created");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="api-key-name">Name</Label>
          <Input
            autoFocus
            id="api-key-name"
            name="name"
            type="text"
            value={keyName}
            onChange={(event) => setKeyName(event.currentTarget.value)}
          />
        </div>
        <Button
          disabled={submitting || keyName.trim().length === 0}
          type="submit"
          variant="white"
        >
          {submitting ? (
            <IconLoader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <IconKey aria-hidden="true" />
          )}
          Create key
        </Button>
      </form>
      {createdKey.length > 0 && (
        <div className="grid gap-2 border border-[var(--mesh-line)] bg-black/20 p-3">
          <Label htmlFor="api-key-value">New key</Label>
          <div className="flex gap-2">
            <Input
              id="api-key-value"
              readOnly
              value={createdKey}
              onFocus={(event) => event.currentTarget.select()}
            />
            <CopyButton label="Copy API key" value={createdKey} />
          </div>
        </div>
      )}
      {error.length > 0 && (
        <Alert
          className="border-[var(--mesh-line)] bg-black/20"
          variant="destructive"
        >
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>Create key failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
