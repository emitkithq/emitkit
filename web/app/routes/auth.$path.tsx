import { authPathSegments } from "@app/lib/auth-ui";
import { usePageTitle } from "@app/lib/page-title";
import { leaveGuestAuthPage } from "@app/lib/session";
import { Auth } from "@better-auth-ui/heroui";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Wordmark } from "@ui/brand-mark";

const PAGE_TITLES: Readonly<Record<string, string>> = {
  "accept-invitation": "Accept your invitation",
  "email-otp": "Sign in with a code",
  "forgot-password": "Reset your password",
  "reset-link-sent": "Check your email",
  "reset-password": "Choose a new password",
  "sign-in": "Sign in",
  "sign-out": "Signing out",
  "sign-up": "Create your account",
  "verify-email": "Verify your email",
};

const AuthPage = () => {
  const { path } = Route.useParams();
  usePageTitle(PAGE_TITLES[path]);
  return (
    <div className="bg-background text-foreground grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex min-h-svh flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8 sm:px-10">
        <a
          aria-label="EmitKit home"
          className="flex items-center self-start no-underline"
          href="/"
        >
          <Wordmark className="h-7 w-auto" tone="auto" />
        </a>
        <h1 className="sr-only">{PAGE_TITLES[path] ?? "EmitKit"}</h1>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Auth path={path} />
          </div>
        </div>
      </main>
      <BrandPanel />
    </div>
  );
};

const PREVIEW_EVENTS = [
  {
    channel: "payments",
    icon: "💰",
    time: "12:04:31",
    title: "New subscription",
    detail: "Pro plan · yearly",
  },
  {
    channel: "signups",
    icon: "🎉",
    time: "12:03:58",
    title: "New user signed up",
    detail: "from the pricing page",
  },
  {
    channel: "deploys",
    icon: "🚀",
    time: "12:01:12",
    title: "Production deploy finished",
    detail: "v3.4.1 · 48s",
  },
] as const;

/** The product, not a stock photo: a slice of a live event feed. */
const BrandPanel = () => (
  <aside
    aria-hidden="true"
    className="bg-eclipse text-snow relative hidden overflow-hidden lg:flex lg:flex-col"
  >
    <div className="bg-orb-violet/25 absolute -top-40 -right-40 size-[520px] rounded-full blur-3xl" />
    <div className="bg-orb-teal/20 absolute -bottom-48 -left-32 size-[460px] rounded-full blur-3xl" />
    <div className="relative flex flex-1 flex-col justify-center px-14">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between px-3 pt-2 pb-3">
          <span className="text-[13px] font-medium text-white/80">
            All channels
          </span>
          <span className="flex items-center gap-2 text-[12px] text-white/60">
            <span className="live-dot" />
            Live
          </span>
        </div>
        {PREVIEW_EVENTS.map((event) => (
          <div
            className="flex gap-3 border-t border-white/10 px-3 py-3"
            key={event.title}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-base">
              {event.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-white">
                {event.title}
              </p>
              <p className="truncate text-[13px] text-white/55">
                {event.detail}
              </p>
              <p className="mt-1 text-[12px] text-white/45 tabular-nums">
                #{event.channel} · {event.time}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="relative px-14 pb-14">
      <p className="max-w-sm text-[28px] leading-tight font-semibold tracking-[-0.03em]">
        Simple insights, delivered instantly.
      </p>
      <p className="mt-3 max-w-sm text-[15px] text-white/65">
        Send events from anywhere in your stack. Get them on every device, the
        moment they happen.
      </p>
    </div>
  </aside>
);

export const Route = createFileRoute("/auth/$path")({
  async beforeLoad({ location, params: { path } }) {
    if (!authPathSegments.has(path)) {
      throw notFound();
    }
    await leaveGuestAuthPage(path, location.href);
  },
  component: AuthPage,
});
