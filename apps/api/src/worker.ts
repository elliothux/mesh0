import { Container, getContainer } from "@cloudflare/containers";
import { CloudflareSandbox } from "@mesh0/adapters/sandbox/cloudflare";
import { R2Storage } from "@mesh0/adapters/storage/r2";
import { createDb } from "@mesh0/db";
import { Services } from "@mesh0/services";
import type { Context, WorkerEnv } from "./context";
import { corsHeaders, rpcHandler, withCors } from "./orpc";
import { handleRunStorageRequest } from "./storage";

export class Mesh0RunnerSandbox extends Container<WorkerEnv> {
  override defaultPort = 3000;
  override sleepAfter = "5m";
  override enableInternet = true;
}

export default {
  async fetch(request: Request, worker: WorkerEnv) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    const context = createWorkerContext(request, worker);
    const storageResponse = await handleRunStorageRequest(request, context);
    if (storageResponse !== undefined) {
      return withCors(storageResponse);
    }

    const result = await rpcHandler.handle(request, {
      context,
      prefix: "/rpc",
    });

    if (result.matched) {
      return withCors(result.response);
    }

    return withCors(new Response("Not Found", { status: 404 }));
  },
};

function createWorkerContext(request: Request, worker: WorkerEnv): Context {
  const db = createDb(worker.DB);
  const storage = new R2Storage({ bucket: worker.RUNS_BUCKET });
  const url = new URL(request.url);
  const isLocalDev =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (isLocalDev) {
    url.hostname = "host.docker.internal";
  }

  const sandbox = new CloudflareSandbox({
    apiUrl: url.origin,
    getContainer: (name) => getContainer(worker.RUNNER_CONTAINER, name),
  });
  const services = new Services({
    db,
    sandbox,
  });

  return { db, env: worker, services, storage };
}
