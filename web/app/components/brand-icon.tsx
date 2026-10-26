import { brandIconUrl } from "@app/lib/brand-icons";
import type { ReactNode } from "react";
import { useState } from "react";

/**
 * A brand's icon for `domain` (see `@app/lib/brand-icons`), or `fallback`
 * when there is no domain, no Parsew key, or no icon for it.
 */
export const BrandIcon = ({
  className = "",
  domain,
  fallback,
  size,
}: {
  className?: string;
  domain: string | null;
  fallback: ReactNode;
  size: number;
}) => {
  const src = domain ? brandIconUrl(domain, size) : null;
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return fallback;
  }
  return (
    <img
      alt=""
      className={`shrink-0 object-contain ${className}`}
      decoding="async"
      height={size}
      loading="lazy"
      onError={() => setFailed(src)}
      src={src}
      width={size}
    />
  );
};
