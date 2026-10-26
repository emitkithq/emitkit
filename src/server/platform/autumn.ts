import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { AppConfig } from "@server/platform/config";
import { Context, Effect, Layer, Redacted, Schedule, Schema } from "effect";

const BASE_URL = "https://api.useautumn.com/v1";

const Subscription = Schema.Struct({
  canceled_at: Schema.NullOr(Schema.Number),
  current_period_end: Schema.NullOr(Schema.Number),
  expires_at: Schema.NullOr(Schema.Number),
  past_due: Schema.Boolean,
  plan_id: Schema.String,
  status: Schema.String,
  trial_ends_at: Schema.NullOr(Schema.Number),
});

const Purchase = Schema.Struct({
  plan_id: Schema.String,
});

const Customer = Schema.Struct({
  balances: Schema.Record(
    Schema.String,
    Schema.Struct({
      granted: Schema.NullOr(Schema.Number),
      unlimited: Schema.optional(Schema.Boolean),
    })
  ),
  flags: Schema.Record(Schema.String, Schema.Unknown),
  purchases: Schema.Array(Purchase),
  subscriptions: Schema.Array(Subscription),
});

export type AutumnCustomer = typeof Customer.Type;
export type AutumnSubscription = typeof Subscription.Type;

const AttachResult = Schema.Struct({
  payment_url: Schema.NullOr(Schema.String),
});

const PortalResult = Schema.Struct({ url: Schema.String });

const PreviewResult = Schema.Struct({
  currency: Schema.String,
  next_cycle: Schema.NullOr(
    Schema.Struct({ starts_at: Schema.Number, total: Schema.Number })
  ),
  total: Schema.Number,
});

export type AutumnPreview = typeof PreviewResult.Type;

/** Request bodies: JSON objects with snake_case fields, as Autumn's API takes them. */
type RequestBody = Readonly<Record<string, typeof Schema.Json.Type>>;

/** Prepaid seats: Autumn's quantity is the total, included seats counted. */
const quantities = (seats: number | null): RequestBody =>
  seats === null
    ? {}
    : { feature_quantities: [{ feature_id: "seats", quantity: seats }] };

/** Autumn's answer while another change to the same customer is running. */
const LOCKED = 423;

const ErrorBody = Schema.Struct({ code: Schema.optional(Schema.String) });

export interface CustomerIdentity {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
}

export interface SeatChange {
  readonly customerId: string;
  readonly planId: string;
  readonly seats: number;
}

/**
 * Autumn's billing API (https://docs.useautumn.com), the only code that talks
 * to it. Only built when billing is configured (`AUTUMN_SECRET_KEY`).
 */
export class Autumn extends Context.Service<
  Autumn,
  {
    /** The customer, or null when Autumn has never seen this id. */
    readonly customer: (
      id: string
    ) => Effect.Effect<AutumnCustomer | null, InfrastructureError>;
    readonly ensureCustomer: (
      identity: CustomerIdentity
    ) => Effect.Effect<void, InfrastructureError>;
    /** Starts a plan; returns the Stripe checkout URL when payment details are needed. */
    readonly attach: (input: {
      readonly customerId: string;
      readonly planId: string;
      readonly seats: number | null;
      readonly successUrl: string;
    }) => Effect.Effect<string | null, InfrastructureError>;
    readonly previewSeats: (
      change: SeatChange
    ) => Effect.Effect<AutumnPreview, InfrastructureError>;
    readonly setSeats: (
      change: SeatChange
    ) => Effect.Effect<void, InfrastructureError>;
    readonly cancelNow: (input: {
      readonly customerId: string;
      readonly planId: string;
    }) => Effect.Effect<void, InfrastructureError>;
    readonly portal: (input: {
      readonly customerId: string;
      readonly returnUrl: string;
    }) => Effect.Effect<string, InfrastructureError>;
  }
