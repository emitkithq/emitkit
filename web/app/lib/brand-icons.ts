import { ParsewBrands } from "@parsew/sdk/client";

/**
 * Brand icons from Parsew, keyed by domain. The Worker injects the
 * deployment's publishable key (`emitkit:parsew-key`); without one, every
 * lookup returns `null` and callers show their own fallback.
 */
let client: ParsewBrands | null | undefined;

const brands = (): ParsewBrands | null => {
  if (client === undefined) {
    const token = document
      .querySelector<HTMLMetaElement>('meta[name="emitkit:parsew-key"]')
      ?.content.trim();
    client = token ? new ParsewBrands({ token }) : null;
  }
  return client;
};

/** An icon URL at twice `size` for sharp rendering, or `null`. */
export const brandIconUrl = (domain: string, size: number): string | null => {
  const images = brands();
  if (!images) {
    return null;
  }
  try {
    return images.url(domain, {
      fallback: "404",
      format: "webp",
      size: Math.min(2048, size * 2),
    });
  } catch {
    // Not a domain Parsew accepts (no TLD, an IP address, …).
    return null;
  }
};
