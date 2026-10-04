/*
 * The ruins among the stems: line art in the stems' own colour and width, filled
 * with the ground so a stem behind is hidden and one in front overlaps.
 * Geometry is built once per layout; a frame only strokes cached paths.
 */
import { RUINS, RUIN_LINE, STALK_WIDTH, STEM_ALPHA } from './hero-field-scene';
import type { HeroPalette, RuinSpec } from './hero-field-scene';

export interface Ruin {
  readonly z: number;
  readonly x: number;
  readonly root: number;
  readonly outline: Path2D;
  readonly detail: Path2D;
  readonly lineWidth: number;
  readonly alpha: number;
}

interface Box {
  readonly boxWidth: number;
  readonly horizon: number;
  readonly projection: number;
  readonly referenceProjection: number;
}

/* Jagged tops are fixed per ruin so a broken edge never flickers between layouts. */
const JAG = [0.05, -0.32, 0.12, -0.18, 0.28, -0.08] as const;

const column = (
  x: number,
  root: number,
  h: number,
  w: number,
  broken: boolean,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  const plinth = w * 0.24;
  outline.rect(x - w * 0.78, root - plinth, w * 1.56, plinth);
  outline.rect(x - w * 0.64, root - plinth * 1.8, w * 1.28, plinth * 0.8);
  const base = root - plinth * 1.8;
  const top = root - h;
  outline.moveTo(x - w * 0.5, base);
  if (broken) {
    JAG.forEach((jag, i) =>
      outline.lineTo(
        x - w * 0.46 + (w * 0.92 * i) / (JAG.length - 1),
        top + w * (0.45 + jag),
      ),
    );
  } else {
    outline.lineTo(x - w * 0.45, top + w * 0.45);
    outline.quadraticCurveTo(
      x - w * 0.5,
      top + w * 0.28,
      x - w * 0.74,
      top + w * 0.22,
    );
    outline.lineTo(x - w * 0.74, top);
    outline.lineTo(x + w * 0.74, top);
    outline.lineTo(x + w * 0.74, top + w * 0.22);
    outline.quadraticCurveTo(
      x + w * 0.5,
      top + w * 0.28,
      x + w * 0.45,
      top + w * 0.45,
    );
    detail.moveTo(x - w * 0.74, top + w * 0.22);
    detail.lineTo(x + w * 0.74, top + w * 0.22);
  }
  outline.lineTo(x + w * 0.5, base);
  outline.closePath();
  const fluteTop = top + w * (broken ? 1 : 0.6);
  for (const f of [-0.24, 0, 0.24]) {
    detail.moveTo(x + f * w, base - w * 0.1);
    detail.lineTo(x + f * w * 0.92, fluteTop);
  }
  return [outline, detail];
};

const arch = (
  x: number,
  root: number,
  h: number,
  w: number,
  broken: boolean,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  const pier = w * 0.2;
  const inner = w / 2 - pier;
  const outer = w / 2;
  const spring = root - h + outer;
  const end = broken ? Math.PI * 1.64 : Math.PI * 2;
  outline.moveTo(x - outer, root);
  outline.lineTo(x - outer, spring);
  outline.arc(x, spring, outer, Math.PI, end);
  if (broken) {
    const back = end - 0.12;
    outline.lineTo(
      x + Math.cos(back) * (inner + pier * 0.4),
      spring + Math.sin(back) * (inner + pier * 0.4) - pier * 0.3,
    );
    outline.lineTo(x + Math.cos(back) * inner, spring + Math.sin(back) * inner);
    outline.arc(x, spring, inner, back, Math.PI, true);
  } else {
    outline.lineTo(x + outer, root);
    outline.lineTo(x + inner, root);
    outline.lineTo(x + inner, spring);
    outline.arc(x, spring, inner, 0, Math.PI, true);
  }
  outline.lineTo(x - inner, root);
  outline.closePath();
  if (broken) {
    const stub = (root - spring) * 0.5;
    outline.moveTo(x + inner, root);
    outline.lineTo(x + inner, root - stub);
    outline.lineTo(x + inner + pier * 0.4, root - stub - pier * 0.5);
    outline.lineTo(x + inner + pier * 0.75, root - stub + pier * 0.1);
    outline.lineTo(x + outer, root - stub * 0.8);
    outline.lineTo(x + outer, root);
    outline.closePath();
  }
  const stones = 7;
  for (let i = 1; i < stones; i += 1) {
    const a = Math.PI + ((end - Math.PI) * i) / stones;
    detail.moveTo(x + Math.cos(a) * inner, spring + Math.sin(a) * inner);
    detail.lineTo(x + Math.cos(a) * outer, spring + Math.sin(a) * outer);
  }
  for (let y = root - pier * 1.5; y > spring; y -= pier * 1.5) {
    detail.moveTo(x - outer, y);
    detail.lineTo(x - inner, y);
  }
  return [outline, detail];
};

