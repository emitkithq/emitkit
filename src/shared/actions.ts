import { Schema, SchemaIssue } from "effect";

/**
 * Fields and actions on an event (docs/content/concepts/questions.mdx).
 * Shared by the public API, MCP and the answer page, so the rules and
 * their messages are written once. Messages speak to whoever
 * sends the event, usually an agent: they name the fix.
 *
 * Objects inside `fields` and `actions` are strict (decode them with
 * `STRICT_PARSE`): a setting that doesn't exist is an error, not silently
 * dropped. The event itself stays lenient, as v1 always was.
 */

export const MAX_FIELDS = 5;
export const MAX_ACTIONS = 4;
export const MAX_OPTIONS = 10;
export const MAX_TEXT = 2000;
export const DEFAULT_EXPIRES_IN = 86_400;
/** `resume` is echoed back as is; 65,536 characters of the sender's own state. */
export const MAX_RESUME = 65_536;
/** The answer an implied Send button reports; no button may use it. */
export const SUBMIT = "submit";

/** Parse options for anything that contains fields or actions. */
export const STRICT_PARSE = {
  errors: "all",
  onExcessProperty: "error",
} as const;

const text = (min: number, max: number) =>
  Schema.String.check(Schema.isMinLength(min), Schema.isMaxLength(max));

/** Keys that would reach object prototypes when used as property names. */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const Key = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/u, {
    message: "Use 1-64 letters, digits, - or _",
  }),
  Schema.makeFilter((key: string) =>
    RESERVED_KEYS.has(key) ? `"${key}" is reserved; pick another id` : true
  )
);
const Label = text(1, 100);

export const ChoiceOption = Schema.Struct({
  id: Key.annotate({ description: "What the answer reports, e.g. partial" }),
  label: Label.annotate({ description: "What the person sees" }),
}).annotate({ message: "An option is { id, label }" });
export type ChoiceOption = typeof ChoiceOption.Type;

export const ChoiceField = Schema.Struct({
  default: Schema.optionalKey(
    Schema.Union([Key, Schema.Array(Key)]).annotate({
      description:
        "An option id (an array of ids when multiple). A single choice without one starts on its first option.",
    })
  ),
  id: Key,
  label: Label,
  multiple: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Let the person pick several options (checkboxes).",
    })
  ),
  options: Schema.Array(ChoiceOption).check(
    Schema.isMinLength(2, { message: "A choice needs 2 to 10 options" }),
    Schema.isMaxLength(MAX_OPTIONS, {
      message: "A choice needs 2 to 10 options",
    })
  ),
  type: Schema.Literal("choice"),
});

export const TextField = Schema.Struct({
  default: Schema.optionalKey(text(0, MAX_TEXT)),
  id: Key,
  label: Label,
  maxLength: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ maximum: MAX_TEXT, minimum: 1 }))
  ),
  multiline: Schema.optionalKey(Schema.Boolean),
  placeholder: Schema.optionalKey(text(1, 100)),
  type: Schema.Literal("text"),
});

export const NumberField = Schema.Struct({
  default: Schema.optionalKey(Schema.Finite),
  id: Key,
  label: Label,
  max: Schema.optionalKey(Schema.Finite),
  min: Schema.optionalKey(Schema.Finite),
  step: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  type: Schema.Literal("number"),
  unit: Schema.optionalKey(
    text(1, 8).annotate({ description: "Shown next to the value, e.g. $ or %" })
  ),
});

export const BooleanField = Schema.Struct({
  default: Schema.optionalKey(Schema.Boolean),
  id: Key,
  label: Label,
  type: Schema.Literal("boolean"),
});

/** One input on the answer page. Describes data; each app picks the control. */
export const Field = Schema.Union([
  ChoiceField,
  TextField,
  NumberField,
  BooleanField,
]).annotate({
  message:
    'A field is { id, label, type } where type is "choice" (with options), "text", "number" or "boolean"',
});
export type Field = typeof Field.Type;

/** This machine: localhost and its subdomains (RFC 6761), and loopback. */
const isLocalHost = (hostname: string) => {
  // `localhost.` (a trailing dot) is the same host.
  const host = hostname.replace(/\.$/u, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]"
  );
};

/** https anywhere; plain http only on this machine (for local development). */
const isAllowedUrl = (value: string) => {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && isLocalHost(url.hostname))
  );
};

