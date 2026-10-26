import { isMissingWorkspace, isUnauthorized } from "@app/lib/errors";
import { COMMON_ERROR_STATUS_MAP, ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";

const MAX_RETRIES = 2;
const NOT_IMPLEMENTED = 501;
const SERVER_ERROR = 500;

const statusOf = (error: ORPCError<string, unknown>): number => {
  const statuses: Readonly<Record<string, number>> = COMMON_ERROR_STATUS_MAP;
  return statuses[error.code] ?? SERVER_ERROR;
};

/** 4xx (and 501) answers are final; only network failures and 5xx deserve a retry. */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ORPCError) {
    const status = statusOf(error);
    if (status < SERVER_ERROR || status === NOT_IMPLEMENTED) {
      return false;
    }
  }
  return failureCount < MAX_RETRIES;
};

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: shouldRetry, staleTime: 10_000 },
    },
  });

interface RpcErrorHandlers {
  /** The session ended (or never existed) while the dashboard was open. */
  onUnauthorized: () => void;
  /** The session has no organization to work in. */
  onMissingWorkspace: () => void;
}

/**
 * Reacts to session-level RPC failures wherever they happen: an expired
 * session sends the reader to sign in, a session without a workspace to
 * getting started.
 */
export const watchRpcErrors = (
  queryClient: QueryClient,
  handlers: RpcErrorHandlers
): (() => void) => {
  const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") {
      return;
    }
    const { error } = event.action;
    if (isUnauthorized(error)) {
      handlers.onUnauthorized();
    } else if (isMissingWorkspace(error)) {
      handlers.onMissingWorkspace();
    }
  });
  const unsubscribeMutations = queryClient
    .getMutationCache()
    .subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "error" &&
        isUnauthorized(event.action.error)
      ) {
        handlers.onUnauthorized();
      }
    });
  return () => {
    unsubscribeQueries();
    unsubscribeMutations();
  };
};
