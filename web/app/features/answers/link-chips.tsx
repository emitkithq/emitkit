import { Icon } from "@ui/icon";

/** An event's links as chips that open in a new tab. */
export const LinkChips = ({
  className,
  links,
}: {
  className?: string;
  links: readonly { readonly label: string; readonly url: string }[];
}) =>
  links.length === 0 ? null : (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {links.map((link) => (
        <a
          className="border-border text-foreground text-body hover:bg-default-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1 no-underline"
          href={link.url}
          key={`${link.label} ${link.url}`}
          rel="noreferrer"
          target="_blank"
        >
          {link.label}
          <Icon className="text-muted" name="external" size={12} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
