export function buildRunStorageUri({
  path,
  runId,
}: {
  path: string;
  runId: string;
}) {
  return `/runs/${encodeURIComponent(runId)}/storage/${normalizeRunStoragePath(
    path,
  )
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function parseRunStoragePathname(pathname: string) {
  const prefix = "/runs/";
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const [runId, storage, ...pathParts] = pathname
    .slice(prefix.length)
    .split("/");
  if (runId === undefined || storage !== "storage" || pathParts.length === 0) {
    return undefined;
  }

  try {
    return {
      path: normalizeRunStoragePath(
        pathParts.map(decodeURIComponent).join("/"),
      ),
      runId: decodeURIComponent(runId),
    };
  } catch {
    return undefined;
  }
}

export function normalizeRunStoragePath(path: string) {
  const parts = path.split("/").filter((part) => part.length > 0);
  const normalized = parts.join("/");

  if (normalized.length === 0 || parts.includes("..")) {
    throw new Error(`Invalid run storage path: ${path}`);
  }

  return normalized;
}
