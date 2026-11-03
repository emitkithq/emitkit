import { Icon } from "@ui/icon";
import { Container } from "@www/components/container";
import { Grain, Halftone } from "@www/components/halftone";
import { SectionIntro } from "@www/components/section-intro";
import { useCycle } from "@www/components/use-cycle";
import {
  MCP_EVENTS_DOCS_URL,
  OAUTH_DOCS_URL,
  WEBHOOK_RECEIVER_DOCS_URL,
} from "@www/site";
import type { CSSProperties, ReactNode } from "react";

/** An event, the signed webhook that carries it, and what the agent did. */
const SCENES = [
  {
    agent: "Billing agent",
    channel: "payments",
    detail: "Card declined · Pro plan · €49",
    eventId: "event_k2m9x7q4",
    icon: "💳",
    outcome: "Resolved in 41 s",
    reply:
      "Retried with the card on file. It went through, and I let the customer know.",
    title: "Payment failed",
  },
  {
    agent: "On-call agent",
    channel: "deploys",
    detail: "api · health check timed out",
    eventId: "event_p8w3n1c6",
    icon: "🚨",
    outcome: "Rolled back in 1 m 12 s",
    reply:
      "Rolled back to v2.41 and opened an incident with the failing check attached.",
    title: "Deploy failed on main",
  },
  {
    agent: "Support agent",
    channel: "support",
    detail: "$240 · order #4412 · bought 12 days ago",
    eventId: "event_r5t7y2u9",
    icon: "🧾",
    outcome: "Waiting for your OK",
    reply:
      "Inside the 30-day policy. I approved the refund and drafted a reply for you to check.",
    title: "Refund requested",
  },
] as const;

const EVERY_MS = 5200;

const POINTS = [
  {
    body: "ChatGPT and Claude connect by signing in: pick a project, authorize, done. No API key to paste.",
    title: "Sign in, no key",
  },
  {
    body: "The agent calls events/subscribe for event.created, for one channel, a set of tags or a single user.",
    title: "Subscribe with a filter",
  },
  {
    body: "Standard Webhooks signatures, a one-time handshake, retries that keep the event id.",
    title: "Signed and verified",
  },
  {
    body: "An agent never hears about events it created itself, so reacting can't set off a loop.",
    title: "No feedback loops",
  },
] as const;

/** A dashed wire between two steps, with a pulse running down it. */
const Wire = ({ label }: Readonly<{ label: string }>) => (
  <li aria-hidden="true" className="flex h-12 items-center gap-3 pl-7">
    <span className="relative h-full w-px bg-[repeating-linear-gradient(to_bottom,rgb(255_255_255/0.55)_0_4px,transparent_4px_8px)]">
      <span className="wire-pulse bg-paper absolute top-0 -left-[3px] size-[7px] rounded-full shadow-[0_0_12px_rgb(255_255_255/0.9)]" />
    </span>
    <span className="text-meta font-mono text-white/80">{label}</span>
  </li>
);

/** One step of the relay; replays its entrance when the scene changes. */
const Step = ({
  animate,
  children,
  delay,
}: Readonly<{ animate: boolean; children: ReactNode; delay: number }>) => (
  <li
    className={animate ? "stack-in" : ""}
    style={{ animationDelay: `${delay}s` } satisfies CSSProperties}
  >
    {children}
  </li>
);

