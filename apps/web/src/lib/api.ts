import type { RpcRouter } from "@mesh0/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";
import { appendSetCookieHeaders } from "./headers";

type ApiClientContext = {
  cookie?: string;
  responseHeaders?: Headers;
};

export const apiUrl = env.VITE_MESH0_API_URL.replace(/\/$/, "");
const link = new RPCLink<ApiClientContext>({
  fetch: async (request, init, options) => {
    const response = await fetch(request, { ...init, credentials: "include" });
    const { responseHeaders } = options.context;
    if (responseHeaders !== undefined) {
      appendSetCookieHeaders(response.headers, responseHeaders);
    }

    return response;
  },
  headers: ({ context }) => {
    const headers = new Headers();
    if (context.cookie !== undefined) {
      headers.set("Cookie", context.cookie);
    }

    return headers;
  },
  url: `${apiUrl}/rpc`,
});

export const apiClient: RouterClient<RpcRouter, ApiClientContext> =
  createORPCClient(link);
export const orpc = createTanstackQueryUtils(apiClient);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
});
