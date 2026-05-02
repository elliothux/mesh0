import { MAX_ARTIFACT_UPLOAD_BYTES } from "@mesh0/sdk/schema";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import type { AppEnv } from "./env";
import { isAllowedWebUrl } from "./http";
import { router } from "./routes";

export const rpcHandler = new RPCHandler(router, {
  plugins: [
    new BodyLimitPlugin({
      maxBodySize: MAX_ARTIFACT_UPLOAD_BYTES + 1024 * 1024,
    }),
  ],
});

export function createCorsHeaders(request: Request, env: AppEnv) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  const origin = request.headers.get("Origin");
  if (origin !== null && isAllowedCorsOrigin(origin, request, env)) {
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

export function withCors(response: Response, request: Request, env: AppEnv) {
  const headers = new Headers(response.headers);

  for (const [key, value] of createCorsHeaders(request, env)) {
    if (key.toLowerCase() === "vary") {
      headers.append(key, value);
    } else {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isAllowedCorsOrigin(origin: string, request: Request, env: AppEnv) {
  try {
    return isAllowedWebUrl(env, request, new URL(origin));
  } catch {
    return false;
  }
}
