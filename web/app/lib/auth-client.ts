import { forgetRememberedEndpoints, releaseDevicePush } from "@app/lib/push";
import { forgetVisitor } from "@ui/visits";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * The Better Auth client. The dashboard is same-origin with Better Auth
 * (`/api/auth` on the app host), so cookies flow without CORS.
 */
const PRINTABLE = /[^ -~]/gu;

/** Auth calls after which nobody is signed in on this device. */
const SIGNED_OUT = /\/api\/auth\/(?:sign-out|delete-user)(?:\/|$)/u;
/** Sign-out, before which this device's pushes are released (it needs the session). */
const SIGN_OUT = /\/api\/auth\/sign-out(?:\/|$)/u;

/**
 * The auth client turns a failed response into an error whose message is the
 * `statusText`: empty over HTTP/2 (Cloudflare), so forms showed a bare "401",
 * and a generic "Unauthorized" over HTTP/1.1 (`vite dev`). Copy the server's
 * JSON `message` into `statusText` so every auth form shows the real reason.
 */
const fetchWithReasonPhrase: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (SIGN_OUT.test(new URL(url, window.location.origin).pathname)) {
    await releaseDevicePush();
  }
  const response = await fetch(input, init);
  if (response.ok) {
    return response;
  }
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const message =
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message.replaceAll(PRINTABLE, "").slice(0, 200)
      : "";
  return message
    ? new Response(response.body, {
        headers: response.headers,
        status: response.status,
        statusText: message,
      })
    : response;
};

export const authClient = createAuthClient({
  basePath: "/api/auth",
  baseURL: window.location.origin,
  fetchOptions: {
    customFetchImpl: fetchWithReasonPhrase,
    onSuccess({ response }) {
      if (SIGNED_OUT.test(new URL(response.url).pathname)) {
        forgetVisitor();
        forgetRememberedEndpoints();
      }
    },
  },
  plugins: [emailOTPClient(), organizationClient()],
});

export type AuthClient = typeof authClient;

interface BetterAuthResult<T> {
  data: T | null;
  error: {
    message?: string | undefined;
    status: number;
    statusText: string;
  } | null;
}

/** Unwraps a Better Auth `{ data, error }` result, throwing its message. */
export const unwrap = async <T>(
  pending: Promise<BetterAuthResult<T>>
): Promise<T> => {
  const { data, error } = await pending;
  if (error) {
    throw new Error(error.message || error.statusText || "The request failed.");
  }
  if (data === null) {
    throw new Error("The request returned no data.");
  }
  return data;
};
