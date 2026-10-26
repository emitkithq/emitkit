import { isTestAccount } from "@shared/test-accounts";
import type { AnalyticsProvider, EventContext } from "trakoo";

/**
 * Operator telemetry in the browser: page views of the site, docs and
 * dashboard go to the operator's OpenPanel project through trakoo, and a
 * signed-in user is named with their Better Auth id, the profile id the
 * server reports under (`src/server/platform/telemetry.ts`), so visits and
 * sign-ups, trials and payments join up. The Worker injects the project's
 * client id (`emitkit:openpanel-client-id`) only when telemetry is set up;
 * without it (self-hosting) nothing is loaded or sent.
 *
 * Automated browsers (E2E runs) and test accounts are never reported.
 */

export interface Visitor {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

interface VisitorTraits {
  readonly email: string;
  readonly name: string;
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
}

const meta = (name: string) =>
  document
    .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    ?.content.trim() || undefined;

/**
 * Query parameters that say where a visit came from. Everything else (reset
 * tokens, invitation ids, setup steps) stays in the browser.
 */
const CAMPAIGN = /^(?:utm_[a-z_]+|ref)$/u;

const publicUrl = (href: string): string => {
  const url = new URL(href);
  const kept = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (CAMPAIGN.test(name)) {
      kept.append(name, value);
    }
  }
  url.search = kept.toString();
  url.hash = "";
  return url.href;
};

const publicReferrer = (referrer: string | undefined) => {
  if (!referrer) {
    return referrer;
  }
  try {
    return publicUrl(referrer);
  } catch {
    return "";
  }
};

const scrub = (context: EventContext | undefined) => {
  if (!context?.page) {
    return context;
  }
  const { search: _search, ...page } = context.page;
  return {
    ...context,
    page: {
      ...page,
      referrer: publicReferrer(page.referrer),
      url: publicUrl(page.url ?? window.location.href),
    },
  };
};

/**
 * trakoo reports `location.href` with its query string; this passes on only
 * the public part of every URL.
 */
const scrubbing = (provider: AnalyticsProvider): AnalyticsProvider => ({
  identify: (userId, traits) => provider.identify(userId, traits),
  initialize: () => provider.initialize(),
  name: provider.name,
  pageView: (properties, context) =>
    provider.pageView(properties, scrub(context)),
  reset: () => provider.reset(),
  track: (event, context, invocation) =>
    provider.track(event, scrub(context), invocation),
});

const WHITESPACE = /\s+/u;

const start = async () => {
  const clientId = meta("emitkit:openpanel-client-id");
  if (!clientId || navigator.webdriver) {
    return null;
  }
  const [{ defineEvents, typed }, { createClientAnalytics }, providers] =
    await Promise.all([
      import("trakoo"),
      import("trakoo/client"),
      import("@trakoo/openpanel/client"),
    ]);
  const analytics = createClientAnalytics({
    events: defineEvents({}),
    providers: [
      scrubbing(
        new providers.OpenPanelClientProvider({
          apiUrl: meta("emitkit:openpanel-api-url"),
          clientId,
        })
      ),
    ],
    userTraits: typed<VisitorTraits>(),
  });
  await analytics.initialize();
  return analytics;
};

type Analytics = NonNullable<Awaited<ReturnType<typeof start>>>;

let analytics: Promise<Analytics | null> | undefined;

const load = async () => {
  try {
    return await start();
  } catch {
    // An SDK that fails to load (an ad blocker, say) turns page views off.
    return null;
  }
};

const withAnalytics = async (work: (ready: Analytics) => void) => {
  analytics ??= load();
  const ready = await analytics;
  if (ready) {
    work(ready);
  }
};

/** Set while a test account is signed in: nothing is reported. */
let muted = false;
let identified: string | undefined;
let lastViewed: string | undefined;

/** Reports the current page, once per public URL. */
export const trackPageView = (): void => {
  const url = publicUrl(window.location.href);
  if (muted || url === lastViewed) {
    return;
  }
  lastViewed = url;
  void withAnalytics((ready) => ready.pageView());
};

/** Forgets the signed-in user: visits from here on are anonymous. */
export const forgetVisitor = (): void => {
  muted = false;
  if (identified === undefined) {
    return;
  }
  identified = undefined;
  void withAnalytics((ready) => ready.reset());
};

/** Names the signed-in user, once per user. */
export const identifyVisitor = (visitor: Visitor): void => {
  if (isTestAccount(visitor.email)) {
    forgetVisitor();
    muted = true;
    return;
  }
  if (identified === visitor.id) {
    return;
  }
  const previous = identified;
  identified = visitor.id;
  const [firstName, ...rest] = visitor.name.trim().split(WHITESPACE);
  void withAnalytics((ready) => {
    if (previous !== undefined) {
      ready.reset();
    }
    ready.identify(visitor.id, {
      email: visitor.email,
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      name: visitor.name,
    });
  });
};
