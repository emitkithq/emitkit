import { defineConfig } from "blume";

export default defineConfig({
  content: {
    root: "content",
  },
  // Served by the EmitKit Worker at <site>/docs (see content/self-hosting/architecture.md).
  deployment: {
    base: "/docs",
    output: "static",
    site: process.env.DOCS_SITE_URL ?? "https://emitkit.com",
  },
  description:
    "Guides, self-hosting, onboarding help, and customer-facing product updates.",
  i18n: {
    defaultLocale: "en",
    locales: [{ code: "en", dir: "ltr", label: "English" }],
    ui: {
      en: {
        changelog: {
          description:
            "Follow customer-facing releases, improvements, fixes, and documentation updates as they reach Production.",
        },
      },
    },
  },
  // The brand kit's wordmark (never re-set the name in type), then "Docs".
  logo: {
    image: {
      alt: "EmitKit",
      dark: "/wordmark-white.svg",
      light: "/wordmark-midnight.svg",
    },
    text: "Docs",
  },
  navigation: {
    featured: [
      { href: "/changelog", icon: "newspaper", label: "Changelog" },
      {
        href: process.env.DOCS_APP_URL || "https://app.emitkit.com",
        icon: "rocket",
        label: "Open the dashboard",
      },
    ],
    repo: false,
    sidebar: {
      display: "group",
    },
    tabs: [
      { label: "API guides", path: "/api" },
      { label: "TypeScript SDK", path: "/sdk" },
      { label: "Concepts", path: "/concepts" },
      { label: "MCP", path: "/mcp" },
      { label: "Self-hosting", path: "/self-hosting" },
      { href: "/reference", label: "API reference", path: "/reference" },
      { href: "/changelog", label: "Changelog", path: "/changelog" },
    ],
  },
  openapi: {
    codeSamples: ["curl", "js", "python"],
    enabled: true,
    expandSchemas: true,
    route: "/reference",
    spec: "../openapi/openapi.json",
  },
  redirects: [
    { from: "/installation", status: 301, to: "/getting-started" },
    { from: "/docs/installation", status: 301, to: "/getting-started" },
    { from: "/quickstart", status: 301, to: "/getting-started" },
    { from: "/api-reference/introduction", status: 301, to: "/reference" },
    // Paths of the previous Mintlify docs at docs.emitkit.com, which now
    // redirects to <site>/docs/<same path>.
    {
      from: "/api-reference/events/create-event",
      status: 301,
      to: "/reference/events/create-event",
    },
    {
      from: "/api-reference/identity/identify-user",
      status: 301,
      to: "/reference/identity/identify-user",
    },
    {
      from: "/api-reference/meta/get-openapi-specification",
      status: 301,
      to: "/reference",
    },
    { from: "/concepts/webhooks", status: 301, to: "/concepts/overview" },
    // The SDK section's first page became its index.
    { from: "/sdk/typescript", status: 301, to: "/sdk" },
    { from: "/sdk/installation", status: 301, to: "/sdk" },
    // Mintlify-era self-hosting pages; configuration and deployment exist again.
    ...["overview", "prerequisites", "installation", "tinybird"].map(
      (page) => ({
        from: `/self-hosting/${page}`,
        status: 301 as const,
        to: "/self-hosting",
      })
    ),
    {
      from: "/self-hosting/troubleshooting",
      status: 301,
      to: "/self-hosting/recovery",
    },
    { from: "/configuration", status: 301, to: "/api/api-keys" },
    { from: "/docs/configuration", status: 301, to: "/api/api-keys" },
    { from: "/deployment", status: 301, to: "/getting-started" },
    { from: "/docs/deployment", status: 301, to: "/getting-started" },
    { from: "/tinybird", status: 301, to: "/reference/events/create-event" },
    {
      from: "/docs/tinybird",
      status: 301,
      to: "/reference/events/create-event",
    },
    { from: "/troubleshooting", status: 301, to: "/getting-started" },
    { from: "/docs/troubleshooting", status: 301, to: "/getting-started" },
  ],
  seo: {
    // Crawlers only read /robots.txt; the marketing site's lists this sitemap.
    robots: false,
    rss: { enabled: true, types: ["changelog"] },
    sitemap: true,
    structuredData: true,
  },
  // Brand kit: Emit Blue (Signal on dark, where Emit Blue lacks contrast),
  // Geist for text and Geist Mono for code, self-hosted from ./fonts.
  theme: {
    accent: { dark: "#9FBEFF", light: "#0A31F5" },
    fonts: {
      body: {
        name: "Geist",
        variants: [{ src: "./fonts/Geist.woff2", weight: "100..900" }],
      },
      display: {
        name: "Geist",
        variants: [{ src: "./fonts/Geist.woff2", weight: "100..900" }],
      },
      mono: {
        name: "Geist Mono",
        variants: [{ src: "./fonts/GeistMono.woff2", weight: "100..900" }],
      },
    },
    mode: "system",
    radius: "md",
  },
  title: "EmitKit Docs",
});
