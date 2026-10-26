/**
 * Recipes: the handful of events worth a push for a kind of business. The
 * paywall shows the set that fits the organization's brand (looked up from
 * its domain, see `src/server/organizations/brand.ts`) before the trial
 * starts. EmitKit isn't a log drain, so each set is only milestones and
 * moments someone would want on their lock screen. The customers in them are
 * made up, at small companies EmitKit's users know (OpenPanel, Polar, Resend,
 * Cal.com, …), the way the local seed uses real domains.
 */

export const SEGMENTS = [
  "saas",
  "ecommerce",
  "marketplace",
  "fintech",
  "devtools",
  "ai",
  "media",
  "education",
  "agency",
  "other",
] as const;

export type Segment = (typeof SEGMENTS)[number];

export const isSegment = (value: unknown): value is Segment =>
  SEGMENTS.includes(value as Segment);

export interface Recipe {
  readonly channel: string;
  readonly icon: string;
  /** The push as it would arrive, with made-up details. */
  readonly title: string;
  readonly body: string;
}

export interface SegmentRecipes {
  /** Chip label: "SaaS", "E-commerce", … */
  readonly label: string;
  /** "a SaaS", "an online store", … for "Looks like you run …". */
  readonly noun: string;
  readonly recipes: readonly Recipe[];
  /** What this business would leave out: the log-drain stuff. */
  readonly skip: string;
}

