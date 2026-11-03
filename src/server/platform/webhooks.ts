import type { InfrastructureError } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import { signWebhook } from "@server/platform/webhook-signature";
import {
  Context,
  Effect,
  Encoding,
  Layer,
  Redacted,
  Result,
  Schema,
} from "effect";

/** Standard Webhooks secrets: `whsec_` + base64 of 24–64 random bytes. */
const SECRET_PREFIX = "whsec_";
const MIN_SECRET_BYTES = 24;
const MAX_SECRET_BYTES = 64;
const TIMEOUT_MS = 10_000;
/** Enough of a receiver's reply to read a verification echo. */
const MAX_REPLY_CHARS = 4096;

export interface SignedPost {
  readonly url: string;
  /** `webhook-id`: the event id, or `msg_verification_…` for the handshake. */
  readonly id: string;
  readonly body: string;
  /** Every secret to sign with; more than one during a rotation window. */
  readonly secrets: readonly string[];
  readonly subscriptionId: string;
}

export interface WebhookReply {
  readonly status: number;
  readonly text: string;
}

/** The callback could not be reached (MCP Events `CallbackEndpointError` reasons). */
export class WebhookTransportError extends Schema.TaggedError<WebhookTransportError>()(
  "WebhookTransportError",
  {
    reason: Schema.Literals(["connection_refused", "timeout", "tls_error"]),
  }
) {}

const secretBytes = (secret: string) => {
  if (!secret.startsWith(SECRET_PREFIX)) {
    return null;
  }
  const decoded = Encoding.decodeBase64(secret.slice(SECRET_PREFIX.length));
  if (Result.isFailure(decoded)) {
    return null;
  }
  const bytes = decoded.success;
  return bytes.length >= MIN_SECRET_BYTES && bytes.length <= MAX_SECRET_BYTES
    ? bytes
    : null;
};

/** Whether `secret` is a usable Standard Webhooks signing secret. */
export const isSigningSecret = (secret: string) => secretBytes(secret) !== null;

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
];

/** IPv4 ranges (first two octets, prefix length ≤ 16) that aren't globally routable. */
const BLOCKED_V4: readonly (readonly [number, number, number])[] = [
  [0, 0, 8],
  [10, 0, 8],
  [100, 64, 10],
  [127, 0, 8],
  [169, 254, 16],
  [172, 16, 12],
  [192, 168, 16],
  [198, 18, 15],
  [224, 0, 3],
];
/** /24 blocks: IETF protocol assignments and documentation ranges. */
const BLOCKED_V4_24 = ["192.0.0.", "192.0.2.", "198.51.100.", "203.0.113."];

const isBlockedV4 = (host: string) => {
  const octets = host.split(".").map(Number);
  const [a = 0, b = 0] = octets;
  const address = a * 256 + b;
  return (
    BLOCKED_V4_24.some((prefix) => host.startsWith(prefix)) ||
    BLOCKED_V4.some(([first, second, bits]) => {
      const size = 2 ** (16 - bits);
      const start = first * 256 + second;
      return address >= start && address < start + size;
    })
  );
};

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

/** The first two 16-bit groups of an IPv6 literal (`[…]`, as `URL` normalizes it). */
const leadingV6Groups = (host: string): readonly [number, number] => {
  const [head = ""] = host.slice(1, -1).split("::");
  const groups = head === "" ? [] : head.split(":");
  return [
    Number.parseInt(groups[0] ?? "0", 16),
    Number.parseInt(groups[1] ?? "0", 16),
  ];
};

/**
 * Only global unicast (2000::/3), without the ranges that reach IPv4 or
 * aren't routable: 6to4 (2002::/16), Teredo (2001::/32) and documentation
 * (2001:db8::/32, 3fff::/20). NAT64, ULA, link-local and mapped IPv4 are
 * outside 2000::/3 already.
 */
const isBlockedV6 = (host: string) => {
  const [first, second] = leadingV6Groups(host);
  return (
    first < 0x20_00 ||
    first > 0x3f_ff ||
    first === 0x20_02 ||
    (first === 0x20_01 && (second === 0 || second === 0x0d_b8)) ||
    (first === 0x3f_ff && second < 0x10_00)
  );
};

