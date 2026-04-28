import type { AgentRunRecord } from "@mesh0/sdk/types";

/**
 * Runer Sandbox
 */
export interface RunnerSandboxStart {
  run: AgentRunRecord;
}

export interface RunnerSandboxDispatch {
  completion?: Promise<void>;
}

export interface RunnerSandbox {
  start(input: RunnerSandboxStart): Promise<RunnerSandboxDispatch>;
}

/**
 * Run Storage
 */
export type RunStorageBody =
  | ArrayBuffer
  | Blob
  | ReadableStream<Uint8Array>
  | string;

export interface RunStoragePut {
  body: RunStorageBody;
  contentType?: string;
  path: string;
  runId: string;
}

export interface RunStorageGet {
  path: string;
  runId: string;
}

export interface RunStorageObject {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  key: string;
  path: string;
  runId: string;
}

export interface StoredRunObject {
  contentType?: string;
  key: string;
  path: string;
  runId: string;
}

export interface RunStorage {
  get(input: RunStorageGet): Promise<RunStorageObject | undefined>;
  put(input: RunStoragePut): Promise<StoredRunObject>;
}
