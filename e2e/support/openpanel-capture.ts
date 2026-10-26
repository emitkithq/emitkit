import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

/** One request OpenPanel's `/track` received (secret removed). */
export interface CapturedRequest {
  readonly type: string;
  readonly payload: {
    readonly name?: string;
    readonly profileId?: string;
    readonly email?: string;
    readonly firstName?: string;
    readonly properties?: Record<string, unknown>;
  };
  readonly headers: {
    readonly clientId: string | undefined;
    readonly hasClientSecret: boolean;
    readonly userAgent: string | undefined;
    readonly clientIp: string | undefined;
    /** Set for requests from a page (the browser SDK), not the Worker. */
    readonly origin: string | undefined;
  };
}

const header = (headers: IncomingHttpHeaders, name: string) => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * A stand-in OpenPanel API on localhost. The dev server's telemetry points
 * at it (`TELEMETRY_OPENPANEL_API_URL`), so scenarios can read exactly what
 * the Worker and the pages (`web/ui/visits.ts`) report. It answers like OpenPanel (`200 {}`) and keeps every
 * request in memory; the client secret is only recorded as present.
 */
export const startOpenPanelCapture = async (port: number) => {
  const requests: CapturedRequest[] = [];
  const server = createServer((request, response) => {
    // Pages call it cross-origin, with OpenPanel's headers, like the real API.
    response.setHeader("access-control-allow-origin", "*");
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST, OPTIONS",
      });
      response.end();
      return;
    }
    let body = "";
    request.setEncoding("utf-8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = JSON.parse(body || "{}") as Omit<
        CapturedRequest,
        "headers"
      >;
      requests.push({
        ...parsed,
        headers: {
          clientId: header(request.headers, "openpanel-client-id"),
          clientIp: header(request.headers, "openpanel-client-ip"),
          hasClientSecret: Boolean(
            header(request.headers, "openpanel-client-secret")
          ),
          origin: header(request.headers, "origin"),
          userAgent: header(request.headers, "user-agent"),
        },
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");

  /** The first request matching `match`, waiting up to 15 s. */
  const waitFor = async (
    match: (request: CapturedRequest) => boolean,
    missing: string
  ) => {
    for (let waited = 0; waited < 15_000; waited += 250) {
      const found = requests.find(match);
      if (found) {
        return found;
      }
      await sleep(250);
    }
    throw new Error(missing);
  };

  return {
    async close() {
      server.close();
      await once(server, "close");
    },
    requests,
    /** The first request matching `match`, waiting up to 15 s. */
    waitFor,
    /** The first tracked `name` matching `where`, waiting up to 15 s. */
    track(
      name: string,
      where: (request: CapturedRequest) => boolean = () => true
    ) {
      return waitFor(
        (request) =>
          request.type === "track" &&
          request.payload.name === name &&
          where(request),
        `OpenPanel never received "${name}"`
      );
    },
    /** The properties of the first tracked `name` matching `where`. */
    async properties(
      name: string,
      where: (request: CapturedRequest) => boolean = () => true
    ) {
      const found = await this.track(name, where);
      return found.payload.properties;
    },
    /** Tracked events of `name` matching `where`, right now. */
    tracked(
      name: string,
      where: (request: CapturedRequest) => boolean = () => true
    ) {
      return requests.filter(
        (request) =>
          request.type === "track" &&
          request.payload.name === name &&
          where(request)
      );
    },
    identify(profileId: string) {
      return waitFor(
        (request) =>
          request.type === "identify" &&
          request.payload.profileId === profileId,
        `OpenPanel never identified ${profileId}`
      );
    },
  };
};

export type OpenPanelCapture = Awaited<
  ReturnType<typeof startOpenPanelCapture>
>;
