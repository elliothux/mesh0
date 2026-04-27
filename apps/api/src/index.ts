import { createDb } from "@mesh0/db";
import { RPCHandler } from "@orpc/server/fetch";

import { appRouter } from "./router";

interface Env {
  DB: D1Database;
}

const rpcHandler = new RPCHandler(appRouter);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function withCors(response: Response) {
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    const result = await rpcHandler.handle(request, {
      context: { db: createDb(env.DB) },
      prefix: "/rpc",
    });

    if (result.matched) {
      return withCors(result.response);
    }

    return withCors(new Response("Not Found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
