import { setTimeout as sleep } from "node:timers/promises";

import type { APIRequestContext } from "@playwright/test";

import { recordResponse } from "./http-log";
import { target, TEST_PASSWORD, testEmail } from "./targets";

/**
 * `POST` to a Better Auth route. It allows three sign-ups or sign-ins per 10
 * seconds from one address, and scenarios run back to back, so a 429 waits
 * out its `X-Retry-After` once.
 */
export const postAuth = async (
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
  headers: Record<string, string> = {}
) => {
  const attempt = () =>
    request.post(`${target.app}${path}`, {
      data,
      headers: { ...headers, origin: target.origin },
    });
  const first = await attempt();
  if (first.status() !== 429) {
    return first;
  }
  const seconds = Number(first.headers()["x-retry-after"] ?? "10");
  await sleep((seconds + 1) * 1000);
  return attempt();
};

const NOT_SLUG = /[^a-z0-9]+/gu;

const slugOf = (name: string) => name.toLowerCase().replace(NOT_SLUG, "-");

/**
 * An account driven purely over HTTP (Better Auth + dashboard oRPC). Used to
 * arrange state for API scenarios and to clean up afterwards; secrets stay
 * in memory and are never logged unredacted.
 */
export class ApiSession {
  readonly email: string;
  private readonly request: APIRequestContext;

  private constructor(request: APIRequestContext, email: string) {
    this.request = request;
    this.email = email;
  }

  /** A new account; `email` defaults to the run's test mailbox. */
  static async signUp(
    request: APIRequestContext,
    label: string,
    options: {
      readonly email?: string;
      readonly headers?: Record<string, string>;
    } = {}
  ) {
    const email = options.email ?? testEmail(label);
    const response = await postAuth(
      request,
      "/api/auth/sign-up/email",
      { email, name: `E2E ${label}`, password: TEST_PASSWORD },
      options.headers
    );
    if (!response.ok()) {
      throw new Error(
        `sign-up failed: ${response.status()} ${await response.text()}`
      );
    }
    return new ApiSession(request, email);
  }

  async rpc<T>(procedure: string, input: unknown = {}): Promise<T> {
    const url = `${target.app}/rpc/${procedure}`;
    const raw = await this.request.post(url, {
      data: { json: input },
      headers: { origin: target.origin },
    });
    const response = await recordResponse("POST", url, input, raw);
    const body: { json: T } = await response.json();
    if (!response.ok()) {
      throw new Error(
        `rpc ${procedure} failed: ${response.status()} ${JSON.stringify(body)}`
      );
    }
    return body.json;
  }

  bootstrap(organizationName: string, projectName: string) {
    return this.rpc<{
      organizationId: string;
      organizationSlug: string;
      project: { id: string; name: string };
      apiKey: { apiKey: { id: string; start: string | null }; secret: string };
    }>("gettingStarted/bootstrap", { organizationName, projectName });
  }

  /** Another organization owned by this account; resolves to its id. */
  async createOrganization(name: string) {
    const url = `${target.app}/api/auth/organization/create`;
    const data = { name, slug: `${slugOf(name)}-${Date.now()}` };
    const response = await recordResponse(
      "POST",
      url,
      data,
      await this.request.post(url, {
        data,
        headers: { origin: target.origin },
      })
    );
    if (!response.ok()) {
      throw new Error(
        `organization create failed: ${response.status()} ${await response.text()}`
      );
    }
    const created: { id: string } = await response.json();
    return created.id;
  }

  /** Deletes the organization (cascades projects and channels) and then the user. */
  async destroy(organizationId?: string) {
    if (organizationId) {
      await this.request.post(`${target.app}/api/auth/organization/delete`, {
        data: { organizationId },
        headers: { origin: target.origin },
      });
    }
    await this.request.post(`${target.app}/api/auth/delete-user`, {
      data: { password: TEST_PASSWORD },
      headers: { origin: target.origin },
    });
  }
}
