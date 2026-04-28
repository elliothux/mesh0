import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { RpcClient } from "@mesh0/api";

const apiUrl = (
  import.meta.env.VITE_API_URL ?? "http://localhost:5592"
).replace(/\/$/, "");

const link = new RPCLink({
  url: `${apiUrl}/rpc`,
});

export const client: RpcClient = createORPCClient(link);
