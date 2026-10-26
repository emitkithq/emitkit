/** Lowercase, Unicode-aware slug: letters/digits kept, whitespace and `_` become `-`. */
export const slugify = (value: string, fallback: string) => {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replaceAll(/[\s_]+/gu, "-")
    .replaceAll(/[^\p{L}\p{N}-]/gu, "")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
  return slug === "" ? fallback : slug.slice(0, 100);
};
