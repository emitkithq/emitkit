import { Wordmark } from "@ui/brand-mark";
import { Container } from "@www/components/container";
import { Halftone } from "@www/components/halftone";
import {
  API_REFERENCE_URL,
  CONTACT_EMAIL,
  DOCS_URL,
  GITHUB_URL,
  QUICKSTART_URL,
  SDK_DOCS_URL,
} from "@www/site";

const COLUMNS = [
  {
    links: [
      ["How it works", "/#how-it-works"],
      ["Push notifications", "/#push"],
      ["Pricing", "/#pricing"],
      ["FAQ", "/#faq"],
    ],
    title: "Product",
  },
  {
    links: [
      ["Docs", DOCS_URL],
      ["Quickstart", QUICKSTART_URL],
      ["API reference", API_REFERENCE_URL],
      ["TypeScript SDK", SDK_DOCS_URL],
    ],
    title: "Developers",
  },
  {
    links: [
      ["GitHub", GITHUB_URL],
      ["Contact", `mailto:${CONTACT_EMAIL}`],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
    title: "Company",
  },
] as const;

export const SiteFooter = () => (
  <footer className="border-separator relative isolate overflow-hidden border-t">
    <Container className="grid gap-10 pt-14 pb-10 sm:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
      <div className="sm:col-span-3 lg:col-span-1">
        <a
          aria-label="EmitKit home"
          className="inline-flex no-underline"
          href="/"
        >
          <Wordmark className="h-7 w-auto" />
        </a>
        <p className="text-body text-muted m-0 mt-4 max-w-[32ch]">
          Stay in the loop with your product.
        </p>
      </div>
      {COLUMNS.map((column) => (
        <nav aria-label={column.title} key={column.title}>
          <p className="text-meta text-foreground m-0 font-mono">
            {column.title}
          </p>
          <ul className="m-0 mt-4 grid list-none gap-2.5 p-0">
            {column.links.map(([label, href]) => (
              <li key={label}>
                <a
                  className="text-body text-muted hover:text-foreground no-underline"
                  href={href}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </Container>
    <Container className="pb-16">
      {/* The year is rendered at build time; the client may be in a later one. */}
      <p className="text-meta text-muted m-0" suppressHydrationWarning>
        © {new Date().getFullYear()} EmitKit
      </p>
    </Container>
    <Halftone
      className="top-auto h-28 [mask-image:linear-gradient(to_top,black,transparent)] opacity-70"
      pattern="ripple-blue"
      position="35% 45%"
    />
  </footer>
);
