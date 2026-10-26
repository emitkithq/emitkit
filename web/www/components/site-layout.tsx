import { SiteFooter } from "@www/components/site-footer";
import { SiteHeader } from "@www/components/site-header";
import type { ReactNode } from "react";

export const SiteLayout = ({ children }: Readonly<{ children: ReactNode }>) => (
  <div className="bg-background text-foreground flex min-h-svh flex-col">
    <a
      className="focus:bg-surface focus:text-label focus:shadow-surface sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:px-4 focus:py-2 focus:font-medium"
      href="#main"
    >
      Skip to content
    </a>
    <SiteHeader />
    <main className="flex-1 outline-none" id="main" tabIndex={-1}>
      {children}
    </main>
    <SiteFooter />
  </div>
);
