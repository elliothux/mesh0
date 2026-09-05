import type { Context } from "./context";
import { createCorsHeaders, rpcHandler, withCors } from "./orpc";
import { handleRunStorageRequest } from "./storage";
import { handleWebhookRequest } from "./webhook";
import { handleRunWorkspaceRequest } from "./workspace";

export type CreateApiContext = (request: Request) => Context | Promise<Context>;

export function createApiFetchHandler(createContext: CreateApiContext) {
  return async function apiFetch(request: Request) {
    return handleApiRequest(request, await createContext(request));
  };
}

export async function handleApiRequest(request: Request, context: Context) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: createCorsHeaders(request, context.env),
      status: 204,
    });
  }

  const storageResponse = await handleRunStorageRequest(request, context);
  if (storageResponse !== undefined) {
    return withCors(
      mergeResponseHeaders(storageResponse, context.responseHeaders),
      request,
      context.env,
    );
  }

  const webhookResponse = await handleWebhookRequest(request, context);
  if (webhookResponse !== undefined) {
    return withCors(
      mergeResponseHeaders(webhookResponse, context.responseHeaders),
      request,
      context.env,
    );
  }

  const workspaceResponse = await handleRunWorkspaceRequest(request, context);
  if (workspaceResponse !== undefined) {
    return withCors(
      mergeResponseHeaders(workspaceResponse, context.responseHeaders),
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
