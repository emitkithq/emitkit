/**
 * Copies the docs site (`docs`, a separate Blume/Astro build) into the
 * Worker's static assets after `vite build`, at `dist/client/www/docs`. The
 * Worker serves it at `<site>/docs`; Blume builds with `deployment.base`
 * `/docs`, so every link and asset already carries that prefix.
 *
 * Host-specific files are skipped: the Worker sets the charset of text files
 * itself (`src/worker/assets.ts`), and redirects ship as meta-refresh pages.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "docs/dist");
const target = path.join(root, "dist/client/www/docs");
const SKIPPED = new Set(["_headers", "_redirects", "vercel.json"]);

if (!existsSync(path.join(source, "index.html"))) {
  throw new Error(
    "docs/dist/index.html is missing: run `pnpm --filter @emitkit/docs build` first"
  );
}
rmSync(target, { force: true, recursive: true });
cpSync(source, target, {
  filter: (file) =>
    path.dirname(file) !== source || !SKIPPED.has(path.basename(file)),
  recursive: true,
});
console.log(
  `bundle-docs: ${path.relative(root, source)} → ${path.relative(root, target)}`
);
