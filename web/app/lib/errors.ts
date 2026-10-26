import { ORPCError } from "@orpc/client";

export const rpcErrorCode = (error: unknown): string | undefined =>
  error instanceof ORPCError ? error.code : undefined;

export const isUnauthorized = (error: unknown): boolean =>
  rpcErrorCode(error) === "UNAUTHORIZED";

const NO_WORKSPACE = /no workspace/iu;

/**
 * The backend answers FORBIDDEN "No workspace selected" when the session has
 * no active organization (as opposed to a role that may not do something).
 */
export const isMissingWorkspace = (error: unknown): boolean =>
  error instanceof ORPCError &&
  error.code === "FORBIDDEN" &&
  NO_WORKSPACE.test(error.message);

const USER_FACING_CODES = new Set<string>([
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "NOT_FOUND",
]);

/**
 * A message that is safe and useful to show a person. Validation, conflict,
 * permission and not-found errors carry the server's explanation; anything
 * else (network, 5xx) gets the caller's fallback.
 */
export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ORPCError) {
    return USER_FACING_CODES.has(error.code) && error.message
      ? error.message
      : fallback;
  }
  if (
    error instanceof Error &&
    error.message &&
    !(error instanceof TypeError)
  ) {
    return error.message;
  }
  return fallback;
};
