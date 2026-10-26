import { Tabs } from "@heroui/react";
import { useAppLinks } from "@www/app-origin";
import { ButtonLink } from "@www/components/button-link";
import { Grain } from "@www/components/halftone";
import { Photo } from "@www/components/photo";
import { QUICKSTART_URL } from "@www/site";
import { Component, lazy, Suspense, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";

const delay = (seconds: number, name = "--rise-delay") =>
  ({ [name]: `${seconds}s` }) as CSSProperties;

/** Darkens the top of the photo so the white copy reads over the sky. */
const SCRIM =
  "linear-gradient(180deg, rgb(30 18 40 / 0.34) 0%, rgb(30 18 40 / 0.18) 45%, rgb(30 18 40 / 0) 73%)";

/** The dashboard views behind the hero tabs, named for what each one shows. */
const VIEWS = [
  { id: "feed", label: "Live feed" },
  { id: "revenue", label: "Revenue" },
  { id: "agents", label: "Agents" },
  { id: "errors", label: "Errors" },
] as const;

/**
 * The real dashboard on made-up data, in its own chunk: the feed, the pulse
 * and recharts load after the page is up, never before first paint.
 */
const DashboardDemo = lazy(async () => {
  const module = await import("@www/landing/dashboard-demo");
  return { default: module.DashboardDemo };
});

// The value never changes after hydration, so there is nothing to listen to.
// oxlint-disable-next-line no-empty-function -- useSyncExternalStore needs an unsubscribe.
const noSubscription = () => () => {};

/**
 * False in the prerender and while hydrating, true after. The demo shows
 * times relative to the reader's clock and zone, which the prerender can't
 * know, so it only renders once the page is live in the browser.
 */
const useIsHydrated = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );

/** The window's shape while the demo loads: top bar, pulse, rows. */
const DemoSkeleton = () => (
  <div aria-hidden="true" className="bg-background flex h-full flex-col">
    <div className="flex h-14 items-center gap-2 px-4">
      <span className="bg-default-soft size-7 rounded-lg" />
      <span className="bg-default-soft h-3.5 w-28 rounded-md" />
    </div>
    <div className="flex flex-col gap-4 px-4 sm:px-6">
      <span className="bg-default-soft mt-1 h-3 w-40 rounded-md" />
      <span className="bg-surface h-36 rounded-3xl" />
      <span className="bg-surface h-9 rounded-xl" />
      {[0, 1, 2, 3].map((row) => (
        <span className="flex items-center gap-3" key={row}>
          <span className="bg-default-soft size-10 rounded-xl" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="bg-default-soft h-3.5 w-2/5 rounded-md" />
            <span className="bg-default-soft h-3 w-3/4 rounded-md" />
          </span>
        </span>
      ))}
    </div>
  </div>
);

/**
 * Keeps the skeleton when the demo's chunk can't load (a deploy replaced it,
 * or the network dropped), instead of taking the whole page down with it.
 */
class DemoBoundary extends Component<
  { children: ReactNode },
  { hasFailed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasFailed: false };
  }

  static getDerivedStateFromError() {
    return { hasFailed: true };
  }

  override render() {
    return this.state.hasFailed ? <DemoSkeleton /> : this.props.children;
  }
}

/**
 * The dashboard as a window floating in front of the landscape, with a tab
 * per view. The feed scrolls inside it.
 */
