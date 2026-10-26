import { Predicate, Schema } from "effect";

/** A referenced entity does not exist in the caller's organization. */
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  {
    entity: Schema.String,
    id: Schema.String,
  }
) {}

/** The caller is authenticated but may not perform the operation. */
export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  "ForbiddenError",
  {
    message: Schema.String,
  }
) {}

/** The caller has no session, or the session has no usable organization. */
export class UnauthenticatedError extends Schema.TaggedError<UnauthenticatedError>()(
  "UnauthenticatedError",
  {
    message: Schema.String,
  }
) {}

/** The request conflicts with current state (duplicate slug, reused idempotency key). */
export class ConflictError extends Schema.TaggedError<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
  }
) {}

/** Input passed schema validation but violates a business rule. */
export class InvalidInputError extends Schema.TaggedError<InvalidInputError>()(
  "InvalidInputError",
  {
    message: Schema.String,
  }
) {}

/** A Cloudflare binding, D1 or an upstream API failed. */
export class InfrastructureError extends Schema.TaggedError<InfrastructureError>()(
  "InfrastructureError",
  {
    cause: Schema.Defect(),
    operation: Schema.String,
  }
) {}

export const infrastructure = (operation: string) => (cause: unknown) =>
  new InfrastructureError({ cause, operation });

/** A failure and what it wraps (a SqlError's D1 message, say), one level deep. */
const causeText = (cause: unknown) => {
  const inner = Predicate.hasProperty(cause, "cause") ? cause.cause : undefined;
  return inner === undefined
    ? String(cause)
    : `${String(cause)} ← ${String(inner)}`;
};

/** Log-safe summary of an infrastructure failure (never includes request data). */
export const describeFailure = (failure: InfrastructureError) => ({
  cause: causeText(failure.cause).slice(0, 500),
  operation: failure.operation,
});
