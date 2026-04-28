import { MAX_ARTIFACT_UPLOAD_BYTES } from "@mesh0/sdk/schema";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { router } from "./routes";

export const rpcHandler = new RPCHandler(router, {
  plugins: [
    new BodyLimitPlugin({
      maxBodySize: MAX_ARTIFACT_UPLOAD_BYTES + 1024 * 1024,
    }),
  ],
});

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export function withCors(response: Response) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
