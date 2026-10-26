import { cn } from "@ui/cn";

/** The brand kit's photography, encoded at two widths (`web/public/www/images`). */
export type PhotoName = "cloud" | "halo" | "island" | "peak";

const srcSet = (name: PhotoName, format: "avif" | "webp") =>
  `/images/${name}-1200.${format} 1200w, /images/${name}-2400.${format} 2400w`;

/**
 * A full-bleed brand photograph. Decorative by default (`alt=""`): the
 * photos set a mood and carry no information. Only the hero's is `priority`;
 * the rest load lazily as they near the viewport.
 */
export const Photo = ({
  alt = "",
  className,
  name,
  priority = false,
  sizes,
}: Readonly<{
  alt?: string;
  className?: string;
  name: PhotoName;
  priority?: boolean;
  sizes: string;
}>) => (
  <picture>
    <source sizes={sizes} srcSet={srcSet(name, "avif")} type="image/avif" />
    <source sizes={sizes} srcSet={srcSet(name, "webp")} type="image/webp" />
    <img
      alt={alt}
      className={cn("size-full object-cover", className)}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      height={1345}
      loading={priority ? "eager" : "lazy"}
      src={`/images/${name}-1200.webp`}
      width={2400}
    />
  </picture>
);
