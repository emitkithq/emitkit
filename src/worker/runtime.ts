import { makeAppLayer } from "@server/app-layer";
import type { AppServices } from "@server/app-layer";
import type { Env } from "@server/platform/env";
import { ManagedRuntime } from "effect";

type AppRuntime = ManagedRuntime.ManagedRuntime<AppServices, unknown>;

interface Built {
  readonly runtime: AppRuntime;
  readonly ready: Promise<boolean>;
}

const BUILD_TIMEOUT_MS = 10_000;

let current: Built | undefined;

const whenBuilt = async (runtime: AppRuntime) => {
  try {
    await runtime.context();
    return true;
  } catch (error) {
    console.error("app layer failed to build", error);
    return false;
  }
};

const build = (env: Env): Built => {
  const runtime = ManagedRuntime.make(makeAppLayer(env));
  return { ready: whenBuilt(runtime), runtime };
};

const timeout = async (ms: number) => {
  await scheduler.wait(ms);
  return false;
};

/**
 * One ManagedRuntime per isolate, built on first use and reused. The build
 * runs inside whichever request arrives first; if that request is cut off
 * mid-build (or the build fails), the next request builds a fresh runtime
 * instead of waiting on the stalled one forever.
 */
export const appRuntime = async (env: Env): Promise<AppRuntime> => {
  current ??= build(env);
  if (await Promise.race([current.ready, timeout(BUILD_TIMEOUT_MS)])) {
    return current.runtime;
  }
  current = build(env);
  await current.ready;
  return current.runtime;
};
