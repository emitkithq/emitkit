import { Card } from "@heroui/react";
import { AppIcon } from "@ui/brand-mark";
import { Container } from "@www/components/container";
import { Grain, Halftone } from "@www/components/halftone";
import { SectionIntro } from "@www/components/section-intro";
import type { ReactNode } from "react";

/** A small white UI fragment sitting on a card's blue pattern cap. */
const CapCard = ({ children }: Readonly<{ children: ReactNode }>) => (
  <div className="bg-paper text-ink shadow-float w-[min(100%,260px)] rounded-xl px-3.5 py-3">
    {children}
  </div>
);

/** One notification line inside a cap, as the feed and the phone show it. */
const Moment = ({ body, title }: Readonly<{ body: string; title: string }>) => (
  <div className="flex items-center gap-2.5">
    <AppIcon className="size-7 shrink-0" />
    <div className="min-w-0">
      <p className="text-body m-0 truncate font-medium">{title}</p>
      <p className="text-meta text-graphite m-0 truncate">{body}</p>
    </div>
  </div>
);

/** What people send EmitKit, in the order the page tells the story. */
const REASONS = [
  {
    body: "Signups, upgrades and cancellations as they happen, without opening Stripe or your database to check.",
    cap: (
      <CapCard>
        <Moment body="maya@lumen.studio" title="New signup" />
      </CapCard>
    ),
    position: "12% 38%",
    title: "Stay in the loop",
  },
  {
    body: "A first payment, a customer's 100th invoice, the 50th signup on launch day. The moments you built the product for.",
    cap: (
      <CapCard>
        <p className="text-body m-0 flex items-baseline justify-between gap-3 font-medium">
          First payment
          <span className="text-meta text-success font-semibold tabular-nums">
            +$29
          </span>
        </p>
        <p className="text-meta text-graphite m-0 mt-0.5">
          Lumen Studio · #payments
        </p>
      </CapCard>
    ),
    position: "78% 30%",
    title: "Celebrate the small wins",
  },
  {
    body: "Every moment lands in one live feed, by project and channel, with the revenue your events carry. A glance tells you how today is going.",
    cap: (
      <CapCard>
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {[
            ["Upgraded to Team", "2m"],
            ["New signup", "9m"],
            ["Milestone", "14m"],
          ].map(([title, time]) => (
            <li
              className="text-meta flex items-baseline justify-between gap-3"
              key={title}
            >
              <span className="font-medium">{title}</span>
              <span className="text-graphite tabular-nums">{time}</span>
            </li>
          ))}
        </ul>
      </CapCard>
    ),
    position: "55% 60%",
    title: "Keep a finger on the pulse",
  },
  {
    body: "Not every exception: the few that cost you customers. Checkout failing, a sync stuck, an agent waiting on you. Those buzz your phone.",
    cap: (
      <CapCard>
        <Moment body="14 payments declined" title="Checkout is failing" />
      </CapCard>
    ),
    position: "40% 72%",
    title: "Critical errors reach you",
  },
] as const;

export const HowItWorks = () => (
  <section
    aria-labelledby="how-it-works-title"
    className="py-24 sm:py-32"
    id="how-it-works"
  >
    <Container>
      <SectionIntro
        className="reveal"
        id="how-it-works-title"
        label="How it works"
        number="01"
        title="Hear from your product when it counts."
      >
        Add one HTTP or MCP call wherever something worth knowing happens. Not
        every event: analytics and logs keep those. Just the ones you would want
        to hear about.
      </SectionIntro>

      <ol className="m-0 mt-12 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {REASONS.map((reason, index) => (
          <li className="reveal" key={reason.title}>
            <Card className="h-full gap-0 overflow-hidden p-0">
              <div className="bg-emit-blue relative isolate flex h-44 items-center justify-center overflow-hidden px-6">
                <Halftone
                  className="opacity-60"
                  pattern="ripple-white"
                  position={reason.position}
                />
                <Grain />
                <div
                  aria-hidden="true"
                  className="relative flex w-full justify-center"
                >
                  {reason.cap}
                </div>
              </div>
              <Card.Content className="gap-2 p-6">
                <p className="text-meta text-accent m-0 font-mono">
                  0{index + 1}
                </p>
                <h3 className="text-title text-foreground m-0 font-normal">
                  {reason.title}
                </h3>
                <p className="text-body text-muted m-0 leading-relaxed">
                  {reason.body}
                </p>
              </Card.Content>
            </Card>
          </li>
        ))}
      </ol>
    </Container>
  </section>
);
