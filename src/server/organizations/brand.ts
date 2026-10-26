import {
  describeFailure,
  infrastructure,
  InvalidInputError,
} from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import type { SessionInfo } from "@server/platform/auth";
import { ContextDev } from "@server/platform/context-dev";
import type { BrandProfile } from "@server/platform/context-dev";
import { domainOfEmail, domainOfUrl } from "@shared/domains";
import { isSegment, segmentFor } from "@shared/recipes";
import type { OrganizationBrand } from "@shared/rpc/schemas";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

interface BrandRow {
  readonly status: string;
  readonly domain: string | null;
  readonly name: string | null;
  readonly subindustry: string | null;
  readonly segment: string | null;
  readonly icon_url: string | null;
  readonly lookups: number;
}

/** Paid lookups per organization: the automatic one plus a few corrections. */
const MAX_LOOKUPS = 5;

/** A hostname with a dot and a letter in its last label: no IPs, no `localhost`. */
const DOMAIN = /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]*[a-z\d]$/u;

/** Names reserved for documentation and testing (RFC 2606): never a brand. */
const RESERVED =
  /(?:^|\.)(?:example\.(?:com|net|org)|example|test|invalid|localhost|local)$/u;

/** A domain worth a lookup: well formed and not reserved. */
const lookupable = (domain: string | null): domain is string =>
  domain !== null && DOMAIN.test(domain) && !RESERVED.test(domain);

/** The name `ensureWorkspace` gives a new owner's workspace ("Ada's workspace"). */
const isDefaultName = (name: string) => name.endsWith("'s workspace");

const statusOf = (
  row: BrandRow | null,
  enabled: boolean
): OrganizationBrand["status"] => {
  if (row?.status === "found") {
    return "found";
  }
  return row || enabled ? "none" : "off";
};

const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

/**
 * The brand behind an organization: its logo becomes the organization's
 * avatar, and its industry picks the recipes the paywall shows. The first
 * read by an owner or admin looks up the domain of their email address
 * (mailbox providers such as gmail.com are skipped, and only the domain is
 * sent); they can correct it with their website. Members only read it.
 */
export class OrganizationBrands extends Context.Service<
  OrganizationBrands,
  {
    readonly get: (input: {
      readonly organizationId: string;
      readonly organizationName: string;
      readonly session: SessionInfo;
      readonly canManage: boolean;
    }) => Effect.Effect<OrganizationBrand, InfrastructureError>;
    readonly lookup: (input: {
      readonly organizationId: string;
      readonly website: string;
    }) => Effect.Effect<
      OrganizationBrand,
      InvalidInputError | InfrastructureError
    >;
  }