/** A URL (annotated before its checks, so JSON Schema keeps the description). */
const url = (description: string) =>
  Schema.String.annotate({ description }).check(
    Schema.isMaxLength(2000),
    Schema.makeFilter((value: string) =>
      isAllowedUrl(value)
        ? true
        : "Use an https:// URL (http:// only for localhost)"
    )
  );

/**
 * A button (`id`: an answer the sender waits for) or a link (`url`: opens a
 * page, never an answer). One shape with one rule, so a mistake gets one
 * clear message instead of a failure per union member.
 */
export const Action = Schema.Struct({
  id: Schema.optionalKey(
    Key.annotate({
      description: "A button: what the answer reports, e.g. approve",
    })
  ),
  label: text(1, 40),
  requires: Schema.optionalKey(
    Schema.Array(Key).annotate({
      description:
        "Ids of text or multiple-choice fields that must be filled in before this button can be pressed.",
    })
  ),
  style: Schema.optionalKey(Schema.Literals(["primary", "destructive"])),
  url: Schema.optionalKey(url("A link: the page it opens")),
})
  .annotate({
    message:
      "An action is { id, label } (a button: the answer) or { label, url } (a link)",
  })
  .check(
    Schema.makeFilter((action) => {
      if (action.id === undefined && action.url === undefined) {
        return "Give the action an id (a button, pressed as the answer) or a url (a link that opens a page)";
      }
      if (action.id !== undefined && action.url !== undefined) {
        return "An action is a button (id) or a link (url), not both";
      }
      if (
        action.url !== undefined &&
        (action.style !== undefined || action.requires !== undefined)
      ) {
        return "style and requires only apply to buttons (actions with an id)";
      }
      return true;
    })
  );
export type Action = typeof Action.Type;
export type Button = Action & { readonly id: string };
export type Link = Action & { readonly url: string };

export const isLink = (action: Action): action is Link =>
  action.url !== undefined;

const EXPIRES_IN_MESSAGE =
  "Seconds as a whole number from 10 to 604800 (7 days), e.g. 1800 for 30 minutes";

/** The optional part of a new event that turns it into a question. */
export const QuestionFields = {
  actions: Schema.optionalKey(
    Schema.Array(Action)
      .check(Schema.isMaxLength(MAX_ACTIONS))
      .annotate({
        description: `Up to ${MAX_ACTIONS}. A button { id, label, style?, requires? } is an answer: the event then waits for someone to press one. A link { label, url } only opens a page.`,
      })
  ),
  expiresIn: Schema.optionalKey(
    Schema.Number.annotate({ message: EXPIRES_IN_MESSAGE })
      .check(
        Schema.isInt({ message: EXPIRES_IN_MESSAGE }),
        Schema.isBetween(
          { maximum: 604_800, minimum: 10 },
          { message: EXPIRES_IN_MESSAGE }
        )
      )
      .annotate({
        description: `Seconds an event with buttons or fields waits for an answer: 10 to 604800, default ${DEFAULT_EXPIRES_IN} (24 hours). After that, answer.status is expired.`,
      })
  ),
  callbackUrl: Schema.optionalKey(
    url(
      "Where EmitKit POSTs the answer (event.answered) or the expiry (event.expired), signed with the project's callback secret (Standard Webhooks). https only."
    )
  ),
  resume: Schema.optionalKey(
    Schema.String.check(
      Schema.isMaxLength(MAX_RESUME, {
        message:
          "resume is at most 65,536 characters; keep bigger state yourself and send its key",
      })
    ).annotate({
      description:
        "Your own state, sent back as is in the callback and GET /v1/events/{id}, so a serverless handler can carry on without a database. Never shown to people.",
    })
  ),
  fields: Schema.optionalKey(
    Schema.Array(Field)
      .check(Schema.isMaxLength(MAX_FIELDS))
      .annotate({
        description: `Up to ${MAX_FIELDS} inputs the person fills in: a choice (one or several options), text, a number or a yes/no. The answer reports them in answer.values by field id. Fields without buttons get a Send button.`,
      })
  ),
};

/** Common wrong settings, and what was probably meant. */
const EXCESS_HINTS: Readonly<Record<string, string>> = {
  // Listing events: its query parameters.
  channelId: "filter by channel (its name)",
  cursor: "pass the previous page's nextCursor as before",
  multi: "did you mean multiple?",
  offset: "page with before (the previous page's nextCursor)",
  page: "page with before (the previous page's nextCursor)",
  name: "did you mean label?",
  required:
    "to make a field required, list its id in a button's requires (text and multiple-choice fields)",
  text: "did you mean label?",
  title: "did you mean label?",
  value: "did you mean default?",
  values: "did you mean options?",
};

