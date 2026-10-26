/**
 * Prerenders the marketing site after `vite build`.
 *
 * The client build emits one HTML shell (`dist/client/www/index.html`) with
 * hashed script and stylesheet links. This script renders every page's React
 * tree to a string (through Vite's SSR module loader, so `@www/*` and `@ui/*`
 * aliases and TSX work without a second build) and writes one complete
 * document per page from that shell. The Worker serves `/x` from
 * `/www/x/index.html` and unknown paths from `/www/404/index.html`.
 *
 * Fails loudly: a missing placeholder or an empty page stops the build rather
 * than shipping a blank shell.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { createServer } from "vite";

interface RenderedPage {
  head: string;
  html: string;
}

interface ServerEntry {
  pages: readonly { file: string; id: string }[];
  render: (id: string) => RenderedPage;
}

const HEAD_MARK = "<!--ssr-head-->";
const ROOT_MARK = '<div id="root"><!--ssr-outlet--></div>';
const SHELL_TITLE = /<title>[^<]*<\/title>\s*/u;
const FONT_FILE = /^Geist-[\w-]+\.woff2$/u;
const MIN_PAGE_TEXT = 200;

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = path.join(repoRoot, "web");
const outDir = path.join(repoRoot, "dist/client/www");
const assetsDir = path.join(repoRoot, "dist/client/assets");

const fail = (message: string): never => {
  throw new Error(`prerender-www: ${message}`);
};

const isServerEntry = (value: unknown): value is ServerEntry =>
  typeof value === "object" &&
  value !== null &&
  "render" in value &&
  typeof value.render === "function" &&
  "pages" in value &&
  Array.isArray(value.pages);

const visibleText = (html: string) =>
  html
    .replaceAll(/<script[\s\S]*?<\/script>/gu, "")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();

const shell = await readFile(path.join(outDir, "index.html"), "utf-8");
for (const mark of [HEAD_MARK, ROOT_MARK]) {
  if (!shell.includes(mark)) {
    fail(
      `dist/client/www/index.html is missing ${mark}; run \`vite build\` first.`
    );
  }
}

// Preload the self-hosted font so text does not reflow once it arrives.
const assets = await readdir(assetsDir);
const fontFile = assets.find((file) => FONT_FILE.test(file));
const fontPreload = fontFile
  ? `<link rel="preload" href="/assets/${fontFile}" as="font" type="font/woff2" crossorigin />`
  : "";

const toDocument = (id: string, { head, html }: RenderedPage) => {
  if (visibleText(html).length < MIN_PAGE_TEXT) {
    fail(`page "${id}" rendered almost no text.`);
  }
  // Replacer functions, so `$` sequences in page content stay literal.
  return shell
    .replace(SHELL_TITLE, () => "")
    .replace(HEAD_MARK, () =>
      [head, fontPreload].filter(Boolean).join("\n    ")
    )
    .replace(ROOT_MARK, () => `<div id="root" data-page="${id}">${html}</div>`);
};

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "warn",
  optimizeDeps: { noDiscovery: true },
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  root: webRoot,
  server: { hmr: false, middlewareMode: true, ws: false },
});

try {
  const entry: unknown = await server.ssrLoadModule("/www/entry-server.tsx");
  if (!isServerEntry(entry)) {
    fail("web/www/entry-server.tsx must export `pages` and `render`.");
  }
  const { pages, render } = entry as ServerEntry;
  const documents = pages.map((page) => ({
    document: toDocument(page.id, render(page.id)),
    target: path.join(outDir, page.file),
  }));
  await Promise.all(
    documents.map(async ({ document, target }) => {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, document);
      console.log(
        `prerender-www: ${path.relative(outDir, target)} (${(document.length / 1024).toFixed(1)} kB)`
      );
    })
  );
} finally {
  await server.close();
}
