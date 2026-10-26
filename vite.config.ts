import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

/**
 * Dev server port. Worktree tools hand out one per workspace (Paseo's
 * `$PASEO_PORT`, Conductor's `$CONDUCTOR_PORT`, passed on as `PORT`); the
 * Worker routes by host *and* port, so its local URLs follow it.
 */
const port = Number(process.env.PORT || 5173);
/**
 * `EMITKIT_SITE=off pnpm dev` serves no marketing site, like a deployment
 * without `EMITKIT_SITE_HOST`: every other host shows the app.
 */
const withSite = process.env.EMITKIT_SITE !== "off";
const localUrls = {
  API_URL: `http://api.localhost:${port}`,
  APP_URL: `http://app.localhost:${port}`,
  ...(withSite ? { SITE_URL: `http://localhost:${port}` } : {}),
};

/**
 * One build for the whole product. The client environment emits the PWA
 * (`dist/client/app/**`) and the marketing site (`dist/client/www/**`) with
 * shared hashed chunks in `dist/client/assets`; the Worker environment emits
 * `dist/emitkit/index.js`, which routes each hostname to its bundle.
 */
export default defineConfig({
  build: { emptyOutDir: true, outDir: fromRoot("./dist") },
  environments: {
    client: {
      // Crawl every source file, not just the HTML entries: code-split
      // routes are the only importers of some dependencies (recharts, for
      // one), and a dependency found after startup re-bundles the rest,
      // so pages that already loaded get 504s ("Outdated Optimize Dep").
      optimizeDeps: {
        entries: [
          "app/index.html",
          "www/index.html",
          "ui/visits-page.ts",
          "app/**/*.{ts,tsx}",
          "ui/**/*.{ts,tsx}",
          "www/**/*.{ts,tsx}",
        ],
      },
      build: {
        rolldownOptions: {
          input: {
            app: fromRoot("./web/app/index.html"),
            visits: fromRoot("./web/ui/visits-page.ts"),
            www: fromRoot("./web/www/index.html"),
          },
          // The Worker adds the page-view script to site and docs pages
          // (Blume's build included) by name, so it keeps one.
          output: {
            entryFileNames: (chunk) =>
              chunk.name === "visits" ? "www/ek.js" : "assets/[name]-[hash].js",
          },
        },
      },
    },
  },
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      generatedRouteTree: fromRoot("./web/app/route-tree.gen.ts"),
      routesDirectory: fromRoot("./web/app/routes"),
      target: "react",
    }),
    react(),
    tailwindcss(),
    cloudflare({
      config: (worker) => {
        const { SITE_URL: _site, ...vars } = worker.vars ?? {};
        worker.vars = { ...(withSite ? worker.vars : vars), ...localUrls };
      },
      configPath: fromRoot("./wrangler.jsonc"),
      persistState: { path: fromRoot("./.wrangler/state") },
    }),
  ],
  resolve: { tsconfigPaths: true },
  root: fromRoot("./web"),
  // No dev-server CORS: preflights reach the Worker, as in production.
  server: { cors: false, port, strictPort: true },
});
