import { Container, getContainer } from "@cloudflare/containers";
import { CloudflareSandbox } from "@mesh0/adapters/sandbox/cloudflare";
import { R2Storage } from "@mesh0/adapters/storage/r2";
import { createDb } from "@mesh0/db";
import { Services } from "@mesh0/services";
import { createWorkOSAuth, defaultRedirectUri, mapWorkOSUser } from "./auth";
import type { Context, WorkerEnv } from "./context";
import { parseAppEnv } from "./env";
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
    const authResponse = await handleAuthRequest(request, context);
    if (authResponse !== undefined) {
      return withCors(authResponse);
    }

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
  const appEnv = parseAppEnv(worker);
  const auth = createWorkOSAuth(appEnv);
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

  return { auth, db, env: worker, request, services, storage };
}

async function handleAuthRequest(request: Request, context: Context) {
  const url = new URL(request.url);

  if (url.pathname === "/auth/login") {
    const authorizationUrl = context.auth.getAuthorizationUrl({
      redirectUri: defaultRedirectUri(request),
      state: url.searchParams.get("state") ?? undefined,
    });

    return Response.redirect(authorizationUrl, 302);
  }

  if (url.pathname !== "/auth/callback") {
    return undefined;
  }

  const code = url.searchParams.get("code");
  if (code === null) {
    return new Response("Missing code", { status: 400 });
  }

  const auth = await context.auth.authenticateWithCode({
    code,
    ipAddress: request.headers.get("CF-Connecting-IP") ?? undefined,
    userAgent: request.headers.get("User-Agent") ?? undefined,
  });
  const user = await context.services.user.upsert(mapWorkOSUser(auth.user));

  return Response.json({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    user,
  });
}
