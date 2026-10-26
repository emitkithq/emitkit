/**
 * Guards the Alchemy state that production depends on. The state holds the
 * generated BETTER_AUTH_SECRET and VAPID key; deploying without it creates new
 * ones, which signs everyone out and breaks every push subscription.
 *
 *   pnpm state:check                 # remote store holds the prod stack (deploys run this first)
 *   pnpm state:migrate               # one-time copy of ./.alchemy into the Cloudflare store
 *   pnpm state:migrate --force       # overwrite a remote copy that already exists
 *
 * Pass `--env-file .env.local` to read CLOUDFLARE_* from a file; otherwise the
 * environment or the logged-in Alchemy profile is used. Prints resource names
 * and counts only, never state values.
 */
import { NodeRuntime } from "@effect/platform-node";
import * as Alchemist from "alchemy/Alchemist";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const STACK = "EmitKit";
const STAGE = process.env.ALCHEMY_STAGE ?? "prod";
/** Resources whose loss is unrecoverable (generated secrets) or means a re-adopt. */
const REQUIRED = ["BetterAuthSecret", "VapidPrivateKey", "DB", "Worker"];

class StateGuardError extends Schema.TaggedError<StateGuardError>()(
  "StateGuardError",
  { message: Schema.String }
) {}

const args = process.argv.slice(2);
const [command] = args;
const force = args.includes("--force");
const envFileIndex = args.indexOf("--env-file");
const envFile = envFileIndex === -1 ? undefined : args[envFileIndex + 1];

const missingRequired = (fqns: readonly string[]) =>
  REQUIRED.filter(
    (name) => !fqns.some((fqn) => fqn === name || fqn.endsWith(`/${name}`))
  );

const listProd = Effect.fn("listProd")(function* (store: State.StateService) {
  const stacks = yield* store.listStacks();
  if (!stacks.includes(STACK)) {
    return [];
  }
  const stages = yield* store.listStages(STACK);
  if (!stages.includes(STAGE)) {
    return [];
  }
  return yield* store.list({ stack: STACK, stage: STAGE });
});

const remoteStore = Alchemist.State.store({ backend: "cloudflare", envFile });

const check = Effect.gen(function* () {
  const fqns = yield* listProd(yield* remoteStore);
  const missing = missingRequired(fqns);
  if (missing.length > 0) {
    return yield* new StateGuardError({
      message:
        `Cloudflare state store has no complete ${STACK}/${STAGE} stack ` +
        `(missing: ${missing.join(", ")}). Refusing to deploy: it would create ` +
        "new secrets. Migrate the existing state first (docs/content/self-hosting/deployment.md).",
    });
  }
  yield* Effect.log(`OK: ${STACK}/${STAGE} has ${fqns.length} resources`);
});

const migrate = Effect.gen(function* () {
  const local = yield* Alchemist.State.store({ backend: "local" });
  const localFqns = yield* listProd(local);
  const missing = missingRequired(localFqns);
  if (missing.length > 0) {
    return yield* new StateGuardError({
      message:
        `./.alchemy has no complete ${STACK}/${STAGE} stack ` +
        `(missing: ${missing.join(", ")}). Run this from the checkout that holds production state.`,
    });
  }

  const remote = yield* remoteStore;
  const remoteFqns = yield* listProd(remote);
  if (remoteFqns.length > 0 && !force) {
    return yield* new StateGuardError({
      message:
        `Cloudflare state store already holds ${STACK}/${STAGE} ` +
        `(${remoteFqns.length} resources). Pass --force to overwrite it with ./.alchemy.`,
    });
  }

  yield* State.syncState(local, remote, { stacks: [STACK] });
  const copied = yield* listProd(remote);
  if (copied.length !== localFqns.length) {
    return yield* new StateGuardError({
      message: `Copied ${copied.length} of ${localFqns.length} resources; run again.`,
    });
  }
  yield* Effect.log(
    `Copied ${copied.length} ${STACK}/${STAGE} resources to the Cloudflare state store`
  );
});

const selectProgram = () => {
  if (command === "check") {
    return check;
  }
  if (command === "migrate") {
    return migrate;
  }
  return Effect.fail(
    new StateGuardError({
      message:
        "Usage: alchemy-state.ts <check|migrate> [--force] [--env-file <path>]",
    })
  );
};

selectProgram().pipe(
  Effect.provide(Alchemist.layer()),
  Effect.scoped,
  NodeRuntime.runMain
);
