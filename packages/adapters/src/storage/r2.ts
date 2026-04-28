import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";
import { normalizeRunStoragePath } from "@mesh0/sdk/artifacts";
import type {
  RunStorage,
  RunStorageGet,
  RunStorageObject,
  RunStoragePut,
  StoredRunObject,
} from "../index";
import { buildRunStorageKey } from "../utils";

export class R2Storage implements RunStorage {
  readonly #bucket: R2Bucket;

  constructor({ bucket }: { bucket: R2Bucket }) {
    this.#bucket = bucket;
  }

  async put({
    body,
    contentType,
    path,
    runId,
  }: RunStoragePut): Promise<StoredRunObject> {
    const normalizedPath = normalizeRunStoragePath(path);
    const key = buildRunStorageKey({ path: normalizedPath, runId });

    await this.#bucket.put(
      key,
      toR2PutBody(body),
      contentType === undefined ? undefined : { httpMetadata: { contentType } },
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
    const key = buildRunStorageKey({ path: normalizedPath, runId });
    const object = await this.#bucket.get(key);
    if (object === null) {
      return undefined;
    }

    return {
      body: toByteStream(object.body),
      contentType: object.httpMetadata?.contentType,
      key,
      path: normalizedPath,
      runId,
    };
  }
}

function toByteStream(stream: R2ObjectBody["body"]) {
  const reader = stream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

type R2PutBody = Parameters<R2Bucket["put"]>[1];

function toR2PutBody(body: RunStoragePut["body"]): R2PutBody {
  if (typeof body === "string" || body instanceof ArrayBuffer) {
    return body;
  }

  const stream = new Response(body).body;
  if (stream === null) {
    throw new Error("Unable to stream R2 object body");
  }

  // workers-types ships its own DOM stream declarations; runtime uses the same Fetch stream.
  return stream as unknown as R2PutBody;
}