export const recipesBySegment: Readonly<Record<Segment, SegmentRecipes>> = {
  agency: {
    label: "Agency",
    noun: "an agency",
    recipes: [
      {
        body: "Cal.com wants a new marketing site, budget $15k",
        channel: "leads",
        icon: "📥",
        title: "New lead",
      },
      {
        body: "Loops signed the Q3 retainer",
        channel: "deals",
        icon: "✍️",
        title: "Proposal signed",
      },
      {
        body: "Invoice #2041 · $8,400 from AutoSend",
        channel: "payments",
        icon: "💸",
        title: "Invoice paid",
      },
      {
        body: "The new tally.so is live",
        channel: "projects",
        icon: "🚀",
        title: "Project launched",
      },
    ],
    skip: "Every form view, every email opened",
  },
  ai: {
    label: "AI app",
    noun: "an AI product",
    recipes: [
      {
        body: "maria@typeframes.com signed up with Google",
        channel: "signups",
        icon: "🎉",
        title: "New signup",
      },
      {
        body: "Interior AI moved to Pro · $49/mo",
        channel: "payments",
        icon: "💸",
        title: "Upgraded to Pro",
      },
      {
        body: "Photo AI has used 90% of this month's credits",
        channel: "usage",
        icon: "⚡",
        title: "Credits running low",
      },
      {
        body: "$49 refunded to Typeframes",
        channel: "payments",
        icon: "↩️",
        title: "Refund issued",
      },
    ],
    skip: "Every prompt, every token, every model call",
  },
  devtools: {
    label: "Dev tools",
    noun: "a developer tool",
    recipes: [
      {
        body: "Resend made its first API call",
        channel: "activation",
        icon: "🔑",
        title: "First API call",
      },
      {
        body: "Dub upgraded to Team · $99/mo",
        channel: "payments",
        icon: "💸",
        title: "New subscription",
      },
      {
        body: "ScreenshotOne hit its rate limit 3 times today",
        channel: "usage",
        icon: "🚦",
        title: "Rate limit reached",
      },
      {
        body: "Bannerbear cancelled after 8 months",
        channel: "churn",
        icon: "👋",
        title: "Subscription cancelled",
      },
    ],
    skip: "Every request, every 200 OK, every debug log",
  },
  ecommerce: {
    label: "E-commerce",
    noun: "an online store",
    recipes: [
      {
        body: "#10423 · 2 items · $86.40",
        channel: "orders",
        icon: "🛒",
        title: "New order",
      },
      {
        body: "#10431 · $1,240 from a returning customer",
        channel: "orders",
        icon: "💰",
        title: "Big order",
      },
      {
        body: "#10388 · Linen shirt, wrong size",
        channel: "refunds",
        icon: "↩️",
        title: "Refund requested",
      },
      {
        body: "Canvas tote: 4 left",
        channel: "inventory",
        icon: "📦",
        title: "Low stock",
      },
    ],
    skip: "Page views, add-to-carts, every abandoned checkout",
  },
  education: {
    label: "Education",
    noun: "a learning platform",
    recipes: [
      {
        body: "Maria joined Design Systems 101 · $199",
        channel: "enrollments",
        icon: "🎓",
        title: "New enrollment",
      },
      {
        body: "The March cohort just filled its last seat",
        channel: "milestones",
        icon: "🏆",
        title: "Cohort sold out",
      },
      {
        body: "Tom finished all 12 lessons",
        channel: "progress",
        icon: "✅",
        title: "Course completed",
      },
      {
        body: "$199 back to a student on day 3",
        channel: "refunds",
        icon: "↩️",
        title: "Refund requested",
      },
    ],
    skip: "Every video play, every quiz answer",
  },
  fintech: {
    label: "Fintech",
    noun: "a fintech",
    recipes: [
      {
        body: "Polar passed KYC",
        channel: "accounts",
        icon: "🪪",
        title: "Account verified",
      },
      {
        body: "$25,000 to a new payee, held for review",
        channel: "risk",
        icon: "🚩",
        title: "Large transfer flagged",
      },
      {
        body: "$1,840 to Baremetrics bounced",
        channel: "payouts",
        icon: "⚠️",
        title: "Payout failed",
      },
      {
        body: "$320 disputed by a ChartMogul customer",
        channel: "disputes",
        icon: "🧾",
        title: "Chargeback received",
      },
    ],
    skip: "Every balance check, every webhook retry",
  },
  marketplace: {
    label: "Marketplace",
    noun: "a marketplace",
    recipes: [
      {
        body: "Ugmonk is ready to list",
        channel: "sellers",
        icon: "🧑‍🎨",
        title: "New seller approved",
      },
      {
        body: "Grovemade sold its first desk shelf · $120",
        channel: "sales",
        icon: "🎉",
        title: "First sale for a seller",
      },
      {
        body: "Order #5512 · item not as described",
        channel: "disputes",
        icon: "⚖️",
        title: "Dispute opened",
      },
      {
        body: "$640 to Ugmonk bounced",
        channel: "payouts",
        icon: "⚠️",
        title: "Payout failed",
      },
    ],
    skip: "Every search, every listing view",
  },
  media: {
    label: "Media",
    noun: "a media business",
    recipes: [
      {
        body: "maria@buttondown.com · $8/mo",
        channel: "subscribers",
        icon: "⭐",
        title: "New paid subscriber",
      },
      {
        body: "Resend wants the June slot",
        channel: "sponsors",
        icon: "🤝",
        title: "Sponsor inquiry",
      },
      {
        body: "Episode 42 passed 10,000 listens",
        channel: "milestones",
        icon: "🏆",
        title: "Milestone reached",
      },
      {
        body: "tom@transistor.fm after 14 months",
        channel: "subscribers",
        icon: "👋",
        title: "Subscriber cancelled",
      },
    ],
    skip: "Every page view, every play",
  },
  other: {
    label: "Something else",
    noun: "a business",
    recipes: [
      {
        body: "maria@senja.io just joined",
        channel: "signups",
        icon: "🎉",
        title: "New signup",
      },
      {
        body: "Typefully paid $49",
        channel: "payments",
        icon: "💸",
        title: "First payment",
      },
      {
        body: "“Love the new export, one thing though…”",
        channel: "feedback",
        icon: "💬",
        title: "Feedback received",
      },
      {
        body: "You just reached 100 customers",
        channel: "milestones",
        icon: "🏆",
        title: "Milestone reached",
      },
    ],
    skip: "Page views, debug logs, every click",
  },
  saas: {
    label: "SaaS",
    noun: "a SaaS",
    recipes: [
      {
        body: "maria@openpanel.dev started a trial",
        channel: "signups",
        icon: "🎉",
        title: "New signup",
      },
      {
        body: "Tally upgraded to Team · $49/mo",
        channel: "payments",
        icon: "💸",
        title: "New subscription",
      },
      {
        body: "$49 refunded to Senja",
        channel: "payments",
        icon: "↩️",
        title: "Refund issued",
      },
      {
        body: "Typefully cancelled after 8 months",
        channel: "churn",
        icon: "👋",
        title: "Subscription cancelled",
      },
    ],
    skip: "Page views, API calls, every log line",
  },
};