>()("emitkit/platform/Autumn") {
  static readonly layer = Layer.effect(
    Autumn,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const secretKey = config.billing?.secretKey ?? null;

      const post = (path: string, body: RequestBody) =>
        Effect.gen(function* () {
          if (!secretKey) {
            return yield* infrastructure(`autumn.${path}`)(
              "Billing is not configured (AUTUMN_SECRET_KEY is unset)"
            );
          }
          const response = yield* Effect.tryPromise({
            catch: infrastructure(`autumn.${path}`),
            try: (signal) =>
              fetch(`${BASE_URL}/${path}`, {
                body: JSON.stringify(body),
                headers: {
                  authorization: `Bearer ${Redacted.value(secretKey)}`,
                  "content-type": "application/json",
                },
                method: "POST",
                signal,
              }),
          });
          const text = yield* Effect.tryPromise({
            catch: infrastructure(`autumn.${path}`),
            try: () => response.text(),
          });
          const json = yield* Effect.try({
            catch: infrastructure(`autumn.${path}.json`),
            try: (): unknown => (text ? JSON.parse(text) : null),
          });
          return { json, ok: response.ok, status: response.status, text };
        });

      const expect = <S extends Schema.Top>(
        path: string,
        schema: S,
        body: RequestBody
      ) =>
        Effect.gen(function* () {
          const result = yield* post(path, body);
          if (result.status === LOCKED) {
            return yield* infrastructure(`autumn.${path}.locked`)(
              `Autumn answered 423: ${result.text.slice(0, 300)}`
            );
          }
          if (!result.ok) {
            return yield* infrastructure(`autumn.${path}`)(
              `Autumn answered ${result.status}: ${result.text.slice(0, 300)}`
            );
          }
          return yield* Schema.decodeUnknownEffect(schema)(result.json).pipe(
            Effect.mapError(infrastructure(`autumn.${path}.decode`))
          );
        }).pipe(
          // Autumn locks a customer while a subscription change is running.
          Effect.retry({
            schedule: Schedule.spaced("2 seconds"),
            times: 5,
            while: (failure) => failure.operation.endsWith(".locked"),
          })
        );

      const customer = Effect.fn("Autumn.customer")(function* (id: string) {
        const result = yield* post("customers.get", { customer_id: id });
        if (result.status === 404) {
          const body = Schema.decodeUnknownOption(ErrorBody)(result.json);
          if (
            body._tag === "Some" &&
            body.value.code === "customer_not_found"
          ) {
            return null;
          }
        }
        if (!result.ok) {
          return yield* infrastructure("autumn.customers.get")(
            `Autumn answered ${result.status}: ${result.text.slice(0, 300)}`
          );
        }
        return yield* Schema.decodeUnknownEffect(Customer)(result.json).pipe(
          Effect.mapError(infrastructure("autumn.customers.get.decode"))
        );
      });

      const ensureCustomer = Effect.fn("Autumn.ensureCustomer")(function* (
        identity: CustomerIdentity
      ) {
        yield* expect("customers.get_or_create", Schema.Unknown, {
          customer_id: identity.id,
          email: identity.email,
          name: identity.name,
        });
      });

      const attach = Effect.fn("Autumn.attach")(function* (input: {
        readonly customerId: string;
        readonly planId: string;
        readonly seats: number | null;
        readonly successUrl: string;
      }) {
        const result = yield* expect("billing.attach", AttachResult, {
          customer_id: input.customerId,
          plan_id: input.planId,
          redirect_mode: "always",
          success_url: input.successUrl,
          ...quantities(input.seats),
        });
        return result.payment_url;
      });

      const previewSeats = Effect.fn("Autumn.previewSeats")(function* (
        change: SeatChange
      ) {
        return yield* expect("billing.preview_update", PreviewResult, {
          customer_id: change.customerId,
          plan_id: change.planId,
          ...quantities(change.seats),
        });
      });

      const setSeats = Effect.fn("Autumn.setSeats")(function* (
        change: SeatChange
      ) {
        yield* expect("billing.update", Schema.Unknown, {
          customer_id: change.customerId,
          plan_id: change.planId,
          ...quantities(change.seats),
        });
      });

      const cancelNow = Effect.fn("Autumn.cancelNow")(function* (input: {
        readonly customerId: string;
        readonly planId: string;
      }) {
        yield* expect("billing.update", Schema.Unknown, {
          cancel_action: "cancel_immediately",
          customer_id: input.customerId,
          plan_id: input.planId,
        });
      });

      const portal = Effect.fn("Autumn.portal")(function* (input: {
        readonly customerId: string;
        readonly returnUrl: string;
      }) {
        const result = yield* expect(
          "billing.open_customer_portal",
          PortalResult,
          { customer_id: input.customerId, return_url: input.returnUrl }
        );
        return result.url;
      });

      return Autumn.of({
        attach,
        cancelNow,
        customer,
        ensureCustomer,
        portal,
        previewSeats,
        setSeats,
      });
    })
  );
}
