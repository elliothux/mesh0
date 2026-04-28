import { normalizeRunStoragePath } from "@mesh0/sdk/artifacts";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type {
  RunStorage,
  RunStorageGet,
  RunStorageObject,
  RunStoragePut,
  StoredRunObject,
} from "../index";
import { buildRunStorageKey } from "../utils";

const metadataSchema = z.strictObject({
  contentType: z.string().optional(),
});

export class FsRunStorageProvider implements RunStorage {
  readonly #rootDir: string;

  constructor({ rootDir }: { rootDir: string }) {
    this.#rootDir = resolve(rootDir);
  }

  async put({
    body,
    contentType,
    path,
    runId,
  }: RunStoragePut): Promise<StoredRunObject> {
    const normalizedPath = normalizeRunStoragePath(path);
    const key = normalizeRunStoragePath(
      buildRunStorageKey({ path: normalizedPath, runId }),
    );
    const filePath = this.#filePath(key);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, new Uint8Array(await bodyToArrayBuffer(body)));
    await writeFile(
      metadataPath(filePath),
      `${JSON.stringify({ contentType }, null, 2)}\n`,
    );

    return {
      contentType,
      key,
      path: normalizedPath,
      runId,
    };
  }

  async get({
    path,
    runId,
  }: RunStorageGet): Promise<RunStorageObject | undefined> {
    const normalizedPath = normalizeRunStoragePath(path);
    const key = normalizeRunStoragePath(
      buildRunStorageKey({ path: normalizedPath, runId }),
    );
    const filePath = this.#filePath(key);

    if (!(await fileExists(filePath))) {
      return undefined;
    }

    return {
      body: Bun.file(filePath).stream(),
      contentType: await readContentType(filePath),
      key,
      path: normalizedPath,
      runId,
    };
  }

  #filePath(key: string) {
    return join(this.#rootDir, key);
  }
}

async function bodyToArrayBuffer(body: RunStoragePut["body"]) {
  if (typeof body === "string") {
    return new TextEncoder().encode(body).buffer;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (body instanceof Blob) {
    return body.arrayBuffer();
  }

  return new Response(body).arrayBuffer();
}

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function readContentType(path: string) {
  const metadata = await readMetadata(path);
  return metadata.contentType;
}

async function readMetadata(path: string) {
  try {
    return metadataSchema.parse(
      JSON.parse(await readFile(metadataPath(path), "utf8")),
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function metadataPath(path: string) {
  return `${path}.metadata.json`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
