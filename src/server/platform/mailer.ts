import { renderEmail } from "@server/email/template";
import type { TransactionalEmail } from "@server/email/template";
import { infrastructure } from "@server/errors";
import type { InfrastructureError } from "@server/errors";
import { CloudflareEnv } from "@server/platform/cloudflare";
import { AppConfig } from "@server/platform/config";
import { Context, Effect, Layer } from "effect";

/** Sends transactional email through Cloudflare Email Sending (`EMAIL` binding). */
export class Mailer extends Context.Service<
  Mailer,
  {
    readonly send: (
      email: TransactionalEmail
    ) => Effect.Effect<void, InfrastructureError>;
  }
>()("emitkit/platform/Mailer") {
  static readonly layer = Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const env = yield* CloudflareEnv;
      const config = yield* AppConfig;
      const send = Effect.fn("Mailer.send")(function* (
        email: TransactionalEmail
      ) {
        const { html, text } = renderEmail(email, config.appUrl);
        yield* Effect.tryPromise({
          catch: infrastructure("email.send"),
          try: () =>
            env.EMAIL.send({
              from: { email: config.emailFrom, name: "EmitKit" },
              html,
              subject: email.subject,
              text,
              to: email.to,
            }),
        });
        yield* Effect.logInfo("email sent", { subject: email.subject });
      });
      return Mailer.of({ send });
    })
  );
}
