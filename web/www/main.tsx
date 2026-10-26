import "@ui/styles.css";
import "@www/site.css";
import { isPageId, pageForPath } from "@www/pages";
import { SitePage } from "@www/site-page";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

const root = document.querySelector<HTMLElement>("#root");
if (root) {
  // Prerendered documents name their page; hydrate exactly that tree so the
  // markup matches. Without it (the dev server), render from the path.
  const prerendered = root.dataset.page;
  if (isPageId(prerendered)) {
    hydrateRoot(
      root,
      <StrictMode>
        <SitePage page={prerendered} />
      </StrictMode>
    );
  } else {
    createRoot(root).render(
      <StrictMode>
        <SitePage page={pageForPath(window.location.pathname)} />
      </StrictMode>
    );
  }
}
