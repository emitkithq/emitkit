import { authClient } from "@app/lib/auth-client";
import { errorMessage } from "@app/lib/errors";
import { orpc, rpc } from "@app/lib/rpc";
import { organizationQueryKeys } from "@better-auth-ui/core/plugins/organization";
import { useSession } from "@better-auth-ui/react";
import { Button, Popover } from "@heroui/react";
import { domainOfEmail } from "@shared/domains";
import { recipesBySegment, SEGMENTS } from "@shared/recipes";
import type { Segment } from "@shared/recipes";
import type { OrganizationBrand } from "@shared/rpc/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wordmark } from "@ui/brand-mark";
import { cn } from "@ui/cn";
import { Icon } from "@ui/icon";
import { PushCard } from "@ui/push-card";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/** The kit's film grain (the site's `.grain`), inlined for the app. */
const GRAIN = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  mixBlendMode: "overlay",
  opacity: 0.22,
} as const;

/** The paywall's brand side: the kit's island photograph, ripple and grain. */
export const PhotoPanel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "relative isolate flex shrink-0 flex-col justify-between overflow-hidden rounded-[22px] p-5 sm:h-auto sm:w-[44%] sm:p-7",
      className
    )}
  >
    <picture className="absolute inset-0 -z-10">
      <source srcSet="/images/island-1200.avif" type="image/avif" />
      <img
        alt=""
        className="absolute inset-0 -z-10 size-full object-cover object-[48%_60%]"
        decoding="async"
        height={672}
        src="/images/island-1200.webp"
        width={1200}
      />
    </picture>
    <div
      aria-hidden="true"
      className="from-midnight/60 to-midnight/70 absolute inset-0 -z-10 bg-gradient-to-b via-transparent"
    />
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 bg-[url(/patterns/ripple-white.svg)] [mask-image:radial-gradient(80%_70%_at_70%_85%,black,transparent)] [background-position:70%_85%] bg-no-repeat opacity-30"
    />
    <div aria-hidden="true" className="absolute inset-0 -z-10" style={GRAIN} />
    {children}
  </div>
);

const TIMES = ["now", "2m ago", "14m ago", "1h ago"] as const;

/**
 * The organization's brand. The first read by an owner or admin looks it up
 * (a second or so, longer for a site Context.dev hasn't seen), so it's
 * asked once per paywall and kept.
 */
const useOrganizationBrand = () => {
  const queryClient = useQueryClient();
  const { data: session } = useSession(authClient);
  const brand = useQuery({
    ...orpc.workspace.brand.queryOptions(),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // A found brand renames the organization and gives it an avatar: show
  // them in the header and the organization switcher.
  const userId = session?.user.id;
  const applied =
    brand.data?.status === "found"
      ? `${brand.data.name}|${brand.data.iconUrl}`
      : null;
  useEffect(() => {
    if (applied && userId) {
      queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.all(userId),
      });
    }
  }, [applied, queryClient, userId]);
  return { brand, email: session?.user.email ?? null };
};

const BrandIcon = ({ url }: { url: string }) => {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <img
      alt=""
      className="size-6 shrink-0 rounded-md bg-white object-contain"
      onError={() => setFailed(true)}
      src={url}
    />
  );
};

