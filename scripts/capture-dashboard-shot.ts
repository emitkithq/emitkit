/**
 * Captures four dashboard screenshots of the seeded workspace, one per
 * reason people use EmitKit. The homepage hero used them before it ran the
 * live dashboard demo; they are kept for places a picture has to do:
 *
 * - `loop`: today's live feed across every project.
 * - `wins`: Cal.com's #payments over 7 days, the latest purchase opened.
 * - `pulse`: 30 days of events and revenue across every project.
 * - `errors`: Excalidraw's #errors, the latest failure opened.
 *
 * Each is the seeded EmitKit workspace (`pnpm db:seed:local`) taken at 3×
 * from the running dev server and cropped to the feed column with a narrow
 * margin. The seed places its events relative to the current time, so
 * re-seed right before capturing and the feed reads "just now".
 *
 *   pnpm db:seed:local
 *   pnpm dev
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/capture-dashboard-shot.ts
 *
 * `SHOT_APP_URL` points at another dev server (default
 * http://app.localhost:5173). Runs on macOS (`sips` scales the capture) with
 * `cwebp` and `avifenc` on the PATH (`brew install webp libavif`). Writes
 * `web/public/www/images/dashboard-<shot>-{800,1600}.{avif,webp}`.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";

const APP_URL = process.env.SHOT_APP_URL ?? "http://app.localhost:5173";
const ORG = "emitkit";
// The feed column is 528px, centred; each shot keeps 36px of page either side.
const VIEWPORT = { height: 900, width: 960 } as const;
const CLIP = { height: 760, width: 600 } as const;
const SCALE = 3;
const WIDTHS = [800, 1600] as const;

interface Shot {
  readonly name: string;
  /** Opened inline, so its details show under it. */
  readonly open?: string;
  readonly range: "24H" | "7D" | "30D";
  readonly search?: string;
}

const SHOTS: readonly Shot[] = [
  { name: "loop", range: "24H" },
  {
    name: "wins",
    open: "Team plan purchased",
    range: "7D",
    search: "channelId=channel_seedcalpayments000000000",
  },
  { name: "pulse", range: "30D" },
  {
    name: "errors",
    open: "Export to PNG failed",
    range: "24H",
    search: "channelId=channel_seedexcalidrawerrors0000",
  },
];

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(repoRoot, "web/public/www/images");

const capture = async (page: Page, shot: Shot, png: string) => {
  const query = shot.search ? `?${shot.search}` : "";
  await page.goto(`${APP_URL}/${ORG}${query}`);
  // The live feed keeps a connection open, so wait for content, not idle.
  await page.getByText("Today", { exact: true }).waitFor();
  await page.getByRole("radio", { exact: true, name: shot.range }).click();
  // Charts redraw for the new range.
  await page.waitForTimeout(1500);
  if (shot.open) {
    await page.getByText(shot.open, { exact: true }).first().click();
    await page.getByText("When", { exact: true }).waitFor();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({
    clip: { ...CLIP, x: (VIEWPORT.width - CLIP.width) / 2, y: 0 },
    path: png,
  });
};

const encode = (png: string, name: string, workDir: string) => {
  for (const width of WIDTHS) {
    const base = path.join(outDir, `dashboard-${name}-${width}`);
    const scaled = path.join(workDir, `${name}-${width}.png`);
    execFileSync(
      "sips",
      ["--resampleWidth", String(width), png, "--out", scaled],
      { stdio: "ignore" }
    );
    execFileSync("cwebp", ["-quiet", "-q", "86", scaled, "-o", `${base}.webp`]);
    execFileSync("avifenc", ["-q", "70", "-s", "4", scaled, `${base}.avif`], {
      stdio: "ignore",
    });
  }
};

const browser = await chromium.launch({
  channel: process.env.SHOT_BROWSER_CHANNEL ?? "chrome",
});
const context = await browser.newContext({
  colorScheme: "light",
  deviceScaleFactor: SCALE,
  // Charts draw their final frame at once.
  reducedMotion: "reduce",
  viewport: VIEWPORT,
});
// The install card would sit over the feed.
await context.addInitScript(() => {
  localStorage.setItem("emitkit:install-prompt-dismissed", String(Date.now()));
});

const page = await context.newPage();
await page.goto(`${APP_URL}/auth/sign-in`);
await page.getByRole("button", { name: "Continue in local dev" }).click();
await page.getByText("Today", { exact: true }).waitFor();

const workDir = await mkdtemp(path.join(tmpdir(), "emitkit-shot-"));
await mkdir(outDir, { recursive: true });
for (const shot of SHOTS) {
  const png = path.join(workDir, `${shot.name}.png`);
  // Sequential on purpose: one page, one shot at a time.
  // oxlint-disable-next-line no-await-in-loop
  await capture(page, shot, png);
  encode(png, shot.name, workDir);
  console.log(`capture-dashboard-shot: ${shot.name}`);
}
await browser.close();
await rm(workDir, { force: true, recursive: true });

console.log(
  `capture-dashboard-shot: ${CLIP.width}×${CLIP.height} CSS px at ${SCALE}× → ${path.relative(repoRoot, outDir)}/dashboard-{${SHOTS.map((shot) => shot.name).join(",")}}-{${WIDTHS.join(",")}}.{avif,webp}`
);
