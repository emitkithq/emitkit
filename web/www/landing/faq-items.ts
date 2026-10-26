import {
  CONTACT_EMAIL,
  DOCS_URL,
  EVENT_RETENTION_DAYS,
  EVENTS_ENDPOINT,
  MCP_ENDPOINT,
  SITE_ORIGIN,
} from "@www/site";

export interface FaqItem {
  answer: string;
  id: string;
  question: string;
}

/**
 * Plain-text answers: the same list renders the FAQ accordion and the
 * FAQPage structured data (`web/www/head.ts`), so the two can never disagree.
 */
export const FAQ_ITEMS: FaqItem[] = [
  {
    answer:
      "EmitKit keeps you in the loop with your product. Your app and your AI agents send the moments worth knowing about, such as a new signup, a first payment, a customer's milestone or an error that can't wait, with one HTTP or MCP call. EmitKit shows them in a live feed and pushes the ones you choose to your phone and desktop.",
    id: "what",
    question: "What is EmitKit?",
  },
  {
    answer: `No. Analytics tools such as PostHog and Mixpanel, and logging or tracing tools such as Datadog and Sentry, take every event so you can dig through them later. EmitKit is for the few you want to hear about now. You decide what to send, each channel decides whether it may notify you, and events are kept for ${EVENT_RETENTION_DAYS} days. Keep your analytics and logs for everything else.`,
    id: "not-analytics",
    question: "Is EmitKit an analytics or logging tool?",
  },
  {
    answer: `Yes. Add the MCP server at ${MCP_ENDPOINT} to Claude, Cursor or any other MCP client, with an EmitKit API key as a bearer token. The agent gets createEvent, identifyUser and deleteIdentity tools, so it can tell you when a task is done, when it needs your approval or when it could not help a customer.`,
    id: "agents",
    question: "Can AI agents send events?",
  },
  {
    answer: `Send a POST request to ${EVENTS_ENDPOINT} with your API key in the Authorization header, call the @emitkit/js TypeScript SDK, or let an AI agent send it through the MCP server at ${MCP_ENDPOINT}. A channel is created the first time you name it.`,
    id: "send",
    question: "How do I send an event?",
  },
  {
    answer:
      "Open the EmitKit app, install it on your device and turn on notifications for a project or a single channel. It uses standard web push, so it works in modern desktop browsers and on Android, and on iPhone and iPad once EmitKit is added to the Home Screen.",
    id: "push",
    question: "How do push notifications work?",
  },
  {
    answer:
      'Put an amount and a three-letter currency at the top level of an event\'s metadata, such as { "amount": 49, "currency": "EUR" }. The feed shows the amount on the event and the dashboard adds it up as revenue. A negative amount counts as a refund.',
    id: "revenue",
    question: "Can EmitKit track revenue?",
  },
  {
    answer:
      "No. EmitKit delivers events to its own feed and as push notifications. There is no integration to configure and no shared chat channel to mute.",
    id: "integrations",
    question: "Can EmitKit post to Slack, Discord or webhooks?",
  },
  {
    answer: `Events are kept for ${EVENT_RETENTION_DAYS} days and then deleted automatically. Your account, projects and channels stay until you delete them, which you can do from the app at any time.`,
    id: "retention",
    question: "How long do you keep my events?",
  },
  {
    answer:
      "Nothing if you self-host it on your own Cloudflare account. The hosted version is $9 a month for one person or $39 for a team of five, with a 14-day free trial and unlimited events. There's also a one-time lifetime plan while we launch.",
    id: "cost",
    question: "What does EmitKit cost?",
  },
  {
    answer:
      "EmitKit runs on Cloudflare: Workers for the API and app, D1 for account data and Analytics Engine for events. API keys are stored only as hashes. The privacy policy has the details.",
    id: "data",
    question: "Where is my data stored?",
  },
  {
    answer: `Email ${CONTACT_EMAIL}, or start with the guides at ${SITE_ORIGIN.replace("https://", "")}${DOCS_URL}.`,
    id: "contact",
    question: "How do I get help?",
  },
];
