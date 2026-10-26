import { Tabs } from "@heroui/react";
import NumberFlow from "@number-flow/react";
import { plans } from "@shared/billing";
import type { PlanBilling, PlanId, PlanInfo } from "@shared/billing";
import { cn } from "@ui/cn";
import { Icon } from "@ui/icon";
import { useAppLinks } from "@www/app-origin";
import { ButtonLink } from "@www/components/button-link";
import { Container } from "@www/components/container";
import { GitHubLink } from "@www/components/github-link";
import { Grain, Halftone } from "@www/components/halftone";
import { SectionIntro } from "@www/components/section-intro";
import {
  DOCS_URL,
  EVENT_RETENTION_DAYS,
  RATE_LIMIT_PER_MINUTE,
} from "@www/site";
import { useState } from "react";

type Size = "solo" | "team";

const PERIODS: readonly { id: PlanBilling; label: string; note: string }[] = [
  { id: "month", label: "Monthly", note: "" },
  { id: "year", label: "Annual", note: "−17%" },
  { id: "lifetime", label: "Lifetime", note: "Launch" },
];

const OFFERS: Readonly<Record<PlanBilling, Readonly<Record<Size, PlanId>>>> = {
  lifetime: { solo: "solo_lifetime", team: "team_lifetime" },
  month: { solo: "solo", team: "team" },
  year: { solo: "solo_annual", team: "team_annual" },
};

const SUFFIX: Readonly<Record<PlanBilling, string>> = {
  lifetime: "once",
  month: "/mo",
  year: "/yr",
};

const INCLUDED = [
  "Unlimited events, projects and channels",
  "Push notifications on phone and desktop",
  "Live feed, revenue and search",
  "REST API, TypeScript SDK and MCP server",
  `${EVENT_RETENTION_DAYS} days of history, ${RATE_LIMIT_PER_MINUTE} requests/min per key`,
] as const;

/** Seats, and what the period means for this plan. */
const planLine = (plan: PlanInfo) => {
  const seats = `${plan.seats} ${plan.seats === 1 ? "seat" : "seats"}`;
  switch (plan.billing) {
    case "month": {
      return `${seats} · +$${plan.extraSeatPrice}/seat after · ${plan.trialDays}-day free trial`;
    }
    case "year": {
      return `${seats} · +$${plan.extraSeatPrice}/seat after · $${(plan.price / 12).toFixed(2)}/mo billed yearly`;
    }
    default: {
      return plan.seats === 1
        ? `${seats} · pay once · price goes up every five sales`
        : `${seats} · pay once`;
    }
  }
};

const isPeriod = (value: unknown): value is PlanBilling =>
  PERIODS.some((option) => option.id === value);

/**
 * Monthly · Annual · Lifetime, as the hero's tabs: a rounded pill with a
 * sliding indicator (dark here, where the hero's is white on the photo).
 */
