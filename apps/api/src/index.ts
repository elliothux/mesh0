import { createDb } from "@mesh0/db";
import { corsHeaders, rpcHandler, withCors } from "./orpc";

import type { Context } from "./context";

type WorkerEnv = { DB: D1Database };

export default {
  async fetch(request, worker) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    const result = await rpcHandler.handle(request, {
      context: { db: createDb(worker.DB) } satisfies Context,
      prefix: "/rpc",
    });

    if (result.matched) {
      return withCors(result.response);
    }

    return withCors(new Response("Not Found", { status: 404 }));
  },
} satisfies ExportedHandler<WorkerEnv>;