/** The message for a setting that doesn't exist on a field, option or action, or a query parameter. */
export const excessKeyMessage = (key: string) => {
  const hint = EXCESS_HINTS[key];
  return hint
    ? `"${key}" is not a setting here; ${hint}`
    : `"${key}" is not a setting here`;
};

interface QuestionInput {
  readonly actions?: readonly Action[] | undefined;
  readonly callbackUrl?: string | undefined;
  readonly expiresIn?: number | undefined;
  readonly resume?: string | undefined;
  readonly fields?: readonly Field[] | undefined;
  readonly notify?: boolean | undefined;
}

export const buttonsOf = (actions: readonly Action[] | undefined) =>
  (actions ?? []).filter((action): action is Button => !isLink(action));

/** An event waits for an answer when it has a button or a field. */
export const waitsForAnswer = (input: QuestionInput) =>
  buttonsOf(input.actions).length > 0 || (input.fields ?? []).length > 0;

/** The buttons the answer page shows: fields alone get a Send button. */
export const answerButtons = (input: {
  readonly actions?: readonly Action[] | undefined;
  readonly fields?: readonly Field[] | undefined;
}): readonly Button[] => {
  const buttons = buttonsOf(input.actions);
  return buttons.length === 0 && (input.fields ?? []).length > 0
    ? [{ id: SUBMIT, label: "Send", style: "primary" } satisfies Button]
    : buttons;
};

/** Fields that can be left empty, so `requires` means something for them. */
const canBeEmpty = (field: Field) =>
  field.type === "text" || (field.type === "choice" && field.multiple === true);

const duplicates = (ids: readonly string[]) =>
  ids.filter((id, index) => ids.indexOf(id) !== index);

type Path = readonly PropertyKey[];

const choiceIssues = (
  field: Extract<Field, { type: "choice" }>,
  at: Path
): Schema.FilterIssue[] => {
  const ids = field.options.map((option) => option.id);
  const issues: Schema.FilterIssue[] = [...new Set(duplicates(ids))].map(
    (id) => ({
      issue: `Option id "${id}" is used twice in this field; option ids must be unique`,
      path: [...at, "options"],
    })
  );
  if (field.default === undefined) {
    return issues;
  }
  const single = typeof field.default === "string";
  if (single === (field.multiple === true)) {
    issues.push({
      issue: single
        ? "A multiple choice's default is an array of option ids"
        : "A single choice's default is one option id, not an array (or set multiple: true)",
      path: [...at, "default"],
    });
  }
  const defaults =
    typeof field.default === "string" ? [field.default] : field.default;
  for (const id of defaults.filter((candidate) => !ids.includes(candidate))) {
    issues.push({
      issue: `"${id}" is not one of this field's options (${ids.join(", ")})`,
      path: [...at, "default"],
    });
  }
  return issues;
};

const numberIssues = (
  field: Extract<Field, { type: "number" }>,
  at: Path
): Schema.FilterIssue[] => {
  const min = field.min ?? Number.NEGATIVE_INFINITY;
  const max = field.max ?? Number.POSITIVE_INFINITY;
  const issues: Schema.FilterIssue[] = [];
  if (min > max) {
    issues.push({ issue: "min is greater than max", path: [...at, "min"] });
  }
  if (
    field.default !== undefined &&
    (field.default < min || field.default > max)
  ) {
    issues.push({
      issue: "default is outside min…max",
      path: [...at, "default"],
    });
  }
  return issues;
};

const fieldIssues = (field: Field, index: number): Schema.FilterIssue[] => {
  const at = ["fields", index];
  switch (field.type) {
    case "choice": {
      return choiceIssues(field, at);
    }
    case "number": {
      return numberIssues(field, at);
    }
    case "text": {
      return field.default !== undefined &&
        field.default.length > (field.maxLength ?? MAX_TEXT)
        ? [
            {
              issue: "default is longer than maxLength",
              path: [...at, "default"],
            },
          ]
        : [];
    }
    default: {
      return [];
    }
  }
};

