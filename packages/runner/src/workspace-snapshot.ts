import type {
  WorkspaceSnapshotEntry,
  WorkspaceSnapshotFileEntry,
  WorkspaceSnapshotSegment,
} from "@mesh0/sdk/types";
import createIgnore, { type Ignore } from "ignore";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  writeFile,
} from "node:fs/promises";
import { join, posix } from "node:path";
import {
  collectIfFile,
  contentTypeForPath,
  endWritable,
  writeChunk,
} from "./io";
import type { OutputObject } from "./types";

const PACK_MAX_BYTES = 64 * 1024 * 1024;
const WORKSPACE_MANIFEST_RELATIVE_KEY = "workspace/manifest.json";
export const WORKSPACE_ARTIFACT_STORAGE_PATH = `output/${WORKSPACE_MANIFEST_RELATIVE_KEY}`;
const builtInIgnorePatterns = [
  ".git/",
  ".hg/",
  ".svn/",
  "node_modules/",
  "bower_components/",
  ".yarn/cache/",
  ".pnpm-store/",
  ".npm/",
  ".bun/",
  ".cache/",
  ".parcel-cache/",
  ".turbo/",
  ".vite/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".vercel/",
  ".netlify/",
  ".wrangler/",
  "coverage/",
  "dist/",
  "build/",
  "out/",
  "target/",
  ".gradle/",
  ".idea/",
  ".DS_Store",
];

type IgnoreMatcher = {
  basePath: string;
  ignore: Ignore;
};

type WorkspaceSnapshotResult = {
  manifestPath: string;
  outputObjects: OutputObject[];
};

