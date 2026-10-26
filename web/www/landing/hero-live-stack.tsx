import { PushCard } from "@ui/push-card";
import { useAppLinks } from "@www/app-origin";
import { ButtonLink } from "@www/components/button-link";
import { Grain } from "@www/components/halftone";
import { Photo } from "@www/components/photo";
import { QUICKSTART_URL } from "@www/site";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

const delay = (seconds: number, name = "--rise-delay") =>
  ({ [name]: `${seconds}s` }) as CSSProperties;

/** Darkens the top of the photo so the white copy reads over the sky. */
const SCRIM =
  "linear-gradient(180deg, rgb(30 18 40 / 0.34) 0%, rgb(30 18 40 / 0.18) 45%, rgb(30 18 40 / 0) 73%)";

/**
 * Moments that take turns arriving in the hero; the first starts in front.
 * A mix of the four reasons people use EmitKit: the loop, small wins, the
 * pulse and the error that can't wait, from code and from agents.
 */
const EVENTS = [
  { body: "maya@lumen.studio · from Product Hunt", title: "New signup" },
  { body: "Lumen Studio · Pro, $29 a month", title: "First payment" },
  { body: "Northwind just sent its 100th invoice", title: "Milestone" },
  {
    body: "support-agent · refund of $240 for Lumen Studio",
    title: "Agent needs your OK",
  },
  { body: "14 payments declined in 5 minutes", title: "Checkout is failing" },
  { body: "Harbor Labs · 5 seats", title: "Upgraded to Team" },
  {
    body: "research-agent · weekly churn summary is ready",
    title: "Agent finished",
  },
] as const;

/** Cards on screen at once; one more sits behind them, fading out. */
const VISIBLE = 3;
const ARRIVAL_MS = 3200;
const TIMES = ["now", "1m", "4m", "9m"] as const;

/**
 * Where each card sits by age: the newest in front, older ones tucked
 * behind it so only a sliver shows, smaller, fainter and emptied, as a phone
 * stacks them. The last is on its way out.
 */
const DEPTH = [
  { opacity: 1, transform: "translateY(0) scale(1)" },
  { opacity: 0.8, transform: "translateY(11px) scale(0.94)" },
  { opacity: 0.5, transform: "translateY(22px) scale(0.88)" },
  { opacity: 0, transform: "translateY(30px) scale(0.84)" },
] as const;

/**
 * The feed arriving in the landscape: a new event lands on top every few
 * seconds and pushes the others back. It starts from the same three cards
 * the prerender shows, and stays still for readers who ask for less motion.
 */
const LiveStack = () => {
  const [newest, setNewest] = useState(VISIBLE - 1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setNewest((count) => count + 1);
      }
    }, ARRIVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Newest first in the DOM, so readers meet the latest event first.
  const arrivals = DEPTH.map((_, age) => newest - age).filter(
    (arrival) => arrival >= 0
  );

  return (
    // Every card has the same height, so the frame never jumps as they change.
    <div className="relative h-[76px] w-[min(88vw,440px)]">
      {arrivals.map((arrival) => {
        const age = newest - arrival;
        // Counts down the list, so the first event starts in front.
        const index =
          (((VISIBLE - 1 - arrival) % EVENTS.length) + EVENTS.length) %
          EVENTS.length;
        const event = EVENTS[index] ?? EVENTS[0];
        return (
          <PushCard
            body={event.body}
            bodyLines={1}
            className={`stack-in absolute inset-x-0 top-0 h-[76px] rounded-[24px] border-white/50 bg-white/90 py-0 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] [&>*]:transition-opacity [&>*]:duration-500 ${age === 0 ? "" : "[&>*]:opacity-0"}`}
            key={arrival}
            style={{
              ...DEPTH[age],
              zIndex: DEPTH.length - age,
              animationDelay:
                arrival < VISIBLE ? `${0.5 + arrival * 0.3}s` : "0s",
              transformOrigin: "50% 100%",
            }}
            time={TIMES[age]}
            title={event.title}
          />
        );
      })}
    </div>
  );
};

/**
 * The hero as it was with a live stack of notifications in the landscape,
 * kept for comparison with the dashboard-screenshot hero. Not mounted.
 */
export const HeroLiveStack = () => {
  const { signUp } = useAppLinks();
  return (
    <section aria-labelledby="hero-title" className="pt-3 sm:pt-6">
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

          <div className="flex flex-col items-center px-5 pt-12 pb-24 text-center sm:pt-[72px] sm:pb-32">
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

            <div className="mt-20 sm:mt-28">
              <LiveStack />
            </div>
          </div>
          {/* Film grain over the whole frame, notifications included. */}
          <Grain className="grain-over z-10" />
        </div>
      </div>
    </section>
  );
};
