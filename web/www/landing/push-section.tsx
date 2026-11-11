import { Icon } from "@ui/icon";
import { PushCard } from "@ui/push-card";
import { Container } from "@www/components/container";
import { Grain, Ping } from "@www/components/halftone";
import { Photo } from "@www/components/photo";
import { SectionIntro } from "@www/components/section-intro";
import { useCycle } from "@www/components/use-cycle";

/** Moments from apps and agents, as their push notifications read. */
const NOTIFICATIONS = [
  { body: "Lumen Studio · Pro, $29 a month", title: "First payment" },
  {
    body: "support-agent · refund of $240 for Lumen Studio",
    title: "Agent needs your OK",
  },
  { body: "Northwind just sent its 100th invoice", title: "Milestone" },
  { body: "14 payments declined in 5 minutes", title: "Checkout is failing" },
  { body: "maya@lumen.studio · from Product Hunt", title: "New signup" },
] as const;

const VISIBLE = 3;
const EVERY_MS = 3800;

const POINTS = [
  "Standard web push in desktop browsers and on Android",
  "iPhone and iPad once EmitKit is on the Home Screen",
  "Notifications per project or per channel, your choice",
] as const;

export const PushSection = () => {
  // A new notification lands on top of the stack every few seconds.
  const { ref: stack, tick: newest } = useCycle<HTMLOListElement>(EVERY_MS);
  const shown = Array.from({ length: VISIBLE }, (_, offset) => {
    const index = newest - offset;
    const at =
      ((index % NOTIFICATIONS.length) + NOTIFICATIONS.length) %
      NOTIFICATIONS.length;
    return { index, ...(NOTIFICATIONS[at] ?? NOTIFICATIONS[0]) };
  });

  return (
    <section aria-labelledby="push-title" className="py-24 sm:py-32" id="push">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="reveal">
          <SectionIntro
            id="push-title"
            label="Push notifications"
            number="04"
            title="Only what deserves a buzz."
          >
            Install EmitKit on your phone and desktop and choose, channel by
            channel, what may interrupt you: a first payment, an agent waiting
            for your OK, checkout going down. Everything else waits quietly in
            the feed.
          </SectionIntro>
          <ul className="m-0 mt-8 grid list-none gap-3 p-0">
            {POINTS.map((point) => (
              <li
                className="text-copy text-foreground flex items-start gap-3"
                key={point}
              >
                <Icon
                  className="text-accent mt-1 shrink-0"
                  name="check"
                  size={18}
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="reveal relative isolate aspect-[5/4] overflow-hidden rounded-[28px]">
          <Photo
            className="absolute inset-0 object-[50%_60%]"
            name="island"
            sizes="(min-width: 1024px) 560px, 100vw"
          />
          <Grain />
          <Ping className="top-[34%] left-[22%] opacity-80" />
          <ol
            aria-label="Recent push notifications"
            className="absolute inset-x-[8%] top-[18%] m-0 grid list-none gap-2.5 p-0"
            ref={stack}
          >
            {shown.map((item, position) => (
              <li
                className="transition-[opacity,transform] duration-700 ease-out"
                key={item.index}
                style={{
                  opacity: 1 - position * 0.22,
                  transform: `scale(${1 - position * 0.03})`,
                }}
              >
                <PushCard
                  body={item.body}
                  className={item.index > 0 && position === 0 ? "stack-in" : ""}
                  time={position === 0 ? "now" : `${position * 4}m`}
                  title={item.title}
                />
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
};