export const AgentEvents = () => {
  const { ref, tick } = useCycle<HTMLOListElement>(EVERY_MS);
  const scene = SCENES[tick % SCENES.length] ?? SCENES[0];
  const animate = tick > 0;

  return (
    <section
      aria-labelledby="events-title"
      className="py-24 sm:py-32"
      id="events"
    >
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="reveal lg:order-2">
          <SectionIntro
            id="events-title"
            label="MCP Events"
            number="03"
            title="Agents hear about events as they happen."
          >
            An agent can subscribe to your events over MCP instead of asking for
            them. Each new one reaches it as a signed webhook, so the charge is
            retried, the deploy rolled back or the reply drafted before you open
            the dashboard.
          </SectionIntro>
          <dl className="m-0 mt-10 grid gap-6">
            {POINTS.map((point) => (
              <div className="border-separator border-t pt-5" key={point.title}>
                <dt className="text-meta text-accent font-mono">
                  {point.title}
                </dt>
                <dd className="text-body text-muted m-0 mt-1.5">
                  {point.body}
                </dd>
              </div>
            ))}
          </dl>
          <div className="text-body mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <a
              className="text-foreground inline-flex items-center gap-1.5 font-medium no-underline hover:underline"
              href={MCP_EVENTS_DOCS_URL}
            >
              MCP Events guide <Icon name="chevron-right" size={14} />
            </a>
            <a
              className="text-foreground inline-flex items-center gap-1.5 font-medium no-underline hover:underline"
              href={OAUTH_DOCS_URL}
            >
              Connect ChatGPT or Claude <Icon name="chevron-right" size={14} />
            </a>
            <a
              className="text-foreground inline-flex items-center gap-1.5 font-medium no-underline hover:underline"
              href={WEBHOOK_RECEIVER_DOCS_URL}
            >
              Build a receiver <Icon name="chevron-right" size={14} />
            </a>
          </div>
        </div>

        <div className="reveal bg-emit-blue relative isolate overflow-hidden rounded-[28px] px-5 py-8 sm:px-10 sm:py-10 lg:order-1">
          <Halftone
            className="opacity-60"
            pattern="ripple-white"
            position="20% 30%"
          />
          <Grain />
          <ol
            aria-label={`${scene.title} in #${scene.channel} reaches the subscribed ${scene.agent}, which acts on it`}
            className="relative m-0 mx-auto grid max-w-[440px] list-none p-0"
            ref={ref}
          >
            <Step animate={animate} delay={0} key={`event-${tick}`}>
              <div className="bg-paper text-ink shadow-float rounded-2xl p-4">
                <p className="text-meta text-graphite m-0 flex justify-between font-mono">
                  <span>#{scene.channel}</span>
                  <span>just now</span>
                </p>
                <p className="text-label m-0 mt-1.5 flex items-center gap-2 font-semibold">
                  <span aria-hidden="true">{scene.icon}</span>
                  {scene.title}
                </p>
                <p className="text-body text-ink/70 m-0 mt-0.5">
                  {scene.detail}
                </p>
              </div>
            </Step>
            <Wire label="event.created" />
            <Step animate={animate} delay={0.45} key={`hook-${tick}`}>
              <div className="bg-midnight shadow-float overflow-hidden rounded-2xl border border-white/10 px-4 py-3.5 font-mono text-[12px] leading-5 text-white/85">
                <p className="m-0 truncate">
                  <span className="text-signal">POST</span>{" "}
                  agent.example.com/hooks/emitkit
                </p>
                <p className="m-0 truncate">
                  <span className="text-white/45">webhook-id</span>{" "}
                  {scene.eventId}…
                </p>
                <p className="m-0 truncate">
                  <span className="text-white/45">webhook-signature</span>{" "}
                  v1,K5oZfzN95Z9UVu1E…
                </p>
                <p className="m-0 truncate">
                  <span className="text-white/45">x-mcp-subscription-id</span>{" "}
                  sub_4f0c9d8e…
                </p>
                <p className="text-success m-0 mt-2 flex items-center gap-1.5">
                  <Icon name="check" size={13} /> signature verified
                </p>
              </div>
            </Step>
            <Wire label="agent acts" />
            <Step animate={animate} delay={0.95} key={`agent-${tick}`}>
              <div className="bg-paper text-ink shadow-float rounded-2xl p-4">
                <p className="m-0 flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-emit-blue text-paper grid size-7 shrink-0 place-items-center rounded-full"
                  >
                    <Icon name="spark" size={15} />
                  </span>
                  <span className="text-label font-semibold">
                    {scene.agent}
                  </span>
                </p>
                <p className="text-body text-ink/80 m-0 mt-2.5">
                  {scene.reply}
                </p>
                <p className="text-meta text-graphite m-0 mt-2.5 flex items-center gap-1.5 font-mono">
                  <Icon className="text-success" name="check" size={13} />
                  {scene.outcome}
                </p>
              </div>
            </Step>
          </ol>
        </div>
      </Container>
    </section>
  );
};
