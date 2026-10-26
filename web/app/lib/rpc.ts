import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { DashboardContract } from "@shared/rpc/contract";

export type RpcClient = RouterContractClient<DashboardContract>;

/**
 * The dashboard RPC client. Every procedure runs against the session's active
 * organization, so no call ever names an organization.
 */
export const rpc: RpcClient = createORPCClient(
  new RPCLink({
    fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
    origin: window.location.origin,
    url: "/rpc",
  })
);

export const orpc = createTanstackQueryUtils(rpc);
