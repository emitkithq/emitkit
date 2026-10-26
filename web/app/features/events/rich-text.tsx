import { BrandIcon } from "@app/components/brand-icon";
import { domainOfEmail, domainOfUrl } from "@shared/domains";

/** Top-level domains a bare `name.tld` is recognized by; `sh` only with a path (`dub.sh/x`, not `install.sh`). */
const TLDS =
  "ai|app|at|au|be|blog|br|ca|ch|cloud|co|com|de|design|dev|dk|es|eu|fi|fm|fr|gg|ie|in|io|it|jp|link|ly|me|net|news|nl|no|nz|org|page|se|shop|site|so|store|studio|tech|to|tv|uk|us|xyz";
const LABEL = String.raw`[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`;
const PATH = String.raw`[/?#][^\s<>"'\x60]*`;

/**
 * One link-like token: an `http(s)://` URL, an email address, or a bare
 * domain (`stripe.com`, `dub.sh/abc`). Tried in that order at each position,
 * so the domain inside a URL or an email is never matched on its own.
 */
const TOKEN = new RegExp(
  [
    String.raw`(?<url>https?:\/\/[^\s<>"'\x60]+)`,
    String.raw`(?<email>[^\s@<>"'\x60()]+@(?:${LABEL}\.)+[a-z]{2,})`,
    String.raw`(?<![\w@./-])(?<domain>(?:www\.)?(?:${LABEL}\.)+(?:(?:${TLDS})(?![\w-])(?:${PATH})?|sh${PATH}))`,
  ].join("|"),
  "giu"
);
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/u;
const URL_PREFIX = /^https?:\/\//u;
const TRAILING_SLASH = /\/$/u;

type Part =
  | { kind: "text"; text: string }
  | { href: string; kind: "link"; domain: string | null; text: string };

/** Splits `value` into plain text and links; sentence punctuation stays text. */
export const linkParts = (value: string): Part[] => {
  const parts: Part[] = [];
  let last = 0;
  for (const match of value.matchAll(TOKEN)) {
    const { domain, email, url } = match.groups ?? {};
    const raw = url ?? domain ?? email ?? "";
    const text = email ? raw : raw.replace(TRAILING_PUNCTUATION, "");
    if (match.index > last) {
      parts.push({ kind: "text", text: value.slice(last, match.index) });
    }
    parts.push(
      email
        ? {
            domain: domainOfEmail(text),
            href: `mailto:${text}`,
            kind: "link",
            text,
          }
        : {
            domain: domainOfUrl(text),
            href: url ? text : `https://${text}`,
            kind: "link",
            text: text.replace(URL_PREFIX, "").replace(TRAILING_SLASH, ""),
          }
    );
    last = match.index + text.length;
  }
  if (last < value.length) {
    parts.push({ kind: "text", text: value.slice(last) });
  }
  return parts;
};

const InlineIcon = ({ domain }: { domain: string | null }) => (
  <BrandIcon
    className="mr-1 inline size-3.5 rounded-sm align-[-2px]"
    domain={domain}
    fallback={null}
    size={14}
  />
);

/**
 * `value` with every URL, email and bare domain in it shown with its brand
 * icon. With `links` (the default) they become links too; turn it off inside
 * other interactive elements, where an anchor cannot nest.
 *
 * Note: `value` may be untrusted. It is only ever placed as text, and an
 * `href` is only ever `http(s)://…`, `https://` + a bare domain, or `mailto:`.
 */
export const RichText = ({
  links = true,
  value,
}: {
  links?: boolean;
  value: string;
}) =>
  linkParts(value).map((part, index) => {
    // Parts never reorder, so their position is a stable key.
    const key = `${index}:${part.text}`;
    if (part.kind === "text") {
      return <span key={key}>{part.text}</span>;
    }
    if (!links) {
      return (
        <span key={key}>
          <InlineIcon domain={part.domain} />
          {part.text}
        </span>
      );
    }
    const external = !part.href.startsWith("mailto:");
    return (
      <a
        className="text-accent-soft-foreground break-all no-underline hover:underline"
        href={part.href}
        key={key}
        rel={external ? "noreferrer noopener" : undefined}
        target={external ? "_blank" : undefined}
      >
        <InlineIcon domain={part.domain} />
        {part.text}
        {external ? " ↗" : null}
      </a>
    );
  });