/** Correct the guess: look up another website, or pick a kind of business. */
const ChangeBrand = ({
  brand,
  label,
  onPick,
  segment,
}: {
  brand: OrganizationBrand | undefined;
  label: string;
  /** A kind of business picked by hand; null once a looked-up brand decides. */
  onPick: (segment: Segment | null) => void;
  segment: Segment;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [website, setWebsite] = useState("");
  const queryClient = useQueryClient();
  const lookup = useMutation({
    mutationFn: () => rpc.workspace.lookupBrand({ website }),
    onSuccess: (found) => {
      queryClient.setQueryData(orpc.workspace.brand.queryKey(), found);
      onPick(null);
      setWebsite("");
      setIsOpen(false);
    },
  });
  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        className="text-paper/80 text-meta hover:text-paper h-auto min-w-0 gap-1 rounded-md px-1.5 py-0.5 hover:bg-white/15"
        size="sm"
        variant="ghost"
      >
        {label}
        <Icon name="chevron-down" size={12} />
      </Button>
      <Popover.Content placement="bottom start">
        <Popover.Dialog
          aria-label="What do you build?"
          className="border-border bg-overlay shadow-overlay grid w-[300px] gap-3 rounded-xl border p-3"
        >
          {brand?.canLookup ? (
            <form
              className="grid gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (website.trim()) {
                  lookup.mutate();
                }
              }}
            >
              <label
                className="text-muted text-meta font-medium"
                htmlFor="brand-website"
              >
                Your website
              </label>
              <div className="flex gap-2">
                <input
                  autoComplete="url"
                  className="border-field-border bg-field text-label text-foreground placeholder:text-field-placeholder focus:border-accent focus:ring-accent/15 min-w-0 flex-1 rounded-lg border px-3 py-1.5 outline-none focus:ring-2"
                  id="brand-website"
                  inputMode="url"
                  maxLength={255}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="acme.com"
                  value={website}
                />
                <Button
                  isDisabled={!website.trim()}
                  isPending={lookup.isPending}
                  size="sm"
                  type="submit"
                >
                  Look up
                </Button>
              </div>
              {lookup.error ? (
                <p className="text-orb-coral text-meta m-0" role="alert">
                  {errorMessage(
                    lookup.error,
                    "That site couldn't be read. Pick below instead."
                  )}
                </p>
              ) : null}
            </form>
          ) : null}
          <div>
            <p className="text-muted text-meta m-0 mb-1.5 font-medium">
              {brand?.canLookup ? "Or pick what you build" : "What you build"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SEGMENTS.map((option) => (
                <button
                  aria-pressed={option === segment}
                  className={cn(
                    "text-meta rounded-full border px-2.5 py-1",
                    option === segment
                      ? "border-accent bg-accent-soft text-accent-soft-foreground"
                      : "border-border text-foreground hover:bg-default-soft"
                  )}
                  key={option}
                  onClick={() => {
                    onPick(option);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  {recipesBySegment[option].label}
                </button>
              ))}
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
};

/** Who the recipes are for: the brand found, or a question, and a way to change it. */
const BrandLine = ({
  brand,
  found,
  label,
  onPick,
  reading,
  segment,
}: {
  brand: OrganizationBrand | undefined;
  /** The looked-up brand, if any. */
  found: OrganizationBrand | null;
  label: string;
  onPick: (segment: Segment | null) => void;
  /** The domain being looked up right now. */
  reading: string | null;
  segment: Segment;
}) => (
  <div className="flex min-h-7 min-w-0 items-center gap-2">
    {found?.iconUrl ? <BrandIcon url={found.iconUrl} /> : null}
    {found ? (
      <p className="text-paper text-label m-0 truncate font-semibold">
        {found.name ?? found.domain}
      </p>
    ) : null}
    {reading ? (
      <p className="text-paper/80 text-meta m-0">Reading {reading}…</p>
    ) : (
      <ChangeBrand
        brand={brand}
        label={label}
        onPick={onPick}
        segment={segment}
      />
    )}
  </div>
);

/**
 * The paywall's pitch for a new organization: the pushes it would get,
 * picked for its kind of business from its brand (the owner's work domain,
 * or the website they enter), and what it would leave out. Without a brand
 * it shows SaaS, which most EmitKit users build, and asks.
 */
export const RecipePanel = () => {
  const { brand, email } = useOrganizationBrand();
  const [picked, setPicked] = useState<Segment | null>(null);
  const found = brand.data?.status === "found" ? brand.data : null;
  const segment = picked ?? found?.segment ?? brand.data?.segment ?? "saas";
  const recipes = recipesBySegment[segment];
  const guessed = !picked && found !== null;
  const reading = brand.isPending ? domainOfEmail(email) : null;
  let chipLabel = "What do you build?";
  if (guessed) {
    chipLabel = found.industry ?? recipes.label;
  } else if (picked) {
    chipLabel = recipes.label;
  }

  return (
    <PhotoPanel className="gap-5">
      <Wordmark className="h-[26px] w-auto self-start" tone="white" />
      <div className="flex flex-col gap-3.5" data-segment={segment}>
        <BrandLine
          brand={brand.data}
          found={found}
          label={chipLabel}
          onPick={setPicked}
          reading={reading}
          segment={segment}
        />
        <p className="text-paper m-0 text-[20px] leading-[1.15] font-normal tracking-[-0.02em] text-balance sm:text-[22px]">
          The pings {recipes.noun} actually wants.
        </p>
        <ul
          aria-busy={brand.isPending}
          aria-label="Example notifications"
          className={cn(
            "m-0 grid list-none gap-1.5 p-0 transition-opacity duration-300",
            brand.isPending && "opacity-60"
          )}
        >
          {recipes.recipes.map((recipe, index) => (
            <li
              className={cn("min-w-0", index > 1 && "hidden sm:block")}
              data-channel={recipe.channel}
              key={`${segment}-${recipe.title}`}
            >
              <PushCard
                body={recipe.body}
                bodyLines={1}
                compact
                time={TIMES[index]}
                title={`${recipe.icon} ${recipe.title}`}
              />
            </li>
          ))}
        </ul>
        <p className="text-paper/80 text-meta m-0">
          Not a log drain. Left out:{" "}
          {recipes.skip.charAt(0).toLowerCase() + recipes.skip.slice(1)}.
        </p>
      </div>
    </PhotoPanel>
  );
};
