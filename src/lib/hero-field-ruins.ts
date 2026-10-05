/*
 * The courtyard's paving and the draw pass for every ruin: authored pieces
 * (hero-field-courtyard.ts) and the paving lines with their grass tufts.
 * Geometry is built once per layout.
 */
import {
  PETAL,
  RUIN_LINE,
  STALK_WIDTH,
  STEM_ALPHA,
  breezeWave,
  random,
} from './hero-field-scene';
import type { HeroPalette } from './hero-field-scene';
import { drawPiece } from './hero-field-courtyard';
import type { Piece } from './hero-field-courtyard';

interface Tuft {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

export interface Ruin {
  /** Authored masonry; without it the ruin is the paving. */
  readonly piece?: Piece;
  readonly z: number;
  readonly feet: ReadonlyArray<readonly [number, number, number, number?]>;
  /** Paving joints on open ground. */
  readonly ground: Path2D;
  readonly tufts: readonly Tuft[];
  readonly lineWidth: number;
  readonly alpha: number;
}

interface Box {
  readonly boxWidth: number;
  readonly horizon: number;
  readonly projection: number;
  readonly referenceProjection: number;
}

/*
 * Paving from depth NEAR to FAR across WIDTH of the frame: broken row lines and
 * staggered joints, now and then a tuft. Painted at ORDER, behind every piece.
 */
const PAVING = {
  x: 0.5,
  near: 1.7,
  far: 3,
  width: 0.6,
  order: 12,
  rows: 5,
  joints: 10,
  seed: 9001,
} as const;

export const paving = (box: Box): Ruin => {
  const rng = random(PAVING.seed);
  const ground = new Path2D();
  const tufts: Tuft[] = [];
  const { near, far, rows } = PAVING;
  const cx = PAVING.x * box.boxWidth;
  const half = (PAVING.width / 2) * box.boxWidth;
  const yAt = (z: number): number => box.horizon + box.projection / z;
  for (let i = 0; i <= rows; i += 1) {
    const z = near * Math.pow(far / near, i / rows);
    const y = yAt(z);
    const span = half * (near / z) * 1.6;
    let x0 = cx - span;
    while (x0 < cx + span) {
      const run = span * (0.15 + rng() * 0.3);
      if (rng() > 0.65) {
        ground.moveTo(x0, y);
        ground.lineTo(Math.min(cx + span, x0 + run), y);
      }
      x0 += run * 1.1;
    }
    if (i < rows) {
      const z2 = near * Math.pow(far / near, (i + 1) / rows);
      const y2 = yAt(z2);
      for (let k = -PAVING.joints; k <= PAVING.joints; k += 1) {
        if (rng() < 0.75) continue;
        const off = (k + (i % 2) * 0.5) / PAVING.joints;
        const x = cx + off * half * (near / z) * 1.6;
        ground.moveTo(x, y);
        ground.lineTo(cx + off * half * (near / z2) * 1.6, y2);
        if (rng() < 0.06)
          tufts.push({
            x,
            y,
            size: (y - y2) * 1.2,
            phase: rng() * Math.PI * 2,
          });
      }
    }
  }
  const unit = box.projection / far;
  return {
    z: PAVING.order,
    feet: [[cx, far, (PAVING.width * unit) / 2]],
    ground,
    tufts,
    lineWidth:
      STALK_WIDTH.min + (unit / box.referenceProjection) * STALK_WIDTH.bySize,
    alpha: Math.min(
      RUIN_LINE.maxAlpha,
      STEM_ALPHA.base +
        Math.sqrt(1 / (near * 1.6)) * STEM_ALPHA.byScale +
        RUIN_LINE.lift,
    ),
  };
};

/* Five petals round a centre in the ground colour; `open` 0 to 1 scales them up from closed. */
const BLUSH_ALPHA = 0.45;
/* Petal rim width, CSS pixels. */
const PETAL_RIM = 0.7;

export const drawPetals = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  x: number,
  y: number,
  bud: number,
  open: number,
  blush: boolean,
): void => {
  const grow = PETAL.closed + (1 - PETAL.closed) * open;
  const spread = PETAL.spread * bud * grow;
  const radius = Math.max(0.8, PETAL.radius * bud * grow);
  const saved = ctx.globalAlpha;
  /* Full strength whatever the stem's alpha: only near stems flower, so none float. */
  ctx.globalAlpha = Math.max(saved, PETAL.alpha);
  ctx.beginPath();
  for (let k = 0; k < PETAL.count; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / PETAL.count;
    ctx.moveTo(x + Math.cos(a) * spread + radius, y + Math.sin(a) * spread);
    ctx.arc(
      x + Math.cos(a) * spread,
      y + Math.sin(a) * spread,
      radius,
      0,
      Math.PI * 2,
    );
  }
  /* An ink rim under the fill: only its outer edge shows, so the flower reads at 3:1 on either ground. */
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = PETAL_RIM * 2;
  ctx.stroke();
  ctx.fillStyle = palette.flower;
  ctx.fill();
  ctx.fillStyle = palette.background;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, radius * 0.6), 0, Math.PI * 2);
  ctx.fill();
  if (blush) {
    ctx.globalAlpha *= BLUSH_ALPHA;
    ctx.fillStyle = palette.blush;
    ctx.fill();
  }
  ctx.globalAlpha = saved;
};

const drawTuft = (
  ctx: CanvasRenderingContext2D,
  tuft: Tuft,
  lineWidth: number,
  seconds: number,
): void => {
  const sway = Math.sin(breezeWave(tuft.x, tuft.phase, seconds)) * 0.18;
  ctx.lineWidth = lineWidth * 0.55;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i - 2) * 0.32 + sway * (0.6 + i * 0.1);
    const len = tuft.size * (0.55 + ((i * 37) % 5) * 0.1);
    ctx.moveTo(tuft.x + (i - 2) * lineWidth * 0.6, tuft.y);
    ctx.quadraticCurveTo(
      tuft.x + Math.cos(a) * len * 0.3,
      tuft.y + Math.sin(a) * len * 0.6,
      tuft.x + Math.cos(a) * len,
      tuft.y + Math.sin(a) * len,
    );
  }
  ctx.stroke();
};

export const drawRuin = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  ruin: Ruin,
  seconds: number,
): void => {
  const { alpha, lineWidth } = ruin;
  if (ruin.piece) {
    drawPiece(ctx, palette, ruin.piece, lineWidth);
    return;
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = alpha * RUIN_LINE.carveAlpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.carve;
  ctx.stroke(ruin.ground);
  ctx.globalAlpha = alpha * 0.9;
  for (const tuft of ruin.tufts) drawTuft(ctx, tuft, lineWidth, seconds);
  ctx.globalAlpha = 1;
};

export const pieceRuin = (piece: Piece, box: Box): Ruin => {
  const size =
    box.projection / (piece.lineDepth ?? piece.z) / box.referenceProjection;
  return {
    piece,
    z: piece.z,
    feet: piece.feet,
    ground: new Path2D(),
    tufts: [],
    lineWidth: STALK_WIDTH.min + size * STALK_WIDTH.bySize,
    alpha: 0.85,
  };
};
