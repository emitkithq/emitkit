/**
 * Generates the brand kit's halftone patterns as static SVGs in
 * `web/public/www/patterns/`, for the marketing site to use as images.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/generate-patterns.ts
 *
 * The generators are the kit's own (`ek-brand.js` in the brand kit):
 *
 * - Ripple: halftone rings spreading from two pings, like notifications
 *   landing. The kit uses it on every solid field: white at 60% on Emit Blue,
 *   white at 45% on Midnight, blue on white.
 * - Ping: one set of rings fading out from a point, used over photography.
 *
 * Both are seeded, so the output is identical on every run. Files are
 * committed; rerun this only to change a pattern. Dots are drawn as
 * zero-length round-capped strokes (`M x y h0`), grouped by size and
 * opacity, which keeps a 1600×900 field near 120 KB (under 30 KB gzipped).
 * Every file is drawn at 1:1 CSS pixels: place it at its natural size
 * (`background-size: auto`) so dots keep the kit's size in any container.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Dot {
  level: number;
  r: number;
  x: number;
  y: number;
}

/** Opacity of the four dot levels, faintest to strongest (kit `LV`). */
const LEVELS = [0.14, 0.3, 0.55, 1] as const;
const EMIT_BLUE = "#0A31F5";
const WHITE = "#FFFFFF";

const round = (n: number) => Math.round(n * 10) / 10;

/** Which of the four levels a dot of strength `v` belongs to. */
const levelOf = (
  v: number,
  [low, mid, high]: readonly [number, number, number]
) => {
  if (v > high) {
    return 3;
  }
  if (v > mid) {
    return 2;
  }
  return v > low ? 1 : 0;
};

/** The kit's xorshift generator, seeded. */
const random = (seed: number) => {
  // oxlint-disable-next-line no-bitwise -- the kit's xorshift, bit for bit.
  let s = (seed * 2_654_435_761) >>> 0 || 1;
  return () => {
    /* oxlint-disable no-bitwise -- the kit's xorshift, bit for bit. */
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    /* oxlint-enable no-bitwise */
    return (s % 100_000) / 100_000;
  };
};

const ripple = (width: number, height: number, seed: number): Dot[] => {
  const rand = random(seed);
  const grid = 13;
  const wavelength = 64;
  const centres = [
    [width * (0.15 + rand() * 0.2), height * (0.3 + rand() * 0.4)],
    [width * (0.62 + rand() * 0.25), height * (0.2 + rand() * 0.6)],
  ] as const;
  const dots: Dot[] = [];
  for (let y = grid / 2; y < height + grid; y += grid) {
    for (let x = grid / 2; x < width + grid; x += grid) {
      let v = 0;
      for (const [cx, cy] of centres) {
        const d = Math.hypot(x - cx, y - cy);
        v = Math.max(
          v,
          (0.5 + 0.5 * Math.cos((2 * Math.PI * d) / wavelength)) *
            Math.exp(-d / 420)
        );
      }
      dots.push({
        level: levelOf(v, [0.2, 0.45, 0.7]),
        r: 0.5 + 3.4 * v,
        x,
        y,
      });
    }
  }
  return dots;
};

const ping = (size: number, reach: number): Dot[] => {
  const grid = 11;
  const wavelength = 44;
  const centre = size / 2;
  const radius = size * reach;
  const dots: Dot[] = [];
  for (let y = grid / 2; y < size; y += grid) {
    for (let x = grid / 2; x < size; x += grid) {
      const d = Math.hypot(x - centre, y - centre);
      if (d > radius) {
        continue;
      }
      const v =
        (0.5 + 0.5 * Math.cos((2 * Math.PI * d) / wavelength)) *
        (1 - d / radius) ** 1.4;
      const r = v * 3.4;
      if (r < 0.45) {
        continue;
      }
      dots.push({ level: levelOf(v, [0.15, 0.35, 0.6]), r, x, y });
    }
  }
  return dots;
};

/** One `<path>` per (size, level): each dot is a round cap on a zero-length line. */
const toSvg = (
  width: number,
  height: number,
  dots: readonly Dot[],
  fill: string
) => {
  const groups = new Map<string, { d: string[]; level: number; r: number }>();
  for (const dot of dots) {
    const r = Math.round(dot.r * 4) / 4;
    const key = `${dot.level}:${r}`;
    const group = groups.get(key) ?? { d: [], level: dot.level, r };
    group.d.push(`M${round(dot.x)} ${round(dot.y)}h0`);
    groups.set(key, group);
  }
  const paths = [...groups.values()]
    .toSorted((a, b) => a.level - b.level || a.r - b.r)
    .map(
      ({ d, level, r }) =>
        `<path d="${d.join("")}" stroke-width="${round(2 * r)}" stroke-opacity="${LEVELS[level]}"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke="${fill}" stroke-linecap="round">${paths}</svg>\n`;
};

const outDir = path.join(
  fileURLToPath(new URL("..", import.meta.url)),
  "web/public/www/patterns"
);
await mkdir(outDir, { recursive: true });

const files: Record<string, string> = {
  "ping-white.svg": toSvg(720, 720, ping(720, 0.5), WHITE),
  "ripple-blue.svg": toSvg(1600, 900, ripple(1600, 900, 11), EMIT_BLUE),
  "ripple-white.svg": toSvg(1600, 900, ripple(1600, 900, 7), WHITE),
};
await Promise.all(
  Object.entries(files).map(async ([name, svg]) => {
    await writeFile(path.join(outDir, name), svg);
    console.log(
      `generate-patterns: ${name} ${(svg.length / 1024).toFixed(0)} KB`
    );
  })
);