const wall = (
  x: number,
  root: number,
  h: number,
  w: number,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  const steps = [1, 0.84, 1, 0.58, 0.7, 0.38, 0.5] as const;
  const left = x - w / 2;
  const course = h / 3;
  outline.moveTo(left, root);
  steps.forEach((s, i) => {
    outline.lineTo(left + (w * i) / steps.length, root - h * s);
    outline.lineTo(left + (w * (i + 1)) / steps.length, root - h * s);
  });
  outline.lineTo(left + w, root);
  outline.closePath();
  for (let c = 1; c < 3; c += 1) {
    detail.moveTo(left, root - course * c);
    detail.lineTo(left + w * (c === 1 ? 1 : 0.58), root - course * c);
  }
  for (let c = 0; c < 3; c += 1) {
    for (let b = 1; b < 6; b += 1) {
      const bx = left + (w * (b + (c % 2) * 0.5)) / 6;
      if (bx > left + w * (c === 2 ? 0.55 : 0.94)) continue;
      detail.moveTo(bx, root - course * c);
      detail.lineTo(bx, root - course * (c + 1));
    }
  }
  return [outline, detail];
};

const stair = (
  x: number,
  root: number,
  h: number,
  w: number,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  const steps = 5;
  const rise = h / steps;
  const run = w / (steps + 1.5);
  let cx = x - w / 2;
  let cy = root;
  outline.moveTo(cx, cy);
  for (let i = 0; i < steps; i += 1) {
    cy -= rise;
    outline.lineTo(cx, cy);
    cx += run;
    outline.lineTo(cx, cy);
    detail.moveTo(cx - run * 0.9, cy + rise * 0.2);
    detail.lineTo(cx - run * 0.15, cy + rise * 0.2);
  }
  outline.lineTo(cx + run * 0.3, cy - rise * 0.4);
  outline.lineTo(cx + run * 0.7, cy + rise * 0.4);
  outline.lineTo(x + w / 2 - run * 0.2, cy + rise * 2);
  outline.lineTo(x + w / 2, root);
  outline.closePath();
  return [outline, detail];
};

const block = (
  x: number,
  root: number,
  h: number,
  w: number,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  outline.moveTo(x - w / 2, root);
  outline.lineTo(x - w / 2, root - h * 0.86);
  outline.lineTo(x - w * 0.36, root - h);
  outline.lineTo(x + w * 0.22, root - h);
  outline.lineTo(x + w * 0.3, root - h * 0.8);
  outline.lineTo(x + w / 2, root - h * 0.76);
  outline.lineTo(x + w / 2, root);
  outline.closePath();
  detail.moveTo(x + w * 0.1, root - h);
  detail.lineTo(x + w * 0.1, root);
  detail.moveTo(x - w * 0.15, root - h * 0.7);
  detail.lineTo(x - w * 0.05, root - h * 0.45);
  detail.lineTo(x - w * 0.12, root - h * 0.2);
  return [outline, detail];
};

const drum = (
  x: number,
  root: number,
  h: number,
  w: number,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  const r = h / 2;
  const face = x + w / 2 - r * 0.45;
  outline.moveTo(face, root - h);
  outline.lineTo(x - w / 2, root - h);
  outline.quadraticCurveTo(x - w / 2 - r * 0.3, root - r, x - w / 2, root);
  outline.lineTo(face, root);
  outline.closePath();
  outline.moveTo(face + r * 0.45, root - r);
  outline.ellipse(face, root - r, r * 0.45, r, 0, 0, Math.PI * 2);
  detail.moveTo(face + r * 0.22, root - r);
  detail.ellipse(face, root - r, r * 0.22, r * 0.5, 0, 0, Math.PI * 2);
  return [outline, detail];
};

/* An original glyph set: strokes on a 3x3 grid, one row per line of text. */
const GLYPHS = [
  [
    [0, 1, 2, 1],
    [1, 0, 1, 2],
  ],
  [[0, 2, 1, 0, 2, 2]],
  [
    [0, 0, 1, 1, 2, 0],
    [1, 1, 1, 2],
  ],
  [
    [0, 0, 0, 2],
    [0, 1, 2, 1],
  ],
  [
    [0.4, 0, 0.4, 2],
    [1.6, 0, 1.6, 2],
    [0.4, 1, 1.6, 1],
  ],
  [
    [0, 0, 2, 2],
    [2, 0, 1.2, 0.8],
  ],
  [[0, 1, 1, 0, 2, 1, 1, 2, 0, 1]],
  [
    [0, 0, 2, 0],
    [1, 0, 1, 2],
  ],
  [[0, 2, 0, 0, 2, 0]],
] as const;