const PeriodTabs = ({
  onChange,
  period,
}: {
  onChange: (period: PlanBilling) => void;
  period: PlanBilling;
}) => (
  <Tabs
    className="w-fit"
    onSelectionChange={(key) => {
      if (isPeriod(key)) {
        onChange(key);
      }
    }}
    selectedKey={period}
  >
    <Tabs.ListContainer className="w-fit max-w-full">
      <Tabs.List
        aria-label="Billing period"
        className="border-border bg-surface w-fit rounded-full border p-1"
      >
        {PERIODS.map((option) => (
          <Tabs.Tab
            className="group text-foreground data-[selected=true]:text-background w-auto flex-none gap-1.5 rounded-full px-4 whitespace-nowrap"
            data-period={option.id}
            id={option.id}
            key={option.id}
          >
            {option.label}
            {option.note ? (
              <span className="text-meta text-accent group-data-[selected=true]:text-background/75">
                {option.note}
              </span>
            ) : null}
            <Tabs.Indicator className="bg-foreground rounded-full" />
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.ListContainer>
  </Tabs>
);

/** The hosted plan: Solo or Team inside the card, price for the period. */
const HostedCard = ({
  period,
  signUp,
}: {
  period: PlanBilling;
  signUp: string;
}) => {
  const [size, setSize] = useState<Size>("solo");
  const plan = plans[OFFERS[period][size]];
  return (
    <div
      className="bg-emit-blue text-paper relative isolate flex flex-col overflow-hidden rounded-3xl p-8 sm:p-10"
      data-plan={plan.id}
    >
      <Halftone
        className="[mask-image:radial-gradient(90%_80%_at_100%_100%,black,transparent)] opacity-60"
        pattern="ripple-white"
        position="85% 70%"
      />
      <Grain />
      <fieldset className="relative flex gap-6">
        <legend className="sr-only">Plan</legend>
        {(["solo", "team"] as const).map((option) => {
          const selected = option === size;
          return (
            <label
              className={cn(
                "cursor-pointer rounded-md text-[28px] leading-none tracking-[-0.02em] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-white",
                selected ? "text-paper" : "text-paper/55 hover:text-paper/80"
              )}
              data-size={option}
              key={option}
            >
              <input
                checked={selected}
                className="sr-only"
                name="pricing-size"
                onChange={() => setSize(option)}
                type="radio"
                value={option}
              />
              {option === "solo" ? "Solo" : "Team"}
            </label>
          );
        })}
      </fieldset>
      <p className="relative m-0 mt-8 flex items-baseline gap-2">
        <span
          className="text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums"
          data-price={plan.price}
        >
          <NumberFlow
            format={{
              currency: "USD",
              maximumFractionDigits: 0,
              style: "currency",
            }}
            value={plan.price}
          />
        </span>
        <span className="text-lead text-paper/75">{SUFFIX[period]}</span>
      </p>
      <p className="text-copy text-paper/75 relative m-0 mt-3">
        {planLine(plan)}
      </p>
      <ul className="relative m-0 mt-8 grid list-none gap-3 p-0">
        {INCLUDED.map((item) => (
          <li className="text-copy flex items-start gap-3" key={item}>
            <Icon className="mt-1 shrink-0" name="check" size={16} />
            {item}
          </li>
        ))}
      </ul>
      <ButtonLink
        className="bg-paper text-emit-blue hover:bg-paper/90 relative mt-10 w-full"
        href={signUp}
        size="lg"
      >
        {plan.trialDays
          ? `Start ${plan.trialDays}-day free trial`
          : "Get lifetime access"}
      </ButtonLink>
    </div>
  );
};

const SelfHostCard = () => (
  <div
    className="border-border bg-surface text-foreground flex flex-col rounded-3xl border p-8 sm:p-10"
    data-plan="self-host"
  >
    <p className="m-0 text-[28px] leading-none tracking-[-0.02em]">Self-host</p>
    <p className="m-0 mt-8 flex items-baseline gap-2">
      <span className="text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
        $0
      </span>
      <span className="text-lead text-muted">forever</span>
    </p>
    <p className="text-copy text-muted m-0 mt-3">
      Unlimited everything · you run the updates
    </p>
    <ul className="m-0 mt-8 grid list-none gap-3 p-0">
      {[
        "One Cloudflare Worker in your own account",
        "Your events never leave it",
        "Every feature of the hosted version",
        "Source on GitHub (PolyForm Shield)",
      ].map((item) => (
        <li className="text-copy flex items-start gap-3" key={item}>
          <Icon className="text-accent mt-1 shrink-0" name="check" size={16} />
          {item}
        </li>
      ))}
    </ul>
    <div className="mt-auto flex flex-wrap gap-3 pt-10">
      <GitHubLink label="View on GitHub" size="md" />
      <a
        className="text-copy text-foreground inline-flex h-10 items-center gap-1.5 underline-offset-4 hover:underline"
        href={`${DOCS_URL}/self-hosting`}
      >
        Self-hosting guide
        <Icon name="chevron-right" size={14} />
      </a>
    </div>
  </div>
);

/**
 * Hosted (Monthly, Annual or Lifetime, with Solo or Team inside the card and
 * prices that roll) next to self-hosting.
 */
export const Pricing = () => {
  const { signUp } = useAppLinks();
  const [period, setPeriod] = useState<PlanBilling>("lifetime");
  return (
    <section
      aria-labelledby="pricing-title"
      className="pb-24 sm:pb-32"
      id="pricing"
    >
      <Container>
        <SectionIntro
          className="reveal"
          id="pricing-title"
          label="Pricing"
          number="04"
          title="One price. Unlimited events."
        >
          Let us run it for you or your team, monthly, yearly or paid once while
          we launch. Or run it yourself, free.
        </SectionIntro>

        <div className="reveal mt-12">
          <PeriodTabs onChange={setPeriod} period={period} />
        </div>
        <div className="reveal mt-4 grid gap-4 md:grid-cols-2">
          <HostedCard period={period} signUp={signUp} />
          <SelfHostCard />
        </div>
      </Container>
    </section>
  );
};