/**
 * Why a callback URL is refused, or null when it is acceptable: `https`, no
 * credentials, and a public host name or address. `vite dev` (a localhost
 * app URL) also accepts `http(s)://localhost`, so a local receiver can be used.
 */
const callbackProblem = (url: string, allowLoopback: boolean) => {
  if (!URL.canParse(url)) {
    return "delivery.url must be an absolute URL";
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password) {
    return "delivery.url must not contain credentials";
  }
  // `localhost.` and `x.local.` are the same hosts as without the dot.
  const host = parsed.hostname.toLowerCase().replace(/\.+$/u, "");
  // Only the exact name: `localhost.` is refused even under `vite dev`.
  if (allowLoopback && parsed.hostname.toLowerCase() === "localhost") {
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? null
      : "delivery.url must use https";
  }
  if (parsed.protocol !== "https:") {
    return "delivery.url must use https";
  }
  if (host.startsWith("[")) {
    return isBlockedV6(host)
      ? "delivery.url must not point at a private or local address"
      : null;
  }
  if (IPV4.test(host)) {
    return isBlockedV4(host)
      ? "delivery.url must not point at a private or local address"
      : null;
  }
  if (
    !host.includes(".") ||
    host === "localhost" ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return "delivery.url must be a public host name";
  }
  return null;
};

type TransportReason = WebhookTransportError["reason"];

/** Classifies a fetch failure from its message. */
const transportReason = (text: string): TransportReason => {
  if (/timeout|timed out|aborted/iu.test(text)) {
    return "timeout";
  }
  if (/tls|ssl|certificate/iu.test(text)) {
    return "tls_error";
  }
  return "connection_refused";
};

/**
 * Outbound Standard Webhooks (https://www.standardwebhooks.com) for MCP
 * Events: HMAC-SHA256 `v1` signatures over `id.timestamp.body`, a 10 s
 * timeout and no redirects. Workers can't reach private networks, and the
 * URL check refuses private literals and local names up front.
 */
export class Webhooks extends Context.Service<
  Webhooks,
  {
    /** Why a callback URL is refused, or null when it's acceptable. */
    readonly callbackProblem: (url: string) => string | null;
    readonly post: (
      input: SignedPost
    ) => Effect.Effect<
      WebhookReply,
      WebhookTransportError | InfrastructureError
    >;
    /** A single-use random value (verification challenges, message ids). */
    readonly nonce: Effect.Effect<string>;
  }
>()("emitkit/platform/Webhooks") {
  static readonly layer = Layer.effect(
    Webhooks,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      // `import.meta.env.DEV` is `false` in every build (same rule as dev sign-in).
      const allowLoopback =
        import.meta.env.DEV &&
        new URL(config.appUrl).hostname.endsWith("localhost");

      const post = Effect.fn("Webhooks.post")(function* (input: SignedPost) {
        const timestamp = String(
          Math.floor(
            (yield* Effect.clockWith((clock) => clock.currentTimeMillis)) / 1000
          )
        );
        const signatures = yield* Effect.forEach(
          input.secrets.filter(isSigningSecret),
          (secret) =>
            signWebhook(
              Redacted.make(secret),
              input.id,
              timestamp,
              input.body
            ).pipe(Effect.map((signature) => `v1,${signature}`))
        );
        return yield* Effect.tryPromise({
          catch: (error) =>
            new WebhookTransportError({
              reason: transportReason(String(error)),
            }),
          try: async () => {
            const response = await fetch(input.url, {
              body: input.body,
              headers: {
                "content-type": "application/json",
                "user-agent": "EmitKit-MCP-Events/1",
                "webhook-id": input.id,
                "webhook-signature": signatures.join(" "),
                "webhook-timestamp": timestamp,
                "x-mcp-subscription-id": input.subscriptionId,
              },
              method: "POST",
              // Every 3xx counts as a failure: redirects are never followed.
              redirect: "manual",
              signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            const text = await response.text();
            return {
              status: response.status,
              text: text.slice(0, MAX_REPLY_CHARS),
            };
          },
        });
      });

      const nonce = Effect.sync(() =>
        Encoding.encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)))
      );

      return Webhooks.of({
        callbackProblem: (url) => callbackProblem(url, allowLoopback),
        nonce,
        post,
      });
    })
  );
}
