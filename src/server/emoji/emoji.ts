import { TextModel } from "@server/platform/workers-ai";
import { Context, Effect, Layer, Option } from "effect";

const PICTOGRAPH = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u;

const KEYWORDS: readonly (readonly [RegExp, string])[] = [
  [/pay|billing|invoice|revenue|stripe|charge|sale|order/u, "💰"],
  [/sign ?up|signup|user|register|join|onboard/u, "🙋"],
  [/error|fail|crash|exception|bug|incident|alert/u, "🚨"],
  [/deploy|release|ship|build|ci|launch/u, "🚀"],
  [/mail|email|newsletter|message|inbox/u, "📬"],
  [/support|ticket|help|feedback|chat/u, "💬"],
  [/cron|job|schedule|task|queue/u, "⏰"],
  [/security|auth|login|password|access/u, "🔐"],
  [/trial|subscription|plan|upgrade|churn|cancel/u, "📈"],
];

const fallback = (name: string) =>
  KEYWORDS.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1] ?? "🔔";

/** Suggests an emoji icon for a channel name (Workers AI with keyword fallback). */
export class EmojiSuggester extends Context.Service<
  EmojiSuggester,
  { readonly suggest: (name: string) => Effect.Effect<string> }
>()("emitkit/emoji/EmojiSuggester") {
  static readonly layer = Layer.effect(
    EmojiSuggester,
    Effect.gen(function* () {
      const model = yield* TextModel;
      const suggest = Effect.fn("EmojiSuggester.suggest")(function* (
        name: string
      ) {
        const answer = yield* model.complete(
          "You pick icons for notification channels. Reply with exactly one emoji and nothing else.",
          `Channel name: ${name.slice(0, 100)}`
        );
        return answer.pipe(
          Option.flatMap((text) =>
            Option.fromNullishOr(PICTOGRAPH.exec(text)?.[0])
          ),
          Option.getOrElse(() => fallback(name))
        );
      });
      return EmojiSuggester.of({ suggest });
    })
  );
}