const requiresIssue = (fields: readonly Field[], id: string) => {
  const field = fields.find((candidate) => candidate.id === id);
  if (!field) {
    const ids = [...new Set(fields.map((candidate) => candidate.id))];
    return ids.length === 0
      ? `"${id}" is not a field: this event has no fields`
      : `"${id}" is not a field; field ids are ${ids.join(", ")}`;
  }
  return canBeEmpty(field)
    ? undefined
    : `"${id}" always has a value (a ${field.type === "choice" ? "single choice" : field.type} field), so it can't be required; requires works on text and multiple-choice fields`;
};

const actionIssues = (input: QuestionInput): Schema.FilterIssue[] => {
  const fields = input.fields ?? [];
  const actions = input.actions ?? [];
  const buttonIds = buttonsOf(actions).map((button) => button.id);
  const issues: Schema.FilterIssue[] = [...new Set(duplicates(buttonIds))].map(
    (id) => ({
      issue: `Button id "${id}" is used twice; button ids must be unique`,
      path: ["actions"],
    })
  );
  for (const [index, action] of actions.entries()) {
    if (action.id === SUBMIT) {
      issues.push({
        issue: `"${SUBMIT}" is the answer of the Send button that fields without buttons get; pick another id`,
        path: ["actions", index, "id"],
      });
    }
    for (const [position, id] of (action.requires ?? []).entries()) {
      const issue = requiresIssue(fields, id);
      if (issue) {
        issues.push({ issue, path: ["actions", index, "requires", position] });
      }
    }
  }
  return issues;
};

/** Rules between fields, actions, expiresIn and notify that shapes alone can't say. */
export const questionIssues = (input: QuestionInput): Schema.FilterIssue[] => {
  const fields = input.fields ?? [];
  const issues: Schema.FilterIssue[] = [];
  for (const id of new Set(duplicates(fields.map((field) => field.id)))) {
    issues.push({
      issue: `Field id "${id}" is used twice; field ids must be unique`,
      path: ["fields"],
    });
  }
  for (const [index, field] of fields.entries()) {
    issues.push(...fieldIssues(field, index));
  }
  issues.push(...actionIssues(input));
  const waits = waitsForAnswer(input);
  for (const key of ["expiresIn", "callbackUrl", "resume"] as const) {
    if (!waits && input[key] !== undefined) {
      issues.push({
        issue: `${key} only applies to an event that waits for an answer: add a button (an action with an id) or a field`,
        path: [key],
      });
    }
  }
  if (waits && input.notify === false) {
    issues.push({
      issue:
        "An event with buttons or fields always notifies, so someone can answer it: remove notify: false",
      path: ["notify"],
    });
  }
  return issues;
};

export const checkQuestion = <T extends QuestionInput>() =>
  Schema.makeFilter<T>((input) => {
    const issues = questionIssues(input);
    return issues.length === 0 ? undefined : issues;
  });

// ---------------------------------------------------------------------------
// Answers

/** Any field's value, bounded; `answerSchema` checks it against its field. */
export const AnswerValue = Schema.Union([
  Schema.String.check(Schema.isMaxLength(MAX_TEXT)),
  Schema.Finite,
  Schema.Boolean,
  Schema.Array(Key).check(Schema.isMaxLength(MAX_OPTIONS)),
]);
export type AnswerValue = typeof AnswerValue.Type;
export type AnswerValues = Readonly<Record<string, AnswerValue>>;

/** At most one value per field. */
export const AnswerValuesInput = Schema.Record(
  Schema.String,
  AnswerValue
).check(Schema.isMaxProperties(MAX_FIELDS));

/** A number field's starting value, always within min…max. */
const numberStart = (field: Extract<Field, { type: "number" }>) =>
  field.default ??
  field.min ??
  (field.max !== undefined && field.max < 0 ? field.max : 0);

/** Where every field starts: its default, a single choice's first option, off, or empty. */
export const initialValues = (fields: readonly Field[]): AnswerValues =>
  Object.fromEntries(
    fields.map((field): [string, AnswerValue] => {
      switch (field.type) {
        case "choice": {
          return [
            field.id,
            field.default ??
              (field.multiple ? [] : (field.options[0]?.id ?? "")),
          ];
        }
        case "number": {
          return [field.id, numberStart(field)];
        }
        case "boolean": {
          return [field.id, field.default ?? false];
        }
        default: {
          return [field.id, field.default ?? ""];
        }
      }
    })
  );

const isEmpty = (value: AnswerValue | undefined) =>
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/** The fields `button` requires that are still empty. */
export const missingFields = (
  fields: readonly Field[],
  button: Button,
  values: AnswerValues
) =>
  fields.filter(
    (field) =>
      button.requires?.includes(field.id) === true && isEmpty(values[field.id])
  );

