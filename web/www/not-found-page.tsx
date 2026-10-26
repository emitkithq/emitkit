import { ButtonLink } from "@www/components/button-link";
import { SiteLayout } from "@www/components/site-layout";
import { DOCS_URL } from "@www/site";

export const NotFoundPage = () => (
  <SiteLayout>
    <section className="mx-auto flex w-full max-w-[1080px] flex-col items-start px-5 pt-20 pb-28 sm:px-8 sm:pt-28">
      <p className="text-accent text-caption tracking-label m-0 font-medium uppercase">
        404
      </p>
      <h1 className="text-foreground m-0 mt-4 max-w-[20ch] text-[40px] leading-[1.08] font-normal tracking-tight text-balance">
        This page does not exist.
      </h1>
      <p className="text-muted m-0 mt-5 max-w-[46ch] text-[17px] leading-relaxed">
        The link may be broken or the page may have moved. Everything EmitKit
        does starts from the home page.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink href="/" size="lg">
          Back to home
        </ButtonLink>
        <ButtonLink href={DOCS_URL} size="lg" variant="outline">
          Read the docs
        </ButtonLink>
      </div>
    </section>
  </SiteLayout>
);
