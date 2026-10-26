import { SiteLayout } from "@www/components/site-layout";
import { LEGAL_LAST_UPDATED } from "@www/site";
import type { ReactNode } from "react";

/**
 * Shared frame for the legal pages. Typography for the body is set once on
 * the container, so each page is written as plain semantic HTML.
 */
export const LegalDocument = ({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) => (
  <SiteLayout>
    <article className="mx-auto w-full max-w-[720px] px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <p className="text-accent text-caption tracking-label m-0 font-medium uppercase">
        Legal
      </p>
      <h1 className="text-foreground m-0 mt-3 text-[36px] leading-tight font-normal tracking-tight">
        {title}
      </h1>
      <p className="text-meta text-muted m-0 mt-3">
        Last updated {LEGAL_LAST_UPDATED}
      </p>
      <div className="text-foreground [&_a]:text-accent [&_ul]:marker:text-muted mt-8 text-[15px] leading-7 [&_a]:font-medium [&_a]:no-underline [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:mb-0 [&_h2]:text-[19px] [&_h2]:font-normal [&_h2]:tracking-tight [&_li]:mt-2 [&_p]:mt-3 [&_p]:mb-0 [&_strong]:font-semibold [&_ul]:mt-3 [&_ul]:mb-0 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  </SiteLayout>
);
