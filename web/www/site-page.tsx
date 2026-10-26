import { LandingPage } from "@www/landing/landing-page";
import { PrivacyPage } from "@www/legal/privacy-page";
import { TermsPage } from "@www/legal/terms-page";
import { NotFoundPage } from "@www/not-found-page";
import type { PageId } from "@www/pages";

/** The whole document body for one page; shared by prerender and hydration. */
export const SitePage = ({ page }: Readonly<{ page: PageId }>) => {
  switch (page) {
    case "home": {
      return <LandingPage />;
    }
    case "privacy": {
      return <PrivacyPage />;
    }
    case "terms": {
      return <TermsPage />;
    }
    default: {
      return <NotFoundPage />;
    }
  }
};
