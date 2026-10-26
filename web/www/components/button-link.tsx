import { buttonVariants } from "@heroui/react";
import type { ButtonVariants } from "@heroui/react";
import type { AnchorHTMLAttributes } from "react";

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  size?: ButtonVariants["size"];
  variant?: ButtonVariants["variant"];
}

/**
 * A navigation link dressed as a HeroUI Button. Every call to action on the
 * site leaves the page, so it must be a real `<a>` (crawlable, middle-click,
 * works before hydration) rather than a pressable `<button>`.
 */
export const ButtonLink = ({
  children,
  className,
  size,
  variant = "primary",
  ...props
}: ButtonLinkProps) => (
  <a className={buttonVariants({ className, size, variant })} {...props}>
    {children}
  </a>
);
