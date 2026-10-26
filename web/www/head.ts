import { FAQ_ITEMS } from "@www/landing/faq-items";
import { PAGES } from "@www/pages";
import type { PageId } from "@www/pages";
import { CONTACT_EMAIL, GITHUB_URL, SITE_ORIGIN } from "@www/site";

// `v` changes with the artwork so social networks drop their cached card.
const OG_IMAGE = `${SITE_ORIGIN}/og-image.jpg?v=3`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// `<` is escaped so no string inside the data can close the script element.
const jsonLd = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;

const meta = (key: "name" | "property", name: string, content: string) =>
  `<meta ${key}="${name}" content="${escapeHtml(content)}" />`;

const ORGANIZATION = {
  "@id": `${SITE_ORIGIN}/#organization`,
  "@type": "Organization",
  email: CONTACT_EMAIL,
  logo: `${SITE_ORIGIN}/web-app-manifest-512x512.png`,
  name: "EmitKit",
  sameAs: [GITHUB_URL],
  url: `${SITE_ORIGIN}/`,
};

const homeStructuredData = () => ({
  "@context": "https://schema.org",
  "@graph": [
    ORGANIZATION,
    {
      "@id": `${SITE_ORIGIN}/#website`,
      "@type": "WebSite",
      name: "EmitKit",
      publisher: { "@id": ORGANIZATION["@id"] },
      url: `${SITE_ORIGIN}/`,
    },
    {
      "@type": "SoftwareApplication",
      applicationCategory: "DeveloperApplication",
      description: PAGES.home.description,
      image: OG_IMAGE,
      name: "EmitKit",
      offers: {
        "@type": "Offer",
        description:
          "Free to self-host; hosted from $9 a month with a 14-day free trial",
        price: "9",
        priceCurrency: "USD",
      },
      operatingSystem: "Web",
      publisher: { "@id": ORGANIZATION["@id"] },
      url: `${SITE_ORIGIN}/`,
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        acceptedAnswer: { "@type": "Answer", text: item.answer },
        name: item.question,
      })),
    },
  ],
});

/** Every per-page `<head>` tag, as an HTML string for the prerender to inject. */
export const headFor = (page: PageId): string => {
  const { description, path, title } = PAGES[page];
  const url = path === null ? null : `${SITE_ORIGIN}${path}`;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    meta("name", "description", description),
    url === null
      ? meta("name", "robots", "noindex")
      : `<link rel="canonical" href="${url}" />`,
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "EmitKit"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    ...(url === null ? [] : [meta("property", "og:url", url)]),
    meta("property", "og:image", OG_IMAGE),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta(
      "property",
      "og:image:alt",
      "EmitKit: stay in the loop with your product"
    ),
    meta("property", "og:locale", "en_US"),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", OG_IMAGE),
  ];
  if (page === "home") {
    tags.push(jsonLd(homeStructuredData()));
  }
  return tags.join("\n    ");
};
