import { checkQuestion, QuestionFields } from "@shared/actions";
import { parseCursor, parseTime } from "@shared/cursor";
import { Schema } from "effect";

const text = (min: number, max: number) =>
  Schema.String.check(Schema.isMinLength(min), Schema.isMaxLength(max));

/**
 * Request bodies of openapi/openapi.json, also the MCP tools' input
 * schemas. Unknown top-level keys are ignored (the rest record), while
 * objects inside `fields` and `actions` reject them: decode with
 * `STRICT_PARSE`.
 */
export const CreateEventBody = Schema.StructWithRest(
  Schema.Struct({
    channelName: text(1, 255).annotate({
      description:
        "Channel name, e.g. payments. The channel is created on first use.",
    }),
    description: Schema.optionalKey(
      Schema.String.annotate({
        description: "More detail, shown under the title",
      })
    ),
    displayAs: Schema.optionalKey(Schema.Literals(["message", "notification"])),
    icon: Schema.optionalKey(
      Schema.String.annotate({ description: "An emoji" })
    ),
    metadata: Schema.optionalKey(
      Schema.JsonObject.annotate({
        description:
          "Any JSON object, shown with the event. Top-level amount and currency make it revenue.",
      })
    ),
    notify: Schema.optionalKey(
      Schema.Boolean.annotate({
        description:
          "Push to devices subscribed to the channel (default true; always true for an event with buttons or fields)",
      })
    ),
    source: Schema.optionalKey(
      text(1, 255).annotate({
        description:
          "Where the event came from (default api; mcp for MCP calls)",
      })
    ),
    tags: Schema.optionalKey(Schema.Array(Schema.String)),
    title: text(1, 1000).annotate({
      description: "What happened, or the question",
    }),
    userId: Schema.optionalKey(
      Schema.NullOr(Schema.String).annotate({
        description: "One of your users (a user_id or alias from identifyUser)",
      })
    ),
    ...QuestionFields,
  }),
  [Schema.Record(Schema.String, Schema.Json)]
).check(checkQuestion());
export type CreateEventBody = typeof CreateEventBody.Type;

const UserIdSchema = Schema.String.check(Schema.isMinLength(1));

export const IdentifyBody = Schema.Struct({
  aliases: Schema.optionalKey(
    Schema.Array(text(1, 255)).annotate({
      description:
        "Other ids or emails this user is known by in your events' userId",
    })
  ),
  properties: Schema.optionalKey(
    Schema.JsonObject.annotate({
      description: "Merged into the identity's properties",
    })
  ),
  userId: Schema.optionalKey(
    UserIdSchema.annotate({ description: "Your id for the user" })
  ),
  user_id: Schema.optionalKey(
    UserIdSchema.annotate({ description: "The old name of userId" })
  ),
}).check(
  Schema.makeFilter((body) => {
    if (body.userId === undefined && body.user_id === undefined) {
      return { issue: "userId is required", path: ["userId"] };
    }
    return body.userId !== undefined &&
      body.user_id !== undefined &&
      body.userId !== body.user_id
      ? {
          issue: "Send userId only (user_id is its old name)",
          path: ["user_id"],
        }
      : true;
  })
);
export type IdentifyBody = typeof IdentifyBody.Type;

const TIME_MESSAGE =
  "Use an ISO 8601 time with its zone, like 2026-09-26T10:00:00Z";

/** Annotated before the check, so JSON Schema keeps the description. */
const parsed = (
  description: string,
  valid: (value: string) => boolean,
  message: string
) =>
  Schema.String.annotate({ description }).check(
    Schema.makeFilter((value: string) => (valid(value) ? true : message))
  );
const LIMIT_MESSAGE = "limit is a whole number from 1 to 100";
const Limit = Schema.Number.annotate({ message: LIMIT_MESSAGE }).check(
  Schema.isInt({ message: LIMIT_MESSAGE }),
  Schema.isBetween({ maximum: 100, minimum: 1 }, { message: LIMIT_MESSAGE })
);

/** listEvents' filters: query parameters over REST, arguments over MCP. */
export const ListEventsArgs = Schema.Struct({
  before: Schema.optionalKey(
    parsed(
      "Only events before this point: the previous page's nextCursor, or a time",
      (value) => parseCursor(value) !== undefined,
      `${TIME_MESSAGE}, or a page's nextCursor`
    )
  ),
  channel: Schema.optionalKey(
    text(1, 255).annotate({ description: "Only this channel (its name)" })
  ),
  limit: Schema.optionalKey(
    Limit.annotate({ description: "Events per page: 1 to 100, default 50" })
  ),
  since: Schema.optionalKey(
    parsed(
      "Only events at or after this time",
      (value) => parseTime(value) !== undefined,
      TIME_MESSAGE
    )
  ),
});
export type ListEventsArgs = typeof ListEventsArgs.Type;

/** Query parameters are text: `limit` is a number written as one. */
export const ListEventsQuery = Schema.Struct({
  ...ListEventsArgs.fields,
  limit: Schema.optionalKey(
    Schema.Union([Limit, Schema.NumberFromString.pipe(Schema.decodeTo(Limit))])
  ),
});

const EventIdSchema = Schema.String.check(Schema.isMinLength(1)).annotate({
  description: "The event id from createEvent (data.id), e.g. event_…",
});

/** The event an operation works on (a path parameter over REST). */
export const EventIdParams = Schema.Struct({ id: EventIdSchema });

/** The identity to erase (a path parameter over REST). */
export const UserIdParams = Schema.Struct({ user_id: UserIdSchema });
