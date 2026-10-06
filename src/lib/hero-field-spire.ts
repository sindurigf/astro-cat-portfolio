/*
 * Flowering spires: a few stems carry pea-flowers up their top half, opening
 * from the bottom floret to the top, holding, then closing. Floret lengths are
 * floret units.
 */
import type { HeroPalette } from './hero-field-scene';

/* One cycle, seconds: shut, opening, held open, closing, shut again. */
const BLOOM = {
  period: 12.5,
  shut: 1.2,
  open: 3,
  hold: 5,
  close: 2.6,
} as const;

/* Florets up the spike, the share of the stem they span, and the delay up it as a share of the cycle. */
export const SPIRE = { florets: 8, from: 0.5, to: 0.94, climb: 0.25 } as const;

/* Below this, the ink rim falls under 3:1 against the ground (SC 1.4.11). */
export const FLOWER_ALPHA = 0.66;

/* Zero slope and zero curvature at both ends, so nothing starts or stops with a jolt. */
const smoother = (x: number): number =>
  x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10);

/** 0 shut to 1 open; `phase` 0 to 1 staggers each floret. Held fully open when still. */
export const openness = (
  phase: number,
  seconds: number,
  still: boolean,
): number => {
  if (still) return 1;
  const { period, shut, open, hold, close } = BLOOM;
  const t = (((seconds + phase * period) % period) + period) % period;
  return (
    smoother((t - shut) / open) - smoother((t - shut - open - hold) / close)
  );
};

/** Floret `k` from the bottom opens first: the higher it sits, the later its phase. */
export const floretPhase = (spire: number, k: number): number =>
  spire + ((SPIRE.florets - 1 - k) * SPIRE.climb) / SPIRE.florets;

const outline = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  path: Path2D,
  alpha: number,
): void => {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.flower;
  ctx.fill(path);
  ctx.strokeStyle = palette.bud;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
};

/*
 * A pea-flower on its node, facing `side`: a hooded keel pointing out, its
 * banner petal rising behind it as it opens.
 */
export const drawPea = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  [x, y]: readonly [number, number],
  s: number,
  side: number,
  tilt: number,
  open: number,
  alpha: number,
): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(side, 1);
  ctx.rotate(-0.35);
  if (open > 0.05) {
    const tall = s * (0.6 + 1.5 * open);
    const banner = new Path2D();
    banner.moveTo(s * 0.2, 0);
    banner.bezierCurveTo(
      -s * 0.9 * open,
      -tall * 0.4,
      -s * 0.5,
      -tall,
      s * 0.35,
      -tall,
    );
    banner.bezierCurveTo(s * 1.1, -tall, s, -tall * 0.4, s * 0.6, 0);
    banner.closePath();
    outline(ctx, palette, banner, alpha);
  }
  const reach = s * (1 + 1.1 * open);
  const keel = new Path2D();
  keel.moveTo(0, -s * 0.2);
  keel.quadraticCurveTo(reach * 0.6, -s * 0.9, reach, -s * 0.15);
  keel.quadraticCurveTo(reach * 0.55, s * 0.55, 0, s * 0.25);
  keel.closePath();
  outline(ctx, palette, keel, alpha);
  ctx.restore();
};
