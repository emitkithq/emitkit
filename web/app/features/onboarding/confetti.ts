const COLORS = ["#6d5dfc", "#22c55e", "#f59e0b", "#ec4899", "#0ea5e9"];
const PIECES = 140;
const DURATION_MS = 2600;
const GRAVITY = 0.32;
const DRAG = 0.985;

const random = (min: number, max: number) => min + Math.random() * (max - min);

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

/**
 * A short burst of confetti over the page, from a full-screen canvas that
 * removes itself. Nothing happens for people who prefer reduced motion.
 */
export const fireConfetti = () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.confetti = "";
  Object.assign(canvas.style, {
    height: "100%",
    inset: "0",
    pointerEvents: "none",
    position: "fixed",
    width: "100%",
    zIndex: "2147483647",
  });
  const scale = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * scale;
  canvas.height = window.innerHeight * scale;
  document.body.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(scale, scale);

  const pieces: Piece[] = Array.from({ length: PIECES }, (_, index) => {
    const fromLeft = index % 2 === 0;
    return {
      angle: random(0, Math.PI * 2),
      color: COLORS[index % COLORS.length] ?? "#6d5dfc",
      size: random(6, 11),
      spin: random(-0.25, 0.25),
      vx: fromLeft ? random(4, 13) : random(-13, -4),
      vy: random(-17, -9),
      x: fromLeft ? 0 : window.innerWidth,
      y: window.innerHeight * 0.7,
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);
    for (const piece of pieces) {
      piece.vx *= DRAG;
      piece.vy = piece.vy * DRAG + GRAVITY;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.angle += piece.spin;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.fillStyle = piece.color;
      context.fillRect(
        -piece.size / 2,
        -piece.size / 4,
        piece.size,
        piece.size / 2
      );
      context.restore();
    }
    if (elapsed < DURATION_MS) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
};