const DashboardTabs = () => {
  const isHydrated = useIsHydrated();
  return (
    <Tabs
      className="rise relative z-20 flex w-full max-w-[820px] flex-col items-center gap-4"
      defaultSelectedKey="feed"
      style={delay(0.32)}
    >
      <Tabs.ListContainer className="max-w-full">
        <Tabs.List
          aria-label="Views of the EmitKit dashboard"
          className="rounded-full border border-white/30 bg-black/30 p-1 backdrop-blur-md"
        >
          {VIEWS.map((view) => (
            <Tabs.Tab
              className="data-[selected=true]:text-ink rounded-full px-3.5 whitespace-nowrap text-white"
              id={view.id}
              key={view.id}
            >
              {view.label}
              <Tabs.Indicator className="rounded-full bg-white" />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {VIEWS.map((view) => (
        <Tabs.Panel className="w-full p-0" id={view.id} key={view.id}>
          <div className="h-(--demo-height) overflow-hidden rounded-[22px] border border-white/60 bg-white/40 p-1.5 text-left shadow-[0_20px_48px_-24px_rgb(30_18_40/0.28),0_2px_8px_-2px_rgb(30_18_40/0.08)] backdrop-blur-md">
            <div className="h-full overflow-hidden rounded-[16px]">
              {isHydrated ? (
                <DemoBoundary>
                  <Suspense fallback={<DemoSkeleton />}>
                    <DashboardDemo view={view.id} />
                  </Suspense>
                </DemoBoundary>
              ) : (
                <DemoSkeleton />
              )}
            </div>
          </div>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
};

export const Hero = () => {
  const { signUp } = useAppLinks();
  return (
    <section
      aria-labelledby="hero-title"
      className="pt-3 [--demo-height:clamp(460px,52vw,640px)] sm:pt-6"
    >
      <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-8 lg:px-14">
        <div className="relative isolate overflow-hidden rounded-[28px]">
          <Photo
            className="absolute inset-0 -z-10"
            name="halo"
            priority
            sizes="(min-width: 1440px) 1328px, 100vw"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            style={{ backgroundImage: SCRIM }}
          />

          <div className="flex flex-col items-center px-5 pt-12 pb-[calc(var(--demo-height)-36px)] text-center sm:pt-[72px]">
            <p className="rise text-meta m-0 flex items-center gap-2.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 font-mono tracking-[0.04em] text-white uppercase backdrop-blur-md">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-white"
              />
              For humans and agents
            </p>
            <h1
              className="rise m-0 mt-5 max-w-[22ch] text-[clamp(2.75rem,1.2rem+5.2vw,5.75rem)] leading-[0.96] font-normal tracking-[-0.045em] text-balance text-white [text-shadow:0_2px_24px_rgb(30_18_40/0.25)]"
              id="hero-title"
              style={delay(0.08)}
            >
              Stay in the loop{" "}
              <span className="sm:block">with your product.</span>
            </h1>
            <p
              className="rise text-lead m-0 mt-5 max-w-[56ch] text-pretty text-white/90 [text-shadow:0_1px_12px_rgb(30_18_40/0.45)]"
              style={delay(0.16)}
            >
              Your app and your AI agents tell you what is worth knowing: a new
              signup, a first payment, a customer’s 100th invoice, the error
              that can’t wait. Not every event. Just the ones you’d want on your
              lock screen.
            </p>
            <div
              className="rise mt-7 flex flex-wrap justify-center gap-3"
              style={delay(0.24)}
            >
              <ButtonLink
                className="text-accent bg-white hover:bg-white/90"
                href={signUp}
                size="lg"
              >
                Get started
              </ButtonLink>
              <ButtonLink
                className="border border-white/35 bg-black/25 text-white backdrop-blur-md hover:bg-black/35"
                href={QUICKSTART_URL}
                size="lg"
                variant="ghost"
              >
                Read the quickstart
              </ButtonLink>
            </div>
          </div>
          {/* Film grain over the photo and copy; the dashboard floats above it. */}
          <Grain className="grain-over z-10" />
        </div>
        {/* The dashboard rises out of the frame's lower edge and hangs
            150px over the page below it, so it sits in front of the
            landscape. 92px is that overhang less the tab strip above the
            window (about 58px). */}
        <div className="relative z-20 mt-[calc(92px-var(--demo-height))] flex justify-center px-2 sm:px-6">
          <DashboardTabs />
        </div>
      </div>
    </section>
  );
};