export async function createWorkspaceSnapshot({
  ignorePatterns = [],
  runId,
  workspace,
  workspaceOutputDir,
}: {
  ignorePatterns?: string[];
  runId: string;
  workspace: string;
  workspaceOutputDir: string;
}): Promise<WorkspaceSnapshotResult> {
  const packWriter = new PackWriter({
    packsDir: join(workspaceOutputDir, "packs"),
    runId,
  });
  const entries: WorkspaceSnapshotEntry[] = [];
  const rootIgnore = createIgnore().add([
    ...builtInIgnorePatterns,
    ...ignorePatterns,
  ]);
  const ignoreMatchers: IgnoreMatcher[] = [
    { basePath: "", ignore: rootIgnore },
  ];

  await walkWorkspace({
    absolutePath: workspace,
    entries,
    ignoreMatchers,
    packWriter,
    relativePath: "",
  });

  const outputObjects = await packWriter.close();
  const manifestPath = join(workspaceOutputDir, "manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        entries,
        root: "workspace",
        version: 1,
      },
      null,
      2,
    )}\n`,
  );
  await collectIfFile(
    outputObjects,
    runId,
    manifestPath,
    WORKSPACE_MANIFEST_RELATIVE_KEY,
  );

  return { manifestPath, outputObjects };
}

async function walkWorkspace({
  absolutePath,
  entries,
  ignoreMatchers,
  packWriter,
  relativePath,
}: {
  absolutePath: string;
  entries: WorkspaceSnapshotEntry[];
  ignoreMatchers: IgnoreMatcher[];
  packWriter: PackWriter;
  relativePath: string;
}) {
  const stats = await lstat(absolutePath);
  if (relativePath.length > 0) {
    entries.push({
      mode: stats.mode,
      path: relativePath,
      type: "dir",
    });
  }

  const directoryIgnore = await readDirectoryIgnore(absolutePath, relativePath);
  if (directoryIgnore !== undefined) {
    ignoreMatchers.push(directoryIgnore);
  }

  const dirents = await readdir(absolutePath, { withFileTypes: true });
  for (const dirent of dirents.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const childRelativePath = joinWorkspacePath(relativePath, dirent.name);
    if (
      isIgnored({
        ignoreMatchers,
        isDirectory: dirent.isDirectory(),
        relativePath: childRelativePath,
      })
    ) {
      continue;
    }

    const childAbsolutePath = join(absolutePath, dirent.name);
    if (dirent.isDirectory()) {
      await walkWorkspace({
        absolutePath: childAbsolutePath,
        entries,
        ignoreMatchers,
        packWriter,
        relativePath: childRelativePath,
      });
      continue;
    }

    if (dirent.isFile()) {
      entries.push(
        await createFileEntry({
          absolutePath: childAbsolutePath,
          packWriter,
          relativePath: childRelativePath,
        }),
      );
      continue;
    }

    if (dirent.isSymbolicLink()) {
      const linkStats = await lstat(childAbsolutePath);
      entries.push({
        mode: linkStats.mode,
        path: childRelativePath,
        target: await readlink(childAbsolutePath),
        type: "symlink",
      });
    }
  }

  if (directoryIgnore !== undefined) {
    ignoreMatchers.pop();
  }
}

async function createFileEntry({
  absolutePath,
  packWriter,
  relativePath,
}: {
  absolutePath: string;
  packWriter: PackWriter;
  relativePath: string;
}): Promise<WorkspaceSnapshotFileEntry> {
  const stats = await lstat(absolutePath);
  const packedFile = await packWriter.addFile(absolutePath);

  return {
    contentType: contentTypeForPath(relativePath),
    digest: packedFile.digest,
    mode: stats.mode,
    path: relativePath,
    segments: packedFile.segments,
    size: stats.size,
    type: "file",
  };
}

async function readDirectoryIgnore(
  absolutePath: string,
  relativePath: string,
): Promise<IgnoreMatcher | undefined> {
  try {
    const source = await readFile(join(absolutePath, ".gitignore"), "utf8");
    return {
      basePath: relativePath,
      ignore: createIgnore().add(source),
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isIgnored({
  ignoreMatchers,
  isDirectory,
  relativePath,
}: {
  ignoreMatchers: IgnoreMatcher[];
  isDirectory: boolean;
  relativePath: string;
}) {
  const pathForDirectory = isDirectory ? `${relativePath}/` : relativePath;
  for (const matcher of ignoreMatchers) {
    const matcherPath = relativePathForMatcher(
      pathForDirectory,
      matcher.basePath,
    );
    if (matcherPath !== undefined && matcher.ignore.ignores(matcherPath)) {
      return true;
    }
  }

  return false;
}

function relativePathForMatcher(path: string, basePath: string) {
  if (basePath.length === 0) {
    return path;
  }

  if (!path.startsWith(`${basePath}/`)) {
    return undefined;
  }

  const relativePath = path.slice(basePath.length + 1);
  return relativePath.length === 0 ? undefined : relativePath;
}

function joinWorkspacePath(parent: string, child: string) {
  return parent.length === 0 ? child : posix.join(parent, child);
}

class PackWriter {
  readonly #outputObjects: OutputObject[] = [];
  readonly #packsDir: string;
  readonly #runId: string;
  #currentPack: CurrentPack | undefined;
  #packIndex = 0;

  constructor({ packsDir, runId }: { packsDir: string; runId: string }) {
    this.#packsDir = packsDir;
    this.#runId = runId;
  }

  async addFile(path: string) {
    const hash = createHash("sha256");
    const segments: WorkspaceSnapshotSegment[] = [];
    const reader = Bun.file(path).stream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      hash.update(value);
      await this.#writeChunk(value, segments);
    }

    return {
      digest: `sha256:${hash.digest("hex")}`,
      segments,
    };
  }

  async close() {
    if (this.#currentPack !== undefined) {
      await this.#closeCurrentPack();
    }

    return this.#outputObjects;
  }

  async #writeChunk(chunk: Uint8Array, segments: WorkspaceSnapshotSegment[]) {
    let cursor = 0;
    while (cursor < chunk.length) {
      const pack = await this.#ensurePack();
      const available = PACK_MAX_BYTES - pack.size;
      const length = Math.min(available, chunk.length - cursor);
      const offset = pack.size;
      const slice = chunk.subarray(cursor, cursor + length);

      await writeChunk(pack.stream, slice);
      pack.hash.update(slice);
      pack.size += length;
      cursor += length;
      appendSegment(segments, {
        key: `output/${pack.relativeKey}`,
        length,
        offset,
      });

      if (pack.size === PACK_MAX_BYTES) {
        await this.#closeCurrentPack();
      }
    }
  }

  async #ensurePack() {
    if (this.#currentPack !== undefined) {
      return this.#currentPack;
    }

    await mkdir(this.#packsDir, { recursive: true });
    const fileName = `pack-${String(this.#packIndex).padStart(5, "0")}.bin`;
    this.#packIndex += 1;
    const path = join(this.#packsDir, fileName);
    const relativeKey = `workspace/packs/${fileName}`;
    this.#currentPack = {
      hash: createHash("sha256"),
      path,
      relativeKey,
      size: 0,
      stream: createWriteStream(path),
    };

    return this.#currentPack;
  }

  async #closeCurrentPack() {
    const pack = this.#currentPack;
    if (pack === undefined) {
      return;
    }

    await endWritable(pack.stream);
    this.#outputObjects.push({
      contentType: "application/octet-stream",
      digest: `sha256:${pack.hash.digest("hex")}`,
      key: `runs/${this.#runId}/output/${pack.relativeKey}`,
      path: pack.path,
      size: pack.size,
    });
    this.#currentPack = undefined;
  }
}

type CurrentPack = {
  hash: ReturnType<typeof createHash>;
  path: string;
  relativeKey: string;
  size: number;
  stream: ReturnType<typeof createWriteStream>;
};

function appendSegment(
  segments: WorkspaceSnapshotSegment[],
  segment: WorkspaceSnapshotSegment,
) {
  const previous = segments.at(-1);
  if (
    previous !== undefined &&
    previous.key === segment.key &&
    previous.offset + previous.length === segment.offset
  ) {
    previous.length += segment.length;
    return;
  }

  segments.push(segment);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
