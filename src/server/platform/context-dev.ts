import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import { Context, Effect, Layer, Redacted, Schema } from "effect";

const RETRIEVE_URL = "https://api.context.dev/v1/brand/retrieve";

/**
 * Context.dev's deadline for a lookup. A domain it hasn't seen is read live
 * and can take several seconds; at the deadline it returns what it has.
 */
const DEADLINE_MS = 12_000;

const Logo = Schema.Struct({
  resolution: Schema.optional(
    Schema.Struct({
      aspect_ratio: Schema.optional(Schema.Number),
      width: Schema.optional(Schema.Number),
    })
  ),
  type: Schema.optional(Schema.String),
  url: Schema.String,
});

const Brand = Schema.Struct({
  colors: Schema.optional(Schema.Array(Schema.Struct({ hex: Schema.String }))),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  domain: Schema.String,
  industries: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        eic: Schema.optional(
          Schema.Array(
            Schema.Struct({
              industry: Schema.String,
              subindustry: Schema.String,
            })
          )
        ),
      })
    )
  ),
  is_nsfw: Schema.optional(Schema.Boolean),
  logos: Schema.optional(Schema.Array(Logo)),
  title: Schema.optional(Schema.NullOr(Schema.String)),
});

const Response = Schema.Struct({ brand: Schema.NullOr(Brand) });

export interface BrandProfile {
  readonly domain: string;
  readonly name: string | null;
  readonly description: string | null;
  /** A square icon, for avatars. */
  readonly iconUrl: string | null;
  readonly color: string | null;
  readonly labels: readonly {
    readonly industry: string;
    readonly subindustry: string;
  }[];
}

/**
 * Answers that mean "no brand to show" rather than a failure: a mailbox or
 * disposable domain (422), an unknown site (404), or nothing gathered by
 * the deadline (408).
 */
const NO_BRAND: ReadonlySet<number> = new Set([404, 408, 422]);

/** The largest square icon, else the largest logo whose shape fits a square. */
const iconOf = (logos: readonly (typeof Logo.Type)[]) => {
  const width = (logo: typeof Logo.Type) => logo.resolution?.width ?? 0;
  const square = logos
    .filter((logo) => {
      const ratio = logo.resolution?.aspect_ratio ?? 0;
      return logo.type === "icon" || (ratio >= 0.8 && ratio <= 1.25);
    })
    .toSorted((a, b) => width(b) - width(a));
  return square[0]?.url ?? null;
};

/**
 * Context.dev's brand API (https://docs.context.dev), the only code that
 * talks to it. Only the domain is sent, never an email address. Without
 * `CONTEXT_DEV_API_KEY` (the self-hosting default) every lookup is null.
 */
export class ContextDev extends Context.Service<
  ContextDev,
  {
    readonly enabled: boolean;
    /** The brand behind a domain, or null when there's none to show. */
    readonly brand: (
      domain: string
    ) => Effect.Effect<BrandProfile | null, InfrastructureError>;
  }
>()("emitkit/platform/ContextDev") {
  static readonly layer = Layer.effect(
    ContextDev,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const apiKey = config.contextDevKey;

      const brand = Effect.fn("ContextDev.brand")(
        function* (domain: string) {
          if (!apiKey) {
            return null;
          }
          const response = yield* Effect.tryPromise({
            catch: infrastructure("contextDev.brand"),
            try: (signal) =>
              fetch(RETRIEVE_URL, {
                body: JSON.stringify({
                  domain,
                  maxSpeed: true,
                  timeoutOpts: {
                    behavior: "return-partial",
                    milliseconds: DEADLINE_MS,
                  },
                  type: "by_domain",
                }),
                headers: {
                  authorization: `Bearer ${Redacted.value(apiKey)}`,
                  "content-type": "application/json",
                },
                method: "POST",
                signal,
              }),
          }).pipe(Effect.timeout(DEADLINE_MS + 5000));
          if (NO_BRAND.has(response.status)) {
            return null;
          }
          const text = yield* Effect.tryPromise({
            catch: infrastructure("contextDev.brand"),
            try: () => response.text(),
          });
          if (!response.ok) {
            return yield* infrastructure("contextDev.brand")(
              `Context.dev answered ${response.status}: ${text.slice(0, 300)}`
            );
          }
          const body = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Response)
          )(text).pipe(
            Effect.mapError(infrastructure("contextDev.brand.decode"))
          );
          const found = body.brand;
          if (!found || found.is_nsfw) {
            return null;
          }
          return {
            color: found.colors?.[0]?.hex ?? null,
            description: found.description?.trim() || null,
            domain: found.domain,
            iconUrl: iconOf(found.logos ?? []),
            labels: found.industries?.eic ?? [],
            name: found.title?.trim() || null,
          } satisfies BrandProfile;
        },
        Effect.catchTag(
          "TimeoutError",
          infrastructure("contextDev.brand.timeout")
        )
      );

      return ContextDev.of({ brand, enabled: apiKey !== null });
    })
  );
}
