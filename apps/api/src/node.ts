import type { RunStorage } from "@mesh0/adapters";
import type { Db } from "@mesh0/db";
import type { Services } from "@mesh0/services";
import { Buffer } from "node:buffer";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createApiFetchHandler } from "./app";
import type { WorkOSAuth } from "./auth";
import type { Context, WorkerEnv } from "./context";

export type NodeApiRuntime = {
  auth: WorkOSAuth;
  db: Db;
  env: WorkerEnv;
  services: Services;
  storage: RunStorage;
};

export type NodeApiServerOptions = NodeApiRuntime & {
  hostname?: string;
  port?: number;
};

export function createNodeApiFetch(runtime: NodeApiRuntime) {
  return createApiFetchHandler((request) =>
    createNodeApiContext(runtime, request),
  );
}

export function createNodeApiServer({
  hostname = "127.0.0.1",
  port = 0,
  ...runtime
}: NodeApiServerOptions) {
  const apiFetch = createNodeApiFetch(runtime);
  const server = createServer(async (request, response) => {
    try {
      await writeNodeResponse(
        response,
        await apiFetch(await toFetchRequest(request)),
      );
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.listen(port, hostname);
  return server;
}

function createNodeApiContext(
  { auth, db, env, services, storage }: NodeApiRuntime,
  request: Request,
): Context {
  return {
    auth,
    db,
    env,
    request,
    responseHeaders: new Headers(),
    services,
    storage,
  };
}

async function toFetchRequest(request: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return new Request(nodeRequestUrl(request), {
    body: requestHasBody(request) ? await readRequestBody(request) : undefined,
    headers,
    method: request.method,
  });
}

function nodeRequestUrl(request: IncomingMessage) {
  const host = request.headers.host;
  if (host === undefined) {
    throw new Error("Node API request host header is required");
  }

  return `http://${host}${request.url ?? "/"}`;
}

function requestHasBody(request: IncomingMessage) {
  return request.method !== "GET" && request.method !== "HEAD";
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

async function writeNodeResponse(
  response: ServerResponse,
  fetchResponse: Response,
) {
  response.writeHead(
    fetchResponse.status,
    Object.fromEntries(fetchResponse.headers),
  );
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}