/**
 * Context.dev's industry classification (EIC) → segment. Subindustries are
 * checked first; anything unlisted falls back to its industry, then to
 * `other`. Only the labels that change the recipes are listed.
 */
const BY_SUBINDUSTRY: Readonly<Record<string, Segment>> = {
  "Accounting, Tax & Financial Planning Tools": "saas",
  "Advertising, Adtech & Media Buying": "saas",
  "Artificial Intelligence & Machine Learning": "ai",
  "BNPL & Alternative Financing": "fintech",
  "Cloud Infrastructure & DevOps": "devtools",
  "Creator Economy & Influencer Platforms": "media",
  "Creator-Led & Cohort-Based Courses": "education",
  "Cryptocurrency & Digital Assets": "fintech",
  "Data Infrastructure & Analytics": "devtools",
  "Design, Branding & Creative Studios": "agency",
  "Developer Tools & APIs": "devtools",
  "Direct-to-Consumer (DTC) Brands": "ecommerce",
  "E-commerce Enablement & Infrastructure": "saas",
  "eCommerce & Marketplace Platforms": "ecommerce",
  "Education Management Systems (LMS/SIS)": "saas",
  "Events, Experiences & Ticketing Platforms": "marketplace",
  "Fashion Marketplaces & Retail Platforms": "marketplace",
  "Financial Infrastructure & APIs": "fintech",
  "Fintech Infrastructure": "fintech",
  "IT Services & Managed Services": "agency",
  "Legal Tech & Automation": "saas",
  "Logistics Marketplaces": "marketplace",
  "Marketing & Advertising Agencies": "agency",
  "Newsletters & Substack-Style Platforms": "media",
  "Online Marketplaces": "marketplace",
  "Property Management Software": "saas",
  "Real Estate Marketplaces": "marketplace",
  "Rental Platforms": "marketplace",
  "Resale, Vintage & Circular Fashion": "marketplace",
  "Retail Tech & Point-of-Sale Systems": "saas",
  "Software (B2B)": "saas",
  "Software (B2C)": "saas",
  "Subscription & Membership Commerce": "ecommerce",
  "Web3 & Blockchain": "fintech",
};

const BY_INDUSTRY: Readonly<Record<string, Segment>> = {
  "Consumer Packaged Goods (CPG)": "ecommerce",
  Education: "education",
  Entertainment: "media",
  Finance: "fintech",
  "Luxury & Fashion": "ecommerce",
  "News & Media": "media",
  "Professional Services & Agencies": "agency",
  "Retail & E-commerce": "ecommerce",
  Technology: "saas",
};

/** The segment for a list of EIC `{ industry, subindustry }` pairs. */
export const segmentFor = (
  labels: readonly { readonly industry: string; readonly subindustry: string }[]
): Segment => {
  for (const { subindustry } of labels) {
    const segment = BY_SUBINDUSTRY[subindustry];
    if (segment) {
      return segment;
    }
  }
  for (const { industry } of labels) {
    const segment = BY_INDUSTRY[industry];
    if (segment) {
      return segment;
    }
  }
  return "other";
};
