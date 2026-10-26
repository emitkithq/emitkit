/**
 * Domains behind URLs and email addresses. Shared by the dashboard (brand
 * icons) and the server (brand lookups), so both skip the same mailboxes.
 */

/** Mailbox providers: their logo says nothing about who the person is. */
export const MAILBOX_DOMAINS: ReadonlySet<string> = new Set([
  "aol.com",
  "fastmail.com",
  "gmail.com",
  "gmx.com",
  "gmx.de",
  "googlemail.com",
  "hey.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "zoho.com",
]);

/** The domain of a URL (`https://stripe.com/x` → `stripe.com`), or `null`. */
export const domainOfUrl = (
  value: string | null | undefined
): string | null => {
  if (!value) {
    return null;
  }
  try {
    const { hostname } = new URL(
      value.includes("://") ? value : `https://${value}`
    );
    return hostname.replace(/^www\./u, "") || null;
  } catch {
    return null;
  }
};

/** The organization behind an email address, or `null` for mailbox providers. */
export const domainOfEmail = (
  value: string | null | undefined
): string | null => {
  const domain = value?.split("@")[1]?.trim().toLowerCase();
  return domain && !MAILBOX_DOMAINS.has(domain) ? domain : null;
};
