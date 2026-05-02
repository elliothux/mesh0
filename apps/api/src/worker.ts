import { Container, getContainer } from "@cloudflare/containers";
import { CloudflareSandbox } from "@mesh0/adapters/sandbox/cloudflare";
import { R2Storage } from "@mesh0/adapters/storage/r2";
import { createDb } from "@mesh0/db";
import { Services } from "@mesh0/services";
import {
  appendAuthCookies,
  createWorkOSAuth,
  defaultRedirectUri,
  mapWorkOSUser,
  resolveAuthRedirectUrl,
} from "./auth";
import type { Context, WorkerEnv } from "./context";
import { parseAppEnv, type AppEnv } from "./env";
import { isLocalHost } from "./http";
import { createCorsHeaders, rpcHandler, withCors } from "./orpc";
import { handleRunStorageRequest } from "./storage";

export class Mesh0RunnerSandbox extends Container<WorkerEnv> {
  override defaultPort = 3000;
  override sleepAfter = "5m";
  override enableInternet = true;
}

export default {
  async fetch(request: Request, worker: WorkerEnv) {
    const appEnv = parseAppEnv(worker);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: createCorsHeaders(request, appEnv),
        status: 204,
      });
    }

    const context = createWorkerContext(request, worker, appEnv);
    const authResponse = await handleAuthRequest(request, context);
    if (authResponse !== undefined) {
      return withCors(authResponse, request, context.env);
    }

    const storageResponse = await handleRunStorageRequest(request, context);
    if (storageResponse !== undefined) {
      return withCors(
        mergeResponseHeaders(storageResponse, context.responseHeaders),
        request,
        context.env,
      );
    }

    const result = await rpcHandler.handle(request, {
      context,
      prefix: "/rpc",
    });

    if (result.matched) {
      return withCors(
        mergeResponseHeaders(result.response, context.responseHeaders),
        request,
        context.env,
      );
    }

    return withCors(
      new Response("Not Found", { status: 404 }),
      request,
      context.env,
    );
  },
};

function createWorkerContext(
  request: Request,
  worker: WorkerEnv,
  appEnv: AppEnv,
): Context {
  const auth = createWorkOSAuth(appEnv);
  const db = createDb(worker.DB);
  const env = { ...worker, ...appEnv };
  const storage = new R2Storage({ bucket: worker.RUNS_BUCKET });
  const url = new URL(request.url);
  const isLocalDev = isLocalHost(url.hostname);

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

async function handleAuthRequest(request: Request, context: Context) {
  const url = new URL(request.url);

  if (url.pathname === "/auth/login") {
    const nextUrl = resolveAuthRedirectUrl({
      env: context.env,
      next: url.searchParams.get("next") ?? url.searchParams.get("state"),
      request,
    });
    if (nextUrl === null) {
      return new Response("Invalid next URL", { status: 400 });
    }

    const authorizationUrl = context.auth.getAuthorizationUrl({
      redirectUri: defaultRedirectUri(request),
      state: nextUrl.toString(),
    });

    return Response.redirect(authorizationUrl, 302);
  }

  if (url.pathname !== "/auth/callback") {
    return undefined;
  }

  const nextUrl = resolveAuthRedirectUrl({
    env: context.env,
    next: url.searchParams.get("state"),
    request,
  });
  if (nextUrl === null) {
    return new Response("Invalid state URL", { status: 400 });
  }

  if (url.searchParams.get("error") !== null) {
    return Response.redirect(new URL("/", nextUrl).toString(), 302);
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
  await context.services.user.upsert(mapWorkOSUser(auth.user));
  const response = new Response(null, {
    headers: { Location: nextUrl.toString() },
    status: 302,
  });
  appendAuthCookies({
    env: context.env,
    headers: response.headers,
    request,
    tokens: auth,
  });

  return response;
}

function mergeResponseHeaders(response: Response, headers: Headers) {
  if ([...headers].length === 0) {
    return response;
  }

  const mergedHeaders = new Headers(response.headers);
  for (const [key, value] of headers) {
    mergedHeaders.append(key, value);
  }

  return new Response(response.body, {
    headers: mergedHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}
