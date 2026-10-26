import { Wordmark } from "@ui/brand-mark";
import { useAppLinks } from "@www/app-origin";
import { ButtonLink } from "@www/components/button-link";
import { Container } from "@www/components/container";
import { GitHubLink } from "@www/components/github-link";
import { DOCS_URL } from "@www/site";
import type { ReactNode } from "react";

const NavLink = ({
  children,
  href,
}: Readonly<{ children: ReactNode; href: string }>) => (
  <a
    className="text-label text-muted hover:text-foreground no-underline"
    href={href}
  >
    {children}
  </a>
);

export const SiteHeader = () => {
  const { dashboard, signIn, signUp } = useAppLinks();
  return (
    <header className="border-separator/80 bg-background/95 sticky top-0 z-30 border-b backdrop-blur-lg">
      <Container className="flex h-16 items-center gap-8">
        <a
          aria-label="EmitKit home"
          className="flex shrink-0 items-center no-underline"
          href="/"
        >
          <Wordmark className="h-7 w-auto" />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          <NavLink href="/#how-it-works">How it works</NavLink>
          <NavLink href="/#developers">For agents</NavLink>
          <NavLink href="/#pricing">Pricing</NavLink>
          <NavLink href="/#faq">FAQ</NavLink>
          <NavLink href={DOCS_URL}>Docs</NavLink>
        </nav>

        {/* One group shows, chosen before the first paint (www/index.html). */}
        <div
          className="ml-auto flex shrink-0 items-center gap-1.5"
          data-session="signed-out"
        >
          <GitHubLink className="mr-1" compact />
          <ButtonLink href={signIn} size="sm" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href={signUp} size="sm">
            Get started
          </ButtonLink>
        </div>
        <div
          className="ml-auto flex shrink-0 items-center gap-1.5"
          data-session="signed-in"
        >
          <GitHubLink compact />
          <ButtonLink href={dashboard} size="sm">
            Dashboard
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
};