const tablet = (
  x: number,
  root: number,
  h: number,
  w: number,
): [Path2D, Path2D] => {
  const outline = new Path2D();
  const detail = new Path2D();
  const top = root - h;
  const r = w * 0.44;
  const plinth = h * 0.06;
  outline.rect(x - w * 0.68, root - plinth, w * 1.36, plinth);
  outline.rect(x - w * 0.6, root - plinth * 2, w * 1.2, plinth);
  const base = root - plinth * 2;
  outline.moveTo(x - w / 2, base);
  outline.lineTo(x - w / 2, top + r);
  outline.bezierCurveTo(x - w / 2, top + r * 0.3, x - w * 0.28, top, x, top);
  outline.lineTo(x + w * 0.12, top + h * 0.012);
  outline.lineTo(x + w * 0.2, top + h * 0.05);
  outline.lineTo(x + w * 0.27, top + h * 0.035);
  outline.bezierCurveTo(
    x + w * 0.42,
    top + h * 0.08,
    x + w / 2,
    top + r * 0.6,
    x + w / 2,
    top + r,
  );
  outline.lineTo(x + w / 2, base);
  outline.closePath();
  const inset = w * 0.09;
  detail.moveTo(x - w / 2 + inset, base - h * 0.06);
  detail.lineTo(x - w / 2 + inset, top + r + inset * 0.4);
  detail.bezierCurveTo(
    x - w / 2 + inset,
    top + r * 0.45 + inset,
    x - w * 0.25,
    top + inset,
    x,
    top + inset,
  );
  detail.bezierCurveTo(
    x + w * 0.25,
    top + inset,
    x + w / 2 - inset,
    top + r * 0.45 + inset,
    x + w / 2 - inset,
    top + r + inset * 0.4,
  );
  detail.lineTo(x + w / 2 - inset, base - h * 0.06);
  detail.closePath();
  detail.moveTo(x + w * 0.34, top + h * 0.44);
  detail.lineTo(x + w * 0.27, top + h * 0.52);
  detail.lineTo(x + w * 0.35, top + h * 0.6);
  const cols = 4;
  const rows = 5;
  const left = x - w / 2 + inset * 2;
  const right = x + w / 2 - inset * 2;
  const cell = (right - left) / cols;
  const glyph = cell * 0.52;
  const first = top + r * 0.8;
  const pitch = (base - h * 0.1 - first) / rows;
  for (let i = 0; i < cols * rows; i += 1) {
    const gx = left + (i % cols) * cell + (cell - glyph) / 2;
    const gy = first + Math.floor(i / cols) * pitch + (pitch - glyph) / 2;
    const unit = glyph / 2;
    for (const part of GLYPHS[(i * 5 + 3) % GLYPHS.length]!) {
      detail.moveTo(gx + part[0]! * unit, gy + part[1]! * unit);
      for (let k = 2; k < part.length; k += 2)
        detail.lineTo(gx + part[k]! * unit, gy + part[k + 1]! * unit);
    }
  }
  return [outline, detail];
};

const SHAPES = { column, arch, wall, stair, block, drum, tablet } as const;

const build = (spec: RuinSpec, box: Box): Ruin => {
  const unit = box.projection / spec.z;
  const root = box.horizon + unit;
  const x = spec.x * box.boxWidth;
  const height = spec.height * unit;
  const width = spec.width * unit;
  const shape = SHAPES[spec.kind];
  const [outline, detail] =
    spec.kind === 'column' || spec.kind === 'arch'
      ? (shape as typeof column)(x, root, height, width, spec.broken ?? false)
      : (shape as typeof wall)(x, root, height, width);
  const size = unit / box.referenceProjection;
  return {
    z: spec.z,
    x,
    root,
    outline,
    detail,
    lineWidth: (STALK_WIDTH.min + size * STALK_WIDTH.bySize) * RUIN_LINE.width,
    alpha: Math.min(
      RUIN_LINE.maxAlpha,
      STEM_ALPHA.base +
        Math.sqrt(1 / spec.z) * STEM_ALPHA.byScale +
        RUIN_LINE.lift,
    ),
  };
};

/* Narrow frames drop the ruins marked `wide`, so a phone is not a wall of stone. */
export const buildRuins = (box: Box, narrow: boolean): Ruin[] =>
  RUINS.filter((spec) => !(narrow && spec.wide))
    .map((spec) => build(spec, box))
    .sort((a, b) => b.z - a.z);

export const drawRuin = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  ruin: Ruin,
): void => {
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.outline);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = ruin.alpha * RUIN_LINE.detailShare;
  ctx.lineWidth = ruin.lineWidth * RUIN_LINE.detailWidth;
  ctx.stroke(ruin.detail);
  ctx.globalAlpha = ruin.alpha;
  ctx.lineWidth = ruin.lineWidth;
  ctx.stroke(ruin.outline);
  ctx.globalAlpha = 1;
};
