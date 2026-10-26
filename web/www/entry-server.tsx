import { headFor } from "@www/head";
import { PAGE_IDS, PAGES } from "@www/pages";
import type { PageId } from "@www/pages";
import { SitePage } from "@www/site-page";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

/**
 * Prerender entry, loaded by `scripts/prerender-www.ts` through Vite's SSR
 * module loader. Never imported by the browser bundle.
 */
export const pages = PAGE_IDS.map((id) => ({ file: PAGES[id].file, id }));

export const render = (page: PageId) => ({
  head: headFor(page),
  html: renderToString(
    <StrictMode>
      <SitePage page={page} />
    </StrictMode>
  ),
});
