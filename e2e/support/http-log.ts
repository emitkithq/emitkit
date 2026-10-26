import type { APIResponse, TestInfo } from "@playwright/test";

/**
 * Evidence for API scenarios: every request made through a shared request
 * context is recorded and attached to the running test as `http-log`
 * (redacted by e2e/support/report.ts before it is committed).
 */
interface Entry {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly request: unknown;
  readonly response: string;
}

let entries: Entry[] = [];

export const recordResponse = async (
  method: string,
  url: string,
  request: unknown,
  response: APIResponse
) => {
  const text = await response.text();
  entries.push({
    method,
    request,
    response: text.slice(0, 4000),
    status: response.status(),
    url,
  });
  return response;
};

export const attachHttpLog = async (testInfo: TestInfo) => {
  if (entries.length > 0) {
    await testInfo.attach("http-log", {
      body: JSON.stringify(entries, null, 2),
      contentType: "application/json",
    });
  }
  entries = [];
};
