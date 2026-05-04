import {
  buildRunStorageUri,
  normalizeRunStoragePath,
} from "@mesh0/sdk/artifacts";
import type { ArtifactRef } from "@mesh0/sdk/types";
import type { StoredRunObject } from "./index";

export function buildRunStorageKey({
  path,
  runId,
}: {
  path: string;
  runId: string;
}) {
  return `runs/${runId}/${normalizeRunStoragePath(path)}`;
}

export function buildArtifactRef(object: StoredRunObject): ArtifactRef {
  return {
    contentType: object.contentType,
    id: object.key,
    kind: kindForArtifactPath(object.path),
    runId: object.runId,
    uri: buildRunStorageUri(object),
  };
}

export function kindForArtifactPath(path: string): ArtifactRef["kind"] {
  if (path.endsWith("workspace/manifest.json")) {
    return "directory";
  }

  if (path.endsWith(".json") || path.endsWith(".jsonl")) {
    return "json";
  }

  if (path.endsWith(".log")) {
    return "log";
  }

  return "text";
}
