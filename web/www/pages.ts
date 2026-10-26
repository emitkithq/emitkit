export type PageId = "home" | "privacy" | "terms" | "not-found";

export interface PageMeta {
  description: string;
  /** Output file under `dist/client/www`. */
  file: string;
  /** Canonical path; `null` for pages that must not be indexed. */
  path: string | null;
  title: string;
}

export const PAGES: Record<PageId, PageMeta> = {
  home: {
    description:
      "Your app and your AI agents tell you what is worth knowing: signups, first payments, milestones and the errors that can't wait. A live feed and push notifications, not another log.",
    file: "index.html",
    path: "/",
    title: "EmitKit — Stay in the loop with your product",
  },
  "not-found": {
    description:
      "This page does not exist. Head back to EmitKit or read the docs.",
    file: "404/index.html",
    path: null,
    title: "Page not found — EmitKit",
  },
  privacy: {
    description:
      "How EmitKit handles your data: what we store, where it is processed, how long we keep it and how to delete it.",
    file: "privacy/index.html",
    path: "/privacy",
    title: "Privacy Policy — EmitKit",
  },
  terms: {
    description:
      "The terms for using EmitKit, the product event feed with push notifications.",
    file: "terms/index.html",
    path: "/terms",
    title: "Terms of Service — EmitKit",
  },
};

export const PAGE_IDS = Object.keys(PAGES) as PageId[];

export const isPageId = (value: string | undefined): value is PageId =>
  value !== undefined && Object.hasOwn(PAGES, value);

/** Resolves a request path (`/privacy`, `/privacy/`, `/privacy/index.html`) to its page. */
export const pageForPath = (pathname: string): PageId => {
  const path =
    pathname.replace(/\/index\.html$/u, "").replace(/\/+$/u, "") || "/";
  return PAGE_IDS.find((id) => PAGES[id].path === path) ?? "not-found";
};
