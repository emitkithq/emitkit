import { CloudflareEnv } from "@server/platform/cloudflare";
import { Context, Effect, Layer, Option, Schema } from "effect";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";
const decodeCompletion = Schema.decodeUnknownOption(
  Schema.Struct({ response: Schema.String })
);

/** Optional Workers AI binding; absent locally and on accounts without AI. */
export class TextModel extends Context.Service<
  TextModel,
  {
    readonly complete: (
      system: string,
      prompt: string
    ) => Effect.Effect<Option.Option<string>>;
  }
>()("emitkit/platform/TextModel") {
  static readonly layer = Layer.effect(
    TextModel,
    Effect.gen(function* () {
      const env = yield* CloudflareEnv;
      const ai = env.AI;
      const complete = Effect.fn("TextModel.complete")(function* (
        system: string,
        prompt: string
      ) {
        if (!ai) {
          return Option.none();
        }
        const output = yield* Effect.tryPromise(() =>
          ai.run(MODEL, {
            max_tokens: 16,
            messages: [
              { content: system, role: "system" },
              { content: prompt, role: "user" },
            ],
          })
        ).pipe(Effect.timeout("4 seconds"), Effect.option);
        return output.pipe(
          Option.flatMap(decodeCompletion),
          Option.map((completion) => completion.response)
        );
      });
      return TextModel.of({ complete });
    })
  );
}