>()("emitkit/organizations/OrganizationBrands") {
  static readonly layer = Layer.effect(
    OrganizationBrands,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const contextDev = yield* ContextDev;

      const toBrand = (
        row: BrandRow | null,
        canManage: boolean
      ): OrganizationBrand => ({
        canLookup:
          canManage && contextDev.enabled && (row?.lookups ?? 0) < MAX_LOOKUPS,
        domain: row?.domain ?? null,
        iconUrl: row?.icon_url ?? null,
        industry: row?.subindustry ?? null,
        name: row?.name ?? null,
        segment: isSegment(row?.segment) ? row.segment : null,
        status: statusOf(row, contextDev.enabled),
      });

      const row = Effect.fn("OrganizationBrands.row")(function* (
        organizationId: string
      ) {
        const rows = yield* sql<BrandRow>`
          select status, domain, name, subindustry, segment, icon_url, lookups
          from organization_brand where organization_id = ${organizationId}
        `.pipe(Effect.mapError(infrastructure("brand.read")));
        return rows[0] ?? null;
      });

      /** Nothing to read for this organization; remembered so it isn't asked again. */
      const recordNone = Effect.fn("OrganizationBrands.recordNone")(function* (
        organizationId: string,
        domain: string | null,
        lookups: number
      ) {
        const now = yield* nowIso;
        yield* sql`
          insert into organization_brand (organization_id, status, domain, lookups, updated_at)
          values (${organizationId}, 'none', ${domain}, ${lookups}, ${now})
          on conflict (organization_id) do update set
            lookups = excluded.lookups, updated_at = excluded.updated_at
        `.pipe(Effect.mapError(infrastructure("brand.none")));
      });

      /**
       * Stores a found brand and shows it on the organization: its icon
       * becomes the avatar unless someone set one, and its name replaces
       * the "Ada's workspace" default (or the previous brand's name). The
       * slug never changes.
       */
      const recordFound = Effect.fn("OrganizationBrands.recordFound")(
        function* (
          organizationId: string,
          brand: BrandProfile,
          previous: BrandRow | null,
          lookups: number
        ) {
          const now = yield* nowIso;
          const [label] = brand.labels;
          yield* sql`
            insert into organization_brand (
              organization_id, status, domain, name, description, industry,
              subindustry, segment, icon_url, color, lookups, updated_at
            ) values (
              ${organizationId}, 'found', ${brand.domain}, ${brand.name},
              ${brand.description}, ${label?.industry ?? null},
              ${label?.subindustry ?? null}, ${segmentFor(brand.labels)},
              ${brand.iconUrl}, ${brand.color}, ${lookups}, ${now}
            )
            on conflict (organization_id) do update set
              status = excluded.status, domain = excluded.domain,
              name = excluded.name, description = excluded.description,
              industry = excluded.industry, subindustry = excluded.subindustry,
              segment = excluded.segment, icon_url = excluded.icon_url,
              color = excluded.color, lookups = excluded.lookups,
              updated_at = excluded.updated_at
          `.pipe(Effect.mapError(infrastructure("brand.found")));
          const previousIcon = previous?.icon_url ?? null;
          const previousName = previous?.name ?? null;
          yield* sql`
            update organization set
              logo = case
                when logo is null or logo = '' or logo = ${previousIcon}
                then ${brand.iconUrl} else logo end,
              name = case
                when ${brand.name} is not null
                  and (name like '%''s workspace' or name = ${previousName})
                then ${brand.name} else name end
            where id = ${organizationId}
          `.pipe(Effect.mapError(infrastructure("brand.apply")));
        }
      );

      /** One paid lookup: found, none (cached) or an error (nothing cached). */
      const read = Effect.fn("OrganizationBrands.read")(function* (
        organizationId: string,
        domain: string,
        previous: BrandRow | null
      ) {
        const lookups = (previous?.lookups ?? 0) + 1;
        const brand = yield* contextDev.brand(domain);
        if (brand) {
          yield* recordFound(organizationId, brand, previous, lookups);
        } else if (previous?.status === "found") {
          // Keep the brand already shown; only count the lookup.
          yield* sql`
            update organization_brand set lookups = ${lookups}
            where organization_id = ${organizationId}
          `.pipe(Effect.mapError(infrastructure("brand.count")));
        } else {
          yield* recordNone(organizationId, domain, lookups);
        }
        return brand;
      });

      const get = Effect.fn("OrganizationBrands.get")(function* (input: {
        readonly organizationId: string;
        readonly organizationName: string;
        readonly session: SessionInfo;
        readonly canManage: boolean;
      }) {
        const existing = yield* row(input.organizationId);
        if (existing || !input.canManage || !contextDev.enabled) {
          return toBrand(existing, input.canManage);
        }
        // The email domain describes the workspace EmitKit made for its
        // owner, not every organization they create later ("Side project").
        // Those get the website field instead; nothing is recorded.
        if (!isDefaultName(input.organizationName)) {
          return toBrand(null, input.canManage);
        }
        const email = domainOfEmail(input.session.email);
        const domain = lookupable(email) ? email : null;
        // Best effort: a failed lookup leaves nothing cached, so the next
        // read tries again, and the paywall shows the general recipes.
        yield* domain
          ? read(input.organizationId, domain, null).pipe(
              Effect.asVoid,
              Effect.catchTag("InfrastructureError", (failure) =>
                Effect.logWarning(
                  "brand lookup failed",
                  describeFailure(failure)
                )
              )
            )
          : recordNone(input.organizationId, null, 0);
        return toBrand(yield* row(input.organizationId), input.canManage);
      });

      const lookup = Effect.fn("OrganizationBrands.lookup")(function* (input: {
        readonly organizationId: string;
        readonly website: string;
      }) {
        const domain = domainOfUrl(input.website.trim().toLowerCase());
        if (!lookupable(domain)) {
          return yield* new InvalidInputError({
            message: "Enter your website, like acme.com.",
          });
        }
        const existing = yield* row(input.organizationId);
        if (!contextDev.enabled || (existing?.lookups ?? 0) >= MAX_LOOKUPS) {
          return yield* new InvalidInputError({
            message: "Pick what you build below instead.",
          });
        }
        const brand = yield* read(input.organizationId, domain, existing);
        if (!brand) {
          return yield* new InvalidInputError({
            message: `Nothing came up for ${domain}. Pick what you build below instead.`,
          });
        }
        return toBrand(yield* row(input.organizationId), true);
      });

      return OrganizationBrands.of({ get, lookup });
    })
  );
}