const onStep = (field: Extract<Field, { type: "number" }>, value: number) => {
  if (field.step === undefined) {
    return true;
  }
  const steps = (value - (field.min ?? field.default ?? 0)) / field.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
};

const numberValue = (field: Extract<Field, { type: "number" }>) =>
  Schema.Finite.annotate({ message: "Enter a number" }).check(
    Schema.makeFilter((value: number) => {
      if (
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      ) {
        return `Enter a number from ${field.min ?? "-∞"} to ${field.max ?? "∞"}`;
      }
      return onStep(field, value) ? true : `Use steps of ${field.step}`;
    })
  );

const choiceValue = (field: Extract<Field, { type: "choice" }>) => {
  const ids = field.options.map((option) => option.id);
  const option = Schema.Literals(ids).annotate({
    message: `Pick one of ${ids.join(", ")}`,
  });
  return field.multiple === true
    ? Schema.Array(option).check(
        Schema.isUnique({ message: "Pick each option once" })
      )
    : option;
};

const valueSchema = (field: Field) => {
  switch (field.type) {
    case "choice": {
      return choiceValue(field);
    }
    case "number": {
      return numberValue(field);
    }
    case "boolean": {
      return Schema.Boolean.annotate({ message: "Answer yes or no" });
    }
    default: {
      return Schema.String.check(
        Schema.isMaxLength(field.maxLength ?? MAX_TEXT, {
          message: `Keep it under ${field.maxLength ?? MAX_TEXT} characters`,
        })
      ).annotate({ message: "Enter text" });
    }
  }
};

/** The values an event's fields accept, by field id; other keys are errors (`STRICT_PARSE`). */
export const answerSchema = (fields: readonly Field[]) =>
  Schema.Struct(
    Object.fromEntries(
      fields.map((field) => [field.id, Schema.optionalKey(valueSchema(field))])
    )
  );

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** A decode failure as messages by field id ("values" for the object itself). */
const problemsOf = (issue: SchemaIssue.Issue) => {
  const problems: Record<string, string> = {};
  for (const { message, path } of formatIssues(issue).issues) {
    const [first] = path ?? [];
    const key =
      typeof first === "object" && first !== null && "key" in first
        ? String(first.key)
        : String(first ?? "values");
    problems[key] ??= message.includes("excess")
      ? "Not a field of this event"
      : message;
  }
  return problems;
};

/**
 * Checks an answer against the question: the button exists, every value
 * fits its field, required fields are filled in. Returns all values
 * (untouched fields at their starting value, empty text left out), or the
 * problems by field id ("action" for the button).
 */
export const checkAnswer = (
  question: {
    readonly fields: readonly Field[];
    readonly actions: readonly Action[];
  },
  action: string,
  values: unknown
):
  | { readonly ok: true; readonly values: AnswerValues }
  | {
      readonly ok: false;
      readonly problems: Readonly<Record<string, string>>;
    } => {
  const button = answerButtons(question).find(
    (candidate) => candidate.id === action
  );
  if (!button) {
    return {
      ok: false,
      problems: { action: `"${action}" is not one of this event's buttons` },
    };
  }
  const decoded = Schema.decodeUnknownResult(answerSchema(question.fields))(
    values,
    STRICT_PARSE
  );
  if (decoded._tag === "Failure") {
    return { ok: false, problems: problemsOf(decoded.failure.issue) };
  }
  const complete: AnswerValues = {
    ...initialValues(question.fields),
    ...Object.fromEntries(
      Object.entries(decoded.success).filter(
        (entry): entry is [string, AnswerValue] => entry[1] !== undefined
      )
    ),
  };
  const missing = missingFields(question.fields, button, complete);
  if (missing.length > 0) {
    return {
      ok: false,
      problems: Object.fromEntries(
        missing.map((field) => [field.id, `Fill in “${field.label}” first`])
      ),
    };
  }
  // Empty text isn't an answer: leave it out rather than report "".
  return {
    ok: true,
    values: Object.fromEntries(
      Object.entries(complete).filter(([, value]) => value !== "")
    ),
  };
};

/** What happened to an event that waits for an answer. */
export const AnswerStatus = Schema.Literals([
  "pending",
  "answered",
  "expired",
  "canceled",
]);
export type AnswerStatus = typeof AnswerStatus.Type;
