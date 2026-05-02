import type { RpcRouter } from "@mesh0/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";

type ApiClientContext = {
  cookie?: string;
};

export const apiUrl = env.VITE_MESH0_API_URL.replace(/\/$/, "");
const link = new RPCLink<ApiClientContext>({
  fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
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
