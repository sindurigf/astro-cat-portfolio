/*
 * The ruins among the stems, in the stems' stroke language: an outline, finer
 * carving, finer still weathering hatch, grass tufts in the cracks and vines
 * that climb, bud and flower. Filled with the ground, so a stem behind is hidden
 * and one in front overlaps. Geometry is built once per layout.
 */
import {
  BUD_NOD,
  PETAL,
  RUIN_LINE,
  STALK_WIDTH,
  STEM_ALPHA,
  VINE_BUD,
  VINE_GROWTH,
  VINE_LEAF,
  breezeWave,
  random,
} from './hero-field-scene';
import type { HeroPalette, RuinSpec } from './hero-field-scene';
import { drawPiece, drawPlants } from './hero-field-courtyard';
import type { Piece } from './hero-field-courtyard';

type Point = readonly [number, number];

interface Tuft {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

interface Vine {
  readonly points: readonly Point[];
  /** Leaves between buds, and bud size as a share of the default. */
  readonly every?: number;
  readonly size?: number;
  /** Cumulative length at each point. */
  readonly lengths: readonly number[];
}

export interface Ruin {
  /** Authored masonry, drawn instead of the procedural paths. */
  readonly piece?: Piece;
  readonly z: number;
  readonly x: number;
  readonly back: Path2D;
  readonly dark: Path2D;
  readonly light: Path2D;
  readonly moss: Path2D;
  readonly ground: Path2D;
  readonly cast: Path2D;
  readonly feet: ReadonlyArray<readonly [number, number, number]>;
  readonly deep: Path2D;
  readonly shade: Path2D;
  readonly lit: Path2D;
  readonly outline: Path2D;
  readonly carve: Path2D;
  readonly hatch: Path2D;
  readonly shadow: Path2D;
  readonly tufts: readonly Tuft[];
  readonly vines: readonly Vine[];
  readonly lineWidth: number;
  readonly alpha: number;
}

interface Box {
  readonly boxWidth: number;
  readonly horizon: number;
  readonly projection: number;
  readonly referenceProjection: number;
}

interface Parts {
  /* Drawn first: hidden planes (a slab's crown and side) behind the front. */
  back: Path2D;
  /** Filled with the line colour: a dark stone such as the monolith. */
  dark: Path2D;
  /** Filled with the ground at a low alpha: a lit plane on dark stone. */
  light: Path2D;
  /** Fine strokes in the bud colour: moss on stone tops, leaves in a canopy. */
  moss: Path2D;
  /** Lines on open ground, not clipped to any stone: paving joints. */
  ground: Path2D;
  /** Shadow cast on the ground, filled first. */
  cast: Path2D;
  /** Where weeds take root: screen x, depth, half-spread in pixels. */
  feet: Array<readonly [number, number, number]>;
  deep: Path2D;
  shade: Path2D;
  lit: Path2D;
  outline: Path2D;
  carve: Path2D;
  hatch: Path2D;
  shadow: Path2D;
  tufts: Tuft[];
  vines: Point[][];
}

const parts = (): Parts => ({
  back: new Path2D(),
  dark: new Path2D(),
  light: new Path2D(),
  moss: new Path2D(),
  ground: new Path2D(),
  cast: new Path2D(),
  feet: [],
  deep: new Path2D(),
  shade: new Path2D(),
  lit: new Path2D(),
  outline: new Path2D(),
  carve: new Path2D(),
  hatch: new Path2D(),
  shadow: new Path2D(),
  tufts: [],
  vines: [],
});

const tuft = (
  p: Parts,
  x: number,
  y: number,
  size: number,
  rng: () => number,
): void => {
  p.tufts.push({ x, y, size, phase: rng() * Math.PI * 2 });
};

/* A straight edge with small chips knocked out of it. */
const chipped = (
  path: Path2D,
  from: Point,
  to: Point,
  rng: () => number,
  depth: number,
  chips: number,
): void => {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (y1 - y0) / len;
  const ny = -(x1 - x0) / len;
  const marks = Array.from({ length: chips }, () => 0.1 + rng() * 0.8).sort();
  for (const m of marks) {
    const w = 0.03 + rng() * 0.05;
    const d = depth * (0.4 + rng() * 0.6);
    const a = m - w / 2;
    const b = m + w / 2;
    path.lineTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
    path.lineTo(x0 + (x1 - x0) * m + nx * d, y0 + (y1 - y0) * m + ny * d);
    path.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }
  path.lineTo(x1, y1);
};

/* A crack: a fine zig-zag. */
const crack = (
  path: Path2D,
  x: number,
  y: number,
  length: number,
  rng: () => number,
): void => {
  path.moveTo(x, y);
  let cx = x;
  let cy = y;
  for (let i = 0; i < 4; i += 1) {
    cx += (rng() - 0.5) * length * 0.35;
    cy += length / 4;
    path.lineTo(cx, cy);
  }
};

/* Weathering: short parallel strokes in a patch, clipped to the stone when drawn. */
const weather = (
  path: Path2D,
  x: number,
  y: number,
  w: number,
  h: number,
  step: number,
  rng: () => number,
): void => {
  for (let i = 0; i < w / step; i += 1) {
    if (rng() < 0.3) continue;
    const sx = x + i * step + rng() * step * 0.4;
    const sy = y + rng() * h * 0.3;
    const len = h * (0.3 + rng() * 0.7);
    path.moveTo(sx, sy);
    path.lineTo(sx + len * 0.35, sy + len);
  }
};

const shaftEdge = (
  x: number,
  base: number,
  top: number,
  half: number,
  topHalf: number,
  f: number,
): Point => {
  /* Entasis: the shaft swells a little a third of the way up. */
  const y = base + (top - base) * f;
  const swell = Math.sin(f * Math.PI * 0.85) * half * 0.06;
  return [x + (half + (topHalf - half) * f + swell), y];
};

const column = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  broken: boolean,
  rng: () => number,
  vine: boolean,
): void => {
  const half = w / 2;
  const topHalf = half * 0.82;
  const plinth = w * 0.22;
  const torus = w * 0.16;
  const base = root - plinth - torus;
  const top = root - h + (broken ? 0 : w * 0.55);
  const step = Math.max(1.6, w * 0.12);

  p.outline.moveTo(x - half * 1.5, root);
  chipped(
    p.outline,
    [x - half * 1.5, root],
    [x - half * 1.5, root - plinth],
    rng,
    w * 0.05,
    1,
  );
  p.outline.lineTo(x - half * 1.25, root - plinth);
  p.outline.quadraticCurveTo(
    x - half * 1.42,
    root - plinth - torus * 0.5,
    x - half * 1.08,
    base,
  );
  p.outline.lineTo(x - half, base);
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) {
    const [ex, ey] = shaftEdge(0, base, top, half, topHalf, i / steps);
    p.outline.lineTo(x - ex, ey);
  }
  if (broken) {
    const left = x - topHalf;
    const right = x + topHalf;
    const jag = [0.15, -0.35, 0.05, -0.55, -0.2, 0.25] as const;
    jag.forEach((j, i) =>
      p.outline.lineTo(
        left + ((right - left) * (i + 1)) / (jag.length + 1),
        top + w * (0.4 + j + rng() * 0.15),
      ),
    );
    p.outline.lineTo(right, top + w * 0.7);
    tuft(p, x - topHalf * 0.4, top + w * 0.1, w * 0.9, rng);
  } else {
    const abacus = w * 0.2;
    p.outline.lineTo(x - topHalf, top);
    p.outline.quadraticCurveTo(
      x - topHalf * 1.05,
      top - w * 0.25,
      x - half * 1.45,
      top - w * 0.32,
    );
    p.outline.lineTo(x - half * 1.45, top - w * 0.32 - abacus);
    chipped(
      p.outline,
      [x - half * 1.45, top - w * 0.32 - abacus],
      [x + half * 1.45, top - w * 0.32 - abacus],
      rng,
      w * 0.08,
      2,
    );
    p.outline.lineTo(x + half * 1.45, top - w * 0.32);
    p.outline.quadraticCurveTo(
      x + topHalf * 1.05,
      top - w * 0.25,
      x + topHalf,
      top,
    );
    p.carve.moveTo(x - half * 1.45, top - w * 0.32);
    p.carve.lineTo(x + half * 1.45, top - w * 0.32);
    p.carve.moveTo(x - topHalf, top);
    p.carve.lineTo(x + topHalf, top);
    tuft(p, x + half * 0.9, top - w * 0.32 - abacus, w * 0.7, rng);
  }
  for (let i = steps; i >= 1; i -= 1) {
    const [ex, ey] = shaftEdge(0, base, top, half, topHalf, i / steps);
    p.outline.lineTo(x + ex, ey);
  }
  p.outline.lineTo(x + half, base);
  p.outline.lineTo(x + half * 1.08, base);
  p.outline.quadraticCurveTo(
    x + half * 1.42,
    root - plinth - torus * 0.5,
    x + half * 1.25,
    root - plinth,
  );
  p.outline.lineTo(x + half * 1.5, root - plinth);
  p.outline.lineTo(x + half * 1.5, root);
  p.outline.closePath();

  p.carve.moveTo(x - half * 1.25, root - plinth);
  p.carve.lineTo(x + half * 1.25, root - plinth);
  const flutes = 6;
  const fluteTop = broken ? top + w * 0.9 : top;
  for (let k = 1; k < flutes; k += 1) {
    const share = -1 + (2 * k) / flutes;
    p.carve.moveTo(x + share * half * 0.92, base - w * 0.06);
    for (let i = 1; i <= 8; i += 1) {
      const f = i / 8;
      const [ex, ey] = shaftEdge(0, base, fluteTop, half, topHalf, f);
      p.carve.lineTo(x + share * ex * 0.92, ey);
    }
  }
  /* Drums: the shaft is stacked stones. */
  for (let d = 1; d < 4; d += 1) {
    const f = d / 4;
    if (broken && base + (top - base) * f < top + w) continue;
    const [ex, ey] = shaftEdge(0, base, top, half, topHalf, f);
    p.carve.moveTo(x - ex, ey);
    p.carve.lineTo(x + ex, ey + w * 0.02);
  }
  /* The shaft's right side turns from the light. */
  p.shade.moveTo(x + half * 0.3, base);
  p.shade.lineTo(x + half * 1.6, base);
  p.shade.lineTo(x + half * 1.6, top - w * 0.6);
  p.shade.lineTo(x + topHalf * 0.25, top - w * 0.6);
  p.shade.closePath();
  crack(
    p.carve,
    x + half * 0.3,
    base + (top - base) * 0.55,
    (base - top) * 0.22,
    rng,
  );
  weather(p.hatch, x + half * 0.2, top, half * 0.9, base - top, step, rng);
  tuft(p, x - half * 1.3, root - plinth, w * 0.8, rng);

  if (vine) {
    const pts: Point[] = [];
    const turns = 3.2;
    for (let i = 0; i <= 60; i += 1) {
      const f = i / 60;
      const y = root - plinth - (root - plinth - (broken ? top + w : top)) * f;
      pts.push([x + Math.sin(f * turns * Math.PI * 2 + 0.6) * half * 0.95, y]);
    }
    p.vines.push(pts);
  }
};

const colonnade = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  count: number,
  broken: boolean,
  rng: () => number,
): void => {
  const colW = w / (count * 2.6);
  const span = w / (count - 1);
  const tops: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const isBroken = broken && i === count - 1;
    const ch = isBroken ? h * 0.55 : h;
    column(
      p,
      x + i * span - w / 2 + span * 0.0,
      root,
      ch,
      colW * 2,
      isBroken,
      rng,
      false,
    );
    tops.push(root - h - colW * 0.5);
  }
  /* Architrave over the standing columns, broken off at a jagged end. */
  const lastWhole = broken ? count - 2 : count - 1;
  const left = x - w / 2 - colW * 1.4;
  const right =
    x - w / 2 + lastWhole * span + colW * 1.4 + (broken ? span * 0.35 : 0);
  const y = (tops[0] ?? root - h) + colW * 0.15;
  const deep = colW * 1.4;
  p.outline.moveTo(left, y);
  chipped(p.outline, [left, y], [right, y], rng, colW * 0.25, 3);
  if (broken) {
    p.outline.lineTo(right - colW * 0.6, y + deep * 0.5);
    p.outline.lineTo(right - colW * 0.2, y + deep);
  } else {
    p.outline.lineTo(right, y + deep);
  }
  p.outline.lineTo(left, y + deep);
  p.outline.closePath();
  p.carve.moveTo(left, y + deep * 0.45);
  p.carve.lineTo(right - colW * 0.5, y + deep * 0.45);
  tuft(p, left + (right - left) * 0.3, y, colW * 2, rng);
};

const arch = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  broken: boolean,
  rng: () => number,
  vine: boolean,
): void => {
  const pier = w * 0.2;
  const inner = w / 2 - pier;
  const outer = w / 2;
  const spring = root - h + outer;
  const end = broken ? Math.PI * 1.66 : Math.PI * 2;
  p.outline.moveTo(x - outer, root);
  chipped(
    p.outline,
    [x - outer, root],
    [x - outer, spring],
    rng,
    pier * 0.12,
    2,
  );
  p.outline.arc(x, spring, outer, Math.PI, end);
  const back = end - 0.1;
  if (broken) {
    p.outline.lineTo(
      x + Math.cos(back) * (inner + pier * 0.45),
      spring + Math.sin(back) * (inner + pier * 0.45) - pier * 0.35,
    );
    p.outline.lineTo(
      x + Math.cos(back) * inner,
      spring + Math.sin(back) * inner,
    );
    p.outline.arc(x, spring, inner, back, Math.PI, true);
  } else {
    p.outline.lineTo(x + outer, root);
    p.outline.lineTo(x + inner, root);
    p.outline.lineTo(x + inner, spring);
    p.outline.arc(x, spring, inner, 0, Math.PI, true);
  }
  p.outline.lineTo(x - inner, root);
  p.outline.closePath();
  if (broken) {
    const stub = (root - spring) * 0.55;
    p.outline.moveTo(x + inner, root);
    p.outline.lineTo(x + inner, root - stub);
    p.outline.lineTo(x + inner + pier * 0.35, root - stub - pier * 0.55);
    p.outline.lineTo(x + inner + pier * 0.7, root - stub + pier * 0.15);
    p.outline.lineTo(x + outer, root - stub * 0.82);
    p.outline.lineTo(x + outer, root);
    p.outline.closePath();
    for (
      let y = root - pier * 0.9, row = 0;
      y > root - stub;
      y -= pier * 0.9, row += 1
    ) {
      p.carve.moveTo(x + inner, y);
      p.carve.lineTo(x + outer, y);
      p.carve.moveTo(x + inner + pier * (row % 2 ? 0.35 : 0.6), y);
      p.carve.lineTo(x + inner + pier * (row % 2 ? 0.35 : 0.6), y + pier * 0.9);
    }
    weather(
      p.hatch,
      x + inner,
      root - stub,
      pier,
      stub,
      Math.max(1.6, pier * 0.18),
      rng,
    );
    tuft(p, x + inner + pier * 0.4, root - stub - pier * 0.4, pier * 1.4, rng);
  }
  /* Voussoirs, a keystone, and one stone slipped out of course. */
  const stones = 11;
  for (let i = 1; i < stones; i += 1) {
    const a = Math.PI + ((end - Math.PI) * i) / stones;
    if (a > back) break;
    const slip = i === 3 ? pier * 0.12 : 0;
    p.carve.moveTo(
      x + Math.cos(a) * inner,
      spring + Math.sin(a) * inner + slip,
    );
    p.carve.lineTo(
      x + Math.cos(a) * outer,
      spring + Math.sin(a) * outer + slip,
    );
  }
  if (!broken) {
    p.carve.moveTo(x - pier * 0.35, spring - outer);
    p.carve.lineTo(x - pier * 0.25, spring - inner + pier * 0.15);
    p.carve.lineTo(x + pier * 0.25, spring - inner + pier * 0.15);
    p.carve.lineTo(x + pier * 0.35, spring - outer);
  }
  const course = pier * 0.9;
  for (let y = root - course, row = 0; y > spring; y -= course, row += 1) {
    p.carve.moveTo(x - outer, y);
    p.carve.lineTo(x - inner, y);
    p.carve.moveTo(x - outer + pier * (row % 2 ? 0.4 : 0.65), y);
    p.carve.lineTo(x - outer + pier * (row % 2 ? 0.4 : 0.65), y + course);
  }
  p.shade.moveTo(x - inner, root);
  p.shade.lineTo(x - inner, spring);
  p.shade.arc(x, spring, inner, Math.PI, back);
  p.shade.arc(x, spring, inner + pier * 0.3, back, Math.PI, true);
  p.shade.lineTo(x - inner - pier * 0.3, root);
  p.shade.closePath();
  crack(
    p.carve,
    x - outer + pier * 0.5,
    spring - pier * 0.2,
    (root - spring) * 0.3,
    rng,
  );
  weather(
    p.hatch,
    x - outer,
    spring,
    pier,
    root - spring,
    Math.max(1.6, pier * 0.18),
    rng,
  );
  tuft(p, x - outer + pier * 0.3, spring - outer * 0.15, pier * 1.3, rng);
  tuft(p, x - outer, root, pier * 1.6, rng);
  if (vine) {
    const pts: Point[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const f = i / 40;
      const y = root - (root - spring) * f;
      pts.push([
        x - outer + pier * (0.5 + Math.sin(f * Math.PI * 5) * 0.35),
        y,
      ]);
    }
    for (let i = 1; i <= 24; i += 1) {
      const a = Math.PI + ((back - Math.PI) * 0.8 * i) / 24;
      const r = (inner + outer) / 2 + Math.sin(i * 0.9) * pier * 0.25;
      pts.push([x + Math.cos(a) * r, spring + Math.sin(a) * r]);
    }
    p.vines.push(pts);
  }
};

const wall = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const left = x - w / 2;
  const rows = 4;
  const course = h / rows;
  const profile = [1, 0.9, 1, 0.66, 0.74, 0.42, 0.55, 0.3] as const;
  p.outline.moveTo(left, root);
  profile.forEach((s, i) => {
    const xa = left + (w * i) / profile.length;
    const xb = left + (w * (i + 1)) / profile.length;
    const y = root - Math.round((h * s) / course) * course;
    p.outline.lineTo(xa, y);
    chipped(p.outline, [xa, y], [xb, y], rng, course * 0.18, 1);
  });
  p.outline.lineTo(left + w, root);
  p.outline.closePath();
  for (let r = 0; r < rows; r += 1) {
    const y = root - course * r;
    let bx = left + (r % 2 ? w * 0.06 : 0);
    while (bx < left + w) {
      const bw = w * (0.08 + rng() * 0.08);
      const reach =
        profile[
          Math.min(
            profile.length - 1,
            Math.floor(((bx - left) / w) * profile.length),
          )
        ]!;
      if (course * (r + 1) <= h * reach + 0.5) {
        const out = rng() < 0.12 ? course * 0.12 : 0;
        p.carve.moveTo(bx + out, y);
        p.carve.lineTo(bx + out, y - course);
        p.carve.lineTo(Math.min(left + w, bx + bw) + out, y - course);
        if (rng() < 0.18)
          crack(p.hatch, bx + bw * 0.5, y - course, course * 0.9, rng);
        if (rng() < 0.15) tuft(p, bx, y - course, course * 1.3, rng);
      }
      bx += bw;
    }
  }
};

const block = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  p.outline.moveTo(x - w / 2, root);
  p.outline.lineTo(x - w / 2, root - h * 0.84);
  p.outline.lineTo(x - w * 0.38, root - h);
  chipped(
    p.outline,
    [x - w * 0.38, root - h],
    [x + w * 0.22, root - h],
    rng,
    h * 0.12,
    2,
  );
  p.outline.lineTo(x + w * 0.3, root - h * 0.8);
  p.outline.lineTo(x + w / 2, root - h * 0.74);
  p.outline.lineTo(x + w / 2, root);
  p.outline.closePath();
  p.carve.moveTo(x + w * 0.12, root - h * 0.98);
  p.carve.lineTo(x + w * 0.12, root);
  p.carve.moveTo(x - w * 0.38, root - h);
  p.carve.lineTo(x - w * 0.3, root - h * 0.86);
  p.carve.lineTo(x + w * 0.12, root - h * 0.86);
  crack(p.carve, x - w * 0.1, root - h * 0.8, h * 0.7, rng);
  weather(
    p.hatch,
    x + w * 0.14,
    root - h * 0.8,
    w * 0.36,
    h * 0.8,
    Math.max(1.6, w * 0.05),
    rng,
  );
  tuft(p, x - w * 0.45, root, h * 0.9, rng);
  tuft(p, x - w * 0.1, root - h, h * 0.6, rng);
};

/* An original glyph set: strokes on a 3x3 grid. */
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

/* Moss along a top edge: `amount` 0 bare, 1 light caps, 2 heavy growth spilling down. */
const mossCap = (
  p: Parts,
  x0: number,
  x1: number,
  y: number,
  size: number,
  rng: () => number,
  amount = 1,
): void => {
  if (amount <= 0) return;
  const step = Math.max(1.2, size * (amount > 1 ? 0.1 : 0.22));
  for (let x = x0; x < x1; x += step * (0.6 + rng() * 0.8)) {
    if (amount < 2 && rng() < 0.35) continue;
    const up = size * (0.12 + rng() * (amount > 1 ? 0.5 : 0.3));
    const lean = (rng() - 0.5) * size * 0.3;
    p.moss.moveTo(x, y + size * 0.05);
    p.moss.quadraticCurveTo(x + lean * 0.3, y - up * 0.6, x + lean, y - up);
    if (rng() < (amount > 1 ? 0.6 : 0.2)) {
      const drop = size * (amount > 1 ? 0.6 + rng() * 2.2 : 0.3 + rng() * 0.6);
      p.moss.moveTo(x, y);
      p.moss.quadraticCurveTo(
        x + size * 0.1,
        y + drop * 0.5,
        x + (rng() - 0.5) * size * 0.25,
        y + drop,
      );
    }
  }
};

/* A vine hanging from a lip, grown downward by the loop. */
const hang = (
  p: Parts,
  x: number,
  y: number,
  length: number,
  rng: () => number,
): void => {
  const pts: Point[] = [];
  const sway = length * 0.08;
  for (let i = 0; i <= 18; i += 1) {
    const f = i / 18;
    pts.push([x + Math.sin(f * Math.PI * 2.5 + rng()) * sway, y + length * f]);
  }
  p.vines.push(pts);
};

/* A stone block with a chipped top, moss on it, optional window opening. */
const stone = (
  p: Parts,
  x: number,
  bottom: number,
  w: number,
  h: number,
  tilt: number,
  rng: () => number,
  window: boolean,
): void => {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const at = (dx: number, dy: number): Point => [
    x + dx * c - dy * s,
    bottom + dx * s + dy * c,
  ];
  const corners: Point[] = [
    at(-w / 2, 0),
    at(-w / 2, -h),
    at(w / 2, -h),
    at(w / 2, 0),
  ];
  p.outline.moveTo(...corners[0]!);
  p.outline.lineTo(...corners[1]!);
  chipped(p.outline, corners[1]!, corners[2]!, rng, h * 0.12, 2);
  p.outline.lineTo(...corners[3]!);
  p.outline.closePath();
  /* Carved bands and a chamfer line under the top. */
  const band = at(-w / 2, -h * 0.82);
  const bandEnd = at(w / 2, -h * 0.82);
  p.carve.moveTo(...band);
  p.carve.lineTo(...bandEnd);
  if (window && w > h * 0.6) {
    const ww = w * 0.22;
    const wh = h * 0.42;
    const wx = (rng() - 0.5) * w * 0.3;
    const win = [
      at(wx - ww / 2, -h * 0.18),
      at(wx - ww / 2, -h * 0.18 - wh),
      at(wx + ww / 2, -h * 0.18 - wh),
      at(wx + ww / 2, -h * 0.18),
    ];
    p.dark.moveTo(...win[0]!);
    win.slice(1).forEach((pt) => p.dark.lineTo(...pt));
    p.dark.closePath();
    p.carve.moveTo(...win[0]!);
    win.slice(1).forEach((pt) => p.carve.lineTo(...pt));
    p.carve.closePath();
  } else {
    for (let k = 1; k < 3; k += 1) {
      const a = at(-w / 2 + (w * k) / 3, -h * 0.15);
      const b = at(-w / 2 + (w * k) / 3, -h * 0.65);
      p.carve.moveTo(...a);
      p.carve.lineTo(...b);
    }
  }
  const shadeA = at(w * 0.2, 0);
  p.shade.moveTo(...shadeA);
  [at(w * 0.2, -h), at(w / 2, -h), at(w / 2, 0)].forEach((pt) =>
    p.shade.lineTo(...pt),
  );
  p.shade.closePath();
  weather(p.hatch, x - w / 2, bottom - h, w, h, Math.max(1.6, h * 0.12), rng);
  if (rng() < 0.5)
    crack(p.carve, x + (rng() - 0.5) * w * 0.5, bottom - h * 0.9, h * 0.6, rng);
  const [tx, ty] = at(-w / 2, -h);
  mossCap(p, tx, tx + w * c, ty + (w * s) / 2, Math.max(3, h * 0.35), rng);
};

/* Stacked carved blocks, narrowing and leaning as they rise, a vine hanging off one lip. */
const tower = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  broken: boolean,
): void => {
  const count = 3 + Math.floor(rng() * 2);
  let y = root;
  let cx = x;
  for (let i = 0; i < count; i += 1) {
    const bh = (h / count) * (0.85 + rng() * 0.3);
    const bw = w * (1 - i * 0.12) * (0.9 + rng() * 0.15);
    const tilt = (rng() - 0.5) * (broken ? 0.12 : 0.05);
    stone(p, cx, y, bw, bh, tilt, rng, i < count - 1 || !broken);
    if (i === 1) hang(p, cx + bw * 0.4, y - bh, h * 0.45, rng);
    y -= bh * Math.cos(tilt);
    cx += (rng() - 0.5) * w * 0.12;
  }
  tuft(p, x - w * 0.55, root, w * 0.5, rng);
  tuft(p, x + w * 0.5, root, w * 0.4, rng);
};

/* A stepped structure: terraces narrowing upward, a stair up the middle, moss on every step. */
const stepped = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const levels = 4;
  const lh = h / levels;
  for (let i = 0; i < levels; i += 1) {
    const lw = w * (1 - i * 0.2);
    const bottom = root - lh * i;
    p.outline.moveTo(x - lw / 2, bottom);
    p.outline.lineTo(x - lw / 2, bottom - lh);
    chipped(
      p.outline,
      [x - lw / 2, bottom - lh],
      [x + lw / 2, bottom - lh],
      rng,
      lh * 0.15,
      2,
    );
    p.outline.lineTo(x + lw / 2, bottom);
    p.outline.closePath();
    for (let k = 1; k < 3; k += 1) {
      p.carve.moveTo(x - lw / 2, bottom - (lh * k) / 3);
      p.carve.lineTo(x + lw / 2, bottom - (lh * k) / 3);
    }
    for (let bx = x - lw / 2 + lw * 0.08; bx < x + lw / 2; bx += lw * 0.12) {
      p.carve.moveTo(bx + (i % 2 ? lw * 0.04 : 0), bottom);
      p.carve.lineTo(bx + (i % 2 ? lw * 0.04 : 0), bottom - lh / 3);
    }
    p.shade.rect(x + lw * 0.3, bottom - lh, lw * 0.2, lh);
    mossCap(p, x - lw / 2, x + lw / 2, bottom - lh, lh * 0.4, rng);
    if (i === 1) hang(p, x - lw * 0.42, bottom - lh, lh * 1.4, rng);
    if (i === 2) hang(p, x + lw * 0.38, bottom - lh, lh * 1.1, rng);
  }
  /* The stair: risers up the front, a shrine block on top with an opening. */
  const sw = w * 0.14;
  for (let i = 0; i < levels * 3; i += 1) {
    const y = root - (h / (levels * 3)) * i;
    p.lit.moveTo(x - sw / 2, y);
    p.lit.lineTo(x + sw / 2, y);
    p.carve.moveTo(x - sw / 2, y);
    p.carve.lineTo(x + sw / 2, y);
  }
  p.carve.moveTo(x - sw / 2, root);
  p.carve.lineTo(x - sw / 2, root - h);
  p.carve.moveTo(x + sw / 2, root);
  p.carve.lineTo(x + sw / 2, root - h);
  stone(p, x, root - h, w * 0.28, lh * 1.2, 0, rng, true);
  weather(p.hatch, x - w / 2, root - h, w, h, Math.max(1.6, lh * 0.15), rng);
};

/* A small tree or shrub rooted in the stones: a crooked trunk and scalloped canopy. */
const tree = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const lean = (rng() - 0.5) * w * 0.3;
  const trunk = w * 0.045;
  p.outline.moveTo(x - trunk, root);
  p.outline.quadraticCurveTo(
    x - trunk + lean * 0.5,
    root - h * 0.4,
    x - trunk * 0.6 + lean,
    root - h * 0.6,
  );
  p.outline.lineTo(x + trunk * 0.6 + lean, root - h * 0.6);
  p.outline.quadraticCurveTo(
    x + trunk + lean * 0.5,
    root - h * 0.4,
    x + trunk,
    root,
  );
  p.outline.closePath();
  const cx = x + lean;
  const cy = root - h * 0.72;
  /* One scalloped canopy outline, leaves as fine strokes inside it. */
  const lobes = 9;
  const rx = w * 0.46;
  const ry = h * 0.3;
  const rim = (k: number): Point => {
    const a = (k / lobes) * Math.PI * 2;
    const wobble = 0.85 + ((k * 7) % 5) * 0.05;
    return [cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble];
  };
  p.outline.moveTo(...rim(0));
  for (let k = 0; k < lobes; k += 1) {
    const [ax, ay] = rim(k);
    const [bx, by] = rim(k + 1);
    const mid = ((k + 0.5) / lobes) * Math.PI * 2;
    const bulge = 1.28;
    p.outline.quadraticCurveTo(
      cx + Math.cos(mid) * rx * bulge,
      cy + Math.sin(mid) * ry * bulge,
      bx,
      by,
    );
    void ax;
    void ay;
  }
  p.outline.closePath();
  for (let k = 0; k < 70; k += 1) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 0.9;
    const lx = cx + Math.cos(a) * rx * d;
    const ly = cy + Math.sin(a) * ry * d;
    const len = rx * 0.14;
    p.moss.moveTo(lx, ly);
    p.moss.quadraticCurveTo(
      lx + len * 0.5,
      ly - len * 0.4,
      lx + len,
      ly - len * 0.1,
    );
  }
  p.shade.ellipse(
    cx + rx * 0.25,
    cy + ry * 0.35,
    rx * 0.7,
    ry * 0.55,
    0,
    0,
    Math.PI * 2,
  );
  /* Bark, and a fork into the canopy. */
  p.carve.moveTo(x - trunk * 0.3, root - h * 0.05);
  p.carve.quadraticCurveTo(
    x + lean * 0.3,
    root - h * 0.3,
    x + lean * 0.9 - trunk * 0.2,
    root - h * 0.58,
  );
  p.outline.moveTo(x + lean * 0.95, root - h * 0.6);
  p.outline.lineTo(x + lean * 0.95 - w * 0.2, root - h * 0.78);
  p.outline.lineTo(x + lean * 0.95 - w * 0.18, root - h * 0.8);
  p.outline.lineTo(x + lean * 0.95 + trunk * 0.3, root - h * 0.64);
  p.outline.closePath();
  p.carve.moveTo(x + lean * 0.6, root - h * 0.55);
  p.carve.lineTo(x + lean * 0.6 - w * 0.12, root - h * 0.7);
  p.carve.moveTo(x + lean * 0.7, root - h * 0.6);
  p.carve.lineTo(x + lean * 0.7 + w * 0.14, root - h * 0.74);
};

/* The monolith: a near-cube of dark stone, chipped and weathered, carved with grooved glyphs. */
const monolith = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  vine: boolean,
): void => {
  const depth = w * 0.26;
  const dx = depth;
  const dy = -depth * 0.5;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = root - h;
  const chip = w * 0.04;
  const front = new Path2D();
  front.moveTo(left, root);
  front.lineTo(left, top + chip * 1.5);
  front.lineTo(left + chip, top);
  chipped(front, [left + chip, top], [right - chip * 0.5, top], rng, chip, 3);
  front.lineTo(right, top + chip * 0.8);
  chipped(front, [right, top + chip * 0.8], [right, root], rng, chip * 0.8, 2);
  front.closePath();
  const crown = new Path2D();
  crown.moveTo(left + chip, top);
  crown.lineTo(left + dx + chip, top + dy);
  crown.lineTo(right + dx, top + dy);
  crown.lineTo(right, top + chip * 0.8);
  crown.closePath();
  const side = new Path2D();
  side.moveTo(right, top + chip * 0.8);
  side.lineTo(right + dx, top + dy);
  side.lineTo(right + dx - chip * 0.3, root + dy - chip);
  side.lineTo(right, root);
  side.closePath();
  for (const face of [front, crown, side]) {
    p.outline.addPath(face);
    p.dark.addPath(face);
  }
  p.light.addPath(crown);
  p.deep.addPath(side);

  /* Weathering: pale scuffs and pits across the face. */
  for (let k = 0; k < 40; k += 1) {
    const sx = left + w * (0.04 + rng() * 0.92);
    const sy = top + h * (0.04 + rng() * 0.92);
    const sw = w * (0.01 + rng() * 0.05);
    p.light.rect(sx, sy, sw, Math.max(0.8, sw * 0.3));
  }
  p.lit.moveTo(left + chip * 0.6, root - h * 0.04);
  p.lit.lineTo(left + chip * 0.6, top + chip * 1.6);
  p.lit.lineTo(left + chip * 1.6, top + chip * 0.6);
  p.lit.lineTo(right - chip, top + chip * 0.6);
  /* Glyphs as chiselled grooves: a dark channel with a light lower lip. */
  const cols = 4;
  const rows = 4;
  const padX = w * 0.16;
  const padY = h * 0.14;
  const cell = (w - padX * 2) / cols;
  const pitch = (h - padY * 2) / rows;
  const glyph = Math.min(cell, pitch) * 0.62;
  const unit = glyph / 2;
  const lip = Math.max(0.7, glyph * 0.07);
  for (let i = 0; i < cols * rows; i += 1) {
    if (i === 6 || i === 13) continue;
    const gx = left + padX + (i % cols) * cell + (cell - glyph) / 2;
    const gy = top + padY + Math.floor(i / cols) * pitch + (pitch - glyph) / 2;
    for (const part of GLYPHS[(i * 3 + 2) % GLYPHS.length]!) {
      p.shadow.moveTo(gx + part[0]! * unit, gy + part[1]! * unit);
      p.lit.moveTo(gx + part[0]! * unit + lip, gy + part[1]! * unit + lip);
      for (let k = 2; k < part.length; k += 2) {
        p.shadow.lineTo(gx + part[k]! * unit, gy + part[k + 1]! * unit);
        p.lit.lineTo(
          gx + part[k]! * unit + lip,
          gy + part[k + 1]! * unit + lip,
        );
      }
    }
  }
  crack(p.lit, left + w * 0.7, top + chip, h * 0.3, rng);
  mossCap(p, left, right + dx, top + dy * 0.4, Math.max(3, w * 0.08), rng, 1);
  tuft(p, left - w * 0.05, root, h * 0.2, rng);
  tuft(p, right + dx * 0.9, root + dy, h * 0.16, rng);
  if (vine) {
    const edge = (x0: number, wave: number): Point[] => {
      const pts: Point[] = [];
      for (let i = 0; i <= 36; i += 1) {
        const f = i / 36;
        pts.push([
          x0 + Math.sin(f * Math.PI * 4 + wave) * w * 0.035,
          root - h * 0.95 * f,
        ]);
      }
      return pts;
    };
    p.vines.push(edge(left, 0));
    p.vines.push(
      edge(right + dx * 0.6, 1.4).map(
        ([vx, vy]) => [vx, vy + dy * 0.6 * ((root - vy) / h)] as Point,
      ),
    );
  }
};

type Opening = 'arched' | 'square' | 'slit' | 'empty' | 'broken';
const OPENINGS: readonly Opening[] = [
  'arched',
  'square',
  'slit',
  'empty',
  'broken',
];

const cutOpening = (
  p: Parts,
  kind: Opening,
  x: number,
  sill: number,
  w: number,
  h: number,
  rng: () => number,
): void => {
  const path = kind === 'empty' || kind === 'broken' ? p.carve : p.dark;
  if (kind === 'arched') {
    path.moveTo(x - w / 2, sill);
    path.lineTo(x - w / 2, sill - h + w / 2);
    path.arc(x, sill - h + w / 2, w / 2, Math.PI, 0);
    path.lineTo(x + w / 2, sill);
    path.closePath();
  } else if (kind === 'slit') {
    path.rect(x - w * 0.18, sill - h, w * 0.36, h);
  } else if (kind === 'broken') {
    /* A torn opening: outlined, a shadow inside its top edge, the back wall's line beyond. */
    const pts: Point[] = [
      [x - w * 0.6, sill + h * 0.05],
      [x - w * 0.7, sill - h * (0.5 + rng() * 0.3)],
      [x - w * 0.2, sill - h * 1.15],
      [x + w * 0.4, sill - h * (0.9 + rng() * 0.3)],
      [x + w * 0.75, sill - h * 0.3],
      [x + w * 0.5, sill + h * 0.1],
    ];
    p.carve.moveTo(...pts[0]!);
    pts.slice(1).forEach((pt) => p.carve.lineTo(...pt));
    p.carve.closePath();
    p.shadow.moveTo(pts[1]![0] + w * 0.08, pts[1]![1] + h * 0.06);
    p.shadow.lineTo(pts[2]![0], pts[2]![1] + h * 0.1);
    p.shadow.lineTo(pts[3]![0] - w * 0.05, pts[3]![1] + h * 0.1);
    p.carve.moveTo(x - w * 0.45, sill - h * 0.25);
    p.carve.lineTo(x + w * 0.5, sill - h * 0.25);
  } else {
    path.rect(x - w / 2, sill - h, w, h);
    p.carve.moveTo(x - w * 0.7, sill - h);
    p.carve.lineTo(x + w * 0.7, sill - h);
  }
  if (kind !== 'broken') {
    p.lit.moveTo(x - w * 0.6, sill + w * 0.12);
    p.lit.lineTo(x + w * 0.6, sill + w * 0.12);
  }
};

type Ruinous = 'intact' | 'roofless' | 'corner' | 'storey' | 'hole';

/*
 * A city building as a box: front wall with openings, a shaded side face, a
 * lit roof. Ruined ones lose the roof to a jagged wall top, a corner, an upper
 * storey or a hole through the wall; some lean.
 */
const house = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  broken: boolean,
): void => {
  const state: Ruinous = !broken
    ? 'intact'
    : (['roofless', 'corner', 'storey', 'hole'] as const)[
        Math.floor(rng() * 4)
      ]!;
  const lean = broken && rng() < 0.35 ? (rng() - 0.5) * 0.12 : 0;
  const local = parts();
  const depth = w * 0.28;
  const dx = depth;
  const dy = -depth * 0.45;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = root - h;
  /* The wall top as a profile across the front: flat, or broken down in steps. */
  const profile: Point[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const bx = left + w * f;
    let by = top;
    if (state === 'roofless') by = top + h * (0.04 + rng() * 0.14);
    if (state === 'corner' && f > 0.45)
      by = top + h * (f - 0.45) * (0.9 + rng() * 0.4) + (i % 2 ? h * 0.05 : 0);
    if (state === 'storey')
      by = f > 0.3 ? top + h * (0.32 + rng() * 0.12) : top + h * rng() * 0.05;
    profile.push([bx, by]);
  }
  const rightTop = profile[steps]![1];
  /* Side face, and a roof only while the building keeps one. */
  local.outline.moveTo(right, root);
  local.outline.lineTo(right, rightTop);
  local.outline.lineTo(right + dx, rightTop + dy);
  local.outline.lineTo(right + dx, root + dy);
  local.outline.closePath();
  local.deep.moveTo(right, root);
  local.deep.lineTo(right, rightTop);
  local.deep.lineTo(right + dx, rightTop + dy);
  local.deep.lineTo(right + dx, root + dy);
  local.deep.closePath();
  if (state === 'intact' || state === 'hole') {
    local.outline.moveTo(left, top);
    local.outline.lineTo(left + dx, top + dy);
    local.outline.lineTo(right + dx, top + dy);
    local.outline.lineTo(right, top);
    local.outline.closePath();
  } else {
    /* Roofless: the inside of the back wall shows through the open top. */
    local.carve.moveTo(left + dx * 0.4, profile[0]![1] + dy * 0.4);
    local.carve.lineTo(right + dx * 0.4, rightTop + dy * 0.4);
  }
  local.outline.moveTo(left, root);
  profile.forEach(([px, py]) => local.outline.lineTo(px, py));
  local.outline.lineTo(right, root);
  local.outline.closePath();

  const storey = Math.max(w * (0.32 + rng() * 0.2), h / 5);
  const floors = Math.max(1, Math.floor(h / storey));
  const topAt = (bx: number): number => {
    const i = Math.min(
      steps - 1,
      Math.max(0, Math.floor(((bx - left) / w) * steps)),
    );
    return Math.max(profile[i]![1], profile[i + 1]![1]);
  };
  for (let f = 1; f < floors; f += 1) {
    const y = root - storey * f;
    local.hatch.moveTo(left, y);
    local.hatch.lineTo(right, y);
  }
  if (state === 'intact') {
    local.carve.moveTo(left, top + storey * 0.16);
    local.carve.lineTo(right, top + storey * 0.16);
  }
  const kind = OPENINGS[Math.floor(rng() * OPENINGS.length)]!;
  const cols = Math.max(1, Math.round(w / (storey * (0.6 + rng() * 0.5))));
  const ow = (w / cols) * (kind === 'slit' ? 0.5 : 0.22 + rng() * 0.1);
  const oh = storey * (0.3 + rng() * 0.12);
  const door = Math.floor(rng() * cols);
  for (let f = 0; f < floors; f += 1) {
    const sill = root - storey * f - storey * 0.3;
    for (let c = 0; c < cols; c += 1) {
      const ox = left + (w / cols) * (c + 0.5);
      if (f === 0 && c === door) continue;
      if (sill - oh < topAt(ox) + storey * 0.12) continue;
      if (rng() < 0.15) continue;
      cutOpening(
        local,
        broken && rng() < 0.25 ? 'broken' : kind,
        ox,
        sill,
        ow,
        oh,
        rng,
      );
    }
  }
  const doorKind: Opening =
    broken && rng() < 0.4 ? 'broken' : rng() < 0.5 ? 'arched' : 'square';
  cutOpening(
    local,
    doorKind,
    left + (w / cols) * (door + 0.5),
    root,
    Math.min(w * 0.24, storey * 0.5),
    storey * 0.68,
    rng,
  );
  if (state === 'hole') {
    /* A breach through the wall: torn outline, shadowed upper edge, the far wall seen through it. */
    const hx = left + w * (0.3 + rng() * 0.4);
    const hy = root - h * (0.45 + rng() * 0.2);
    const hr = Math.min(w, h) * 0.14;
    const rim: Point[] = [];
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      const rr = hr * (0.7 + rng() * 0.45);
      rim.push([hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.85]);
    }
    local.carve.moveTo(...rim[0]!);
    rim.slice(1).forEach((pt) => local.carve.lineTo(...pt));
    local.carve.closePath();
    local.shadow.moveTo(...rim[5]!);
    for (const k of [6, 7, 8, 9])
      local.shadow.lineTo(
        rim[k]![0] * 0.85 + hx * 0.15,
        rim[k]![1] * 0.85 + hy * 0.15,
      );
    local.carve.moveTo(hx - hr * 0.7, hy + hr * 0.2);
    local.carve.lineTo(hx + hr * 0.75, hy + hr * 0.2);
    local.hatch.moveTo(hx - hr * 0.3, hy + hr * 0.2);
    local.hatch.lineTo(hx - hr * 0.3, hy + hr * 0.75);
  }
  weather(local.hatch, left, top, w, h, Math.max(2.4, storey * 0.45), rng);
  if (rng() < 0.6)
    crack(
      local.carve,
      left + w * (0.15 + rng() * 0.6),
      topAt(x) + h * 0.1,
      h * 0.35,
      rng,
    );
  /* Overgrowth varies: bare, light caps, or heavy growth spilling down the wall. */
  const growth = rng();
  const amount = growth < 0.3 ? 0 : growth < 0.75 ? 1 : 2;
  for (let i = 0; i < steps; i += 1) {
    mossCap(
      local,
      profile[i]![0],
      profile[i + 1]![0],
      (profile[i]![1] + profile[i + 1]![1]) / 2,
      Math.max(2.5, storey * 0.3),
      rng,
      amount,
    );
  }
  if (amount === 2 || rng() < 0.25)
    hang(
      local,
      left + w * (0.15 + rng() * 0.6),
      topAt(x),
      h * (0.3 + rng() * 0.4),
      rng,
    );
  if (broken) {
    for (let k = 0; k < 4; k += 1) {
      const rx = left + w * (0.5 + rng() * 0.6);
      const rs = storey * (0.1 + rng() * 0.15);
      local.outline.rect(rx - rs, root - rs, rs * 2, rs);
    }
  }
  tuft(local, left - w * 0.04, root, storey * 0.5, rng);
  /* Lean about the foot, carrying every part with it. */
  const m = new DOMMatrix()
    .translate(x, root)
    .rotate((lean * 180) / Math.PI)
    .translate(-x, -root);
  const tilt = ([px, py]: Point): Point => [
    m.a * px + m.c * py + m.e,
    m.b * px + m.d * py + m.f,
  ];
  for (const key of [
    'outline',
    'carve',
    'hatch',
    'shade',
    'deep',
    'dark',
    'lit',
    'light',
    'moss',
    'shadow',
    'back',
  ] as const) {
    p[key].addPath(local[key], m);
  }
  local.tufts.forEach((t) => {
    const [tx, ty] = tilt([t.x, t.y]);
    p.tufts.push({ ...t, x: tx, y: ty });
  });
  local.vines.forEach((v) => p.vines.push(v.map(tilt)));
};

/* An aqueduct: a row of arches on piers carrying a channel, one span fallen. */
const aqueduct = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const spans = 6;
  const span = w / spans;
  const pier = span * 0.22;
  const deck = h * 0.16;
  const left = x - w / 2;
  const gap = 3;
  for (let i = 0; i < spans; i += 1) {
    const sx = left + span * i;
    if (i === gap) continue;
    const r = (span - pier) / 2;
    const spring = root - h + deck + r;
    p.outline.moveTo(sx, root);
    p.outline.lineTo(sx, root - h);
    chipped(
      p.outline,
      [sx, root - h],
      [sx + span, root - h],
      rng,
      deck * 0.2,
      1,
    );
    p.outline.lineTo(sx + span, root);
    p.outline.lineTo(sx + span - pier / 2, root);
    p.outline.lineTo(sx + span - pier / 2, spring);
    p.outline.arc(sx + span / 2, spring, r, 0, Math.PI, true);
    p.outline.lineTo(sx + pier / 2, root);
    p.outline.closePath();
    p.carve.moveTo(sx, root - h + deck);
    p.carve.lineTo(sx + span, root - h + deck);
    for (let k = 1; k < 6; k += 1) {
      const a = Math.PI + (Math.PI * k) / 6;
      p.carve.moveTo(sx + span / 2 + Math.cos(a) * r, spring + Math.sin(a) * r);
      p.carve.lineTo(
        sx + span / 2 + Math.cos(a) * (r + deck * 0.8),
        spring + Math.sin(a) * (r + deck * 0.8),
      );
    }
    p.shade.rect(
      sx + span - pier / 2 - pier * 0.2,
      spring,
      pier * 0.2,
      root - spring,
    );
    mossCap(p, sx, sx + span, root - h, deck * 0.9, rng);
    if (i === gap - 1 || i === gap + 1)
      hang(p, sx + (i < gap ? span * 0.9 : span * 0.1), root - h, h * 0.4, rng);
  }
  /* The fallen span's broken stubs and its rubble. */
  const gx = left + span * gap;
  p.outline.moveTo(gx, root);
  p.outline.lineTo(gx, root - h * 0.55);
  p.outline.lineTo(gx + pier * 0.3, root - h * 0.6);
  p.outline.lineTo(gx + pier * 0.5, root);
  p.outline.closePath();
  for (let k = 0; k < 4; k += 1) {
    const rs = deck * (0.5 + rng() * 0.6);
    p.outline.rect(gx + span * (0.15 + k * 0.2), root - rs, rs * 1.6, rs);
  }
  weather(p.hatch, left, root - h, w, h, Math.max(1.6, deck * 0.3), rng);
};

/* Paving receding from `near` to `far` depth: joints converge on the centre, some flags gone. */
const plaza = (p: Parts, box: Box, spec: RuinSpec, rng: () => number): void => {
  const near = spec.near ?? 1.6;
  const far = spec.z;
  const cx = spec.x * box.boxWidth;
  const half = (spec.width / 2) * box.boxWidth;
  const rows = 5;
  const yAt = (z: number): number => box.horizon + box.projection / z;
  for (let i = 0; i <= rows; i += 1) {
    const z = near * Math.pow(far / near, i / rows);
    const y = yAt(z);
    const span = half * (near / z) * 1.6;
    let x0 = cx - span;
    while (x0 < cx + span) {
      const run = span * (0.15 + rng() * 0.3);
      if (rng() > 0.65) {
        p.ground.moveTo(x0, y);
        p.ground.lineTo(Math.min(cx + span, x0 + run), y);
      }
      x0 += run * 1.1;
    }
    if (i < rows) {
      const z2 = near * Math.pow(far / near, (i + 1) / rows);
      const y2 = yAt(z2);
      const flags = 10;
      for (let k = -flags; k <= flags; k += 1) {
        if (rng() < 0.75) continue;
        const off = (k + (i % 2) * 0.5) / flags;
        p.ground.moveTo(cx + off * half * (near / z) * 1.6, y);
        p.ground.lineTo(cx + off * half * (near / z2) * 1.6, y2);
        if (rng() < 0.06)
          tuft(p, cx + off * half * (near / z) * 1.6, y, (y - y2) * 1.2, rng);
      }
    }
  }
};

/* Broad steps rising to the monolith: chipped treads, lit nosings, grass in the joints. */
const steps = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const count = 4;
  const rise = h / count;
  for (let i = 0; i < count; i += 1) {
    const sw = w * (1 - i * 0.12);
    const y = root - rise * i;
    p.outline.moveTo(x - sw / 2, y);
    p.outline.lineTo(x - sw / 2, y - rise);
    chipped(
      p.outline,
      [x - sw / 2, y - rise],
      [x + sw / 2, y - rise],
      rng,
      rise * 0.3,
      3,
    );
    p.outline.lineTo(x + sw / 2, y);
    p.outline.closePath();
    p.lit.moveTo(x - sw / 2, y - rise + rise * 0.12);
    p.lit.lineTo(x + sw / 2, y - rise + rise * 0.12);
    for (let k = 1; k < 5; k += 1) {
      const jx = x - sw / 2 + (sw * (k + (i % 2) * 0.5)) / 5;
      p.carve.moveTo(jx, y);
      p.carve.lineTo(jx, y - rise);
    }
    tuft(p, x - sw / 2 + sw * rng(), y - rise, rise * 1.4, rng);
    mossCap(p, x - sw / 2, x - sw / 2 + sw * 0.2, y - rise, rise * 0.6, rng, 1);
  }
  weather(p.hatch, x - w / 2, root - h, w, h, Math.max(2, rise * 0.4), rng);
};

/* A fallen column drum run: a lying fluted shaft, one end cut, the other broken. */
const fallen = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const r = h / 2;
  const left = x - w / 2;
  const right = x + w / 2;
  p.outline.moveTo(right, root - h);
  p.outline.lineTo(left + r * 0.2, root - h);
  [0.15, -0.2, 0.25, -0.1].forEach((j, i) =>
    p.outline.lineTo(left + r * (0.2 + j), root - h + (h * (i + 1)) / 5),
  );
  p.outline.lineTo(left + r * 0.2, root);
  p.outline.lineTo(right, root);
  p.outline.closePath();
  p.outline.moveTo(right + r * 0.4, root - r);
  p.outline.ellipse(right, root - r, r * 0.4, r, 0, 0, Math.PI * 2);
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    p.carve.moveTo(left + r * 0.5, root - h * f);
    p.carve.lineTo(right - r * 0.1, root - h * f);
  }
  p.carve.moveTo(right + r * 0.25, root - r);
  p.carve.ellipse(right, root - r, r * 0.25, r * 0.62, 0, 0, Math.PI * 2);
  p.shade.rect(left, root - h * 0.35, w, h * 0.35);
  mossCap(p, left + r, right - r, root - h, r * 0.6, rng, rng() < 0.5 ? 1 : 2);
  tuft(p, left + w * 0.3, root, h * 0.8, rng);
};

/* A heap of fallen stones. */
const rubble = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const count = 12;
  for (let i = 0; i < count; i += 1) {
    const f = rng();
    const sx = x + (f - 0.5) * w;
    const lift = (1 - Math.abs(f - 0.5) * 2) * h * rng();
    const sw = w * (0.08 + rng() * 0.1);
    const sh = sw * (0.5 + rng() * 0.4);
    const y = root - lift;
    p.outline.moveTo(sx - sw / 2, y);
    p.outline.lineTo(sx - sw / 2 + sw * 0.1, y - sh);
    p.outline.lineTo(
      sx + sw / 2 - sw * 0.15 * rng(),
      y - sh * (0.8 + rng() * 0.2),
    );
    p.outline.lineTo(sx + sw / 2, y);
    p.outline.closePath();
  }
  tuft(p, x - w * 0.4, root, h * 0.7, rng);
  tuft(p, x + w * 0.35, root, h * 0.6, rng);
  mossCap(p, x - w * 0.2, x + w * 0.2, root - h * 0.8, h * 0.4, rng, 1);
};

/*
 * The inscription slab: a tall dark block, edges lightly weathered, a recessed
 * panel of tidy glyph rows cut as grooves with a light lower lip, on a low base.
 */
const slab = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const baseH = h * 0.07;
  const depth = w * 0.18;
  const dx = depth;
  const dy = -depth * 0.5;
  p.outline.moveTo(x - w * 0.68, root);
  p.outline.lineTo(x - w * 0.68, root - baseH);
  chipped(
    p.outline,
    [x - w * 0.68, root - baseH],
    [x + w * 0.68 + dx * 0.6, root - baseH],
    rng,
    baseH * 0.2,
    2,
  );
  p.outline.lineTo(x + w * 0.68 + dx * 0.6, root);
  p.outline.closePath();
  p.lit.moveTo(x - w * 0.68, root - baseH + baseH * 0.15);
  p.lit.lineTo(x + w * 0.68, root - baseH + baseH * 0.15);
  const bottom = root - baseH;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = bottom - h;
  const e = w * 0.025;
  const front = new Path2D();
  front.moveTo(left, bottom);
  front.lineTo(left, top + e * 2);
  front.lineTo(left + e, top);
  front.lineTo(left + w * 0.55, top);
  front.lineTo(left + w * 0.6, top + e * 3);
  front.lineTo(left + w * 0.68, top + e * 2.2);
  front.lineTo(left + w * 0.72, top);
  front.lineTo(right - e, top);
  front.lineTo(right, top + e);
  front.lineTo(right, top + h * 0.55);
  front.lineTo(right - e * 2.4, top + h * 0.58);
  front.lineTo(right - e * 1.6, top + h * 0.64);
  front.lineTo(right, top + h * 0.66);
  front.lineTo(right, bottom - e * 3);
  front.lineTo(right - e * 2, bottom);
  front.closePath();
  const side = new Path2D();
  side.moveTo(right, top + e);
  side.lineTo(right + dx, top + dy + e);
  side.lineTo(right + dx, bottom + dy);
  side.lineTo(right, bottom);
  side.closePath();
  const crown = new Path2D();
  crown.moveTo(left + e, top);
  crown.lineTo(left + e + dx, top + dy);
  crown.lineTo(right + dx, top + dy + e);
  crown.lineTo(right, top + e);
  crown.closePath();
  for (const face of [front, side, crown]) {
    p.outline.addPath(face);
    p.dark.addPath(face);
  }
  p.light.addPath(crown);
  p.deep.addPath(side);
  /* A paler weathered streak running down the face from the chipped crown. */
  p.light.moveTo(left + w * 0.6, top + e * 3);
  p.light.bezierCurveTo(
    left + w * 0.66,
    top + h * 0.3,
    left + w * 0.56,
    top + h * 0.6,
    left + w * 0.62,
    bottom - h * 0.05,
  );
  p.light.lineTo(left + w * 0.645, bottom - h * 0.05);
  p.light.bezierCurveTo(
    left + w * 0.64,
    top + h * 0.6,
    left + w * 0.74,
    top + h * 0.3,
    left + w * 0.68,
    top + e * 2.2,
  );
  p.light.closePath();
  /* Light catches the left edge and the crown's front edge. */
  p.lit.moveTo(left + e * 0.7, bottom - e);
  p.lit.lineTo(left + e * 0.7, top + e * 2);
  p.lit.lineTo(left + e * 1.5, top + e * 0.7);
  p.lit.lineTo(right - e * 1.5, top + e * 0.7);
  /* Recessed panel: shadowed top and left inside edges, lit bottom and right. */
  const pl = left + w * 0.14;
  const pr = right - w * 0.14;
  const pt = top + h * 0.1;
  const pb = bottom - h * 0.12;
  p.shadow.moveTo(pl, pb);
  p.shadow.lineTo(pl, pt);
  p.shadow.lineTo(pr, pt);
  p.lit.moveTo(pr, pt);
  p.lit.lineTo(pr, pb);
  p.lit.lineTo(pl, pb);
  const cols = 4;
  const rows = 8;
  const cell = (pr - pl) / cols;
  const pitch = (pb - pt) / rows;
  const glyph = Math.min(cell, pitch) * 0.56;
  const unit = glyph / 2;
  const lip = Math.max(0.6, glyph * 0.08);
  for (let i = 0; i < cols * rows; i += 1) {
    if (i % 9 === 8) continue;
    const gx = pl + (i % cols) * cell + (cell - glyph) / 2;
    const gy = pt + Math.floor(i / cols) * pitch + (pitch - glyph) / 2;
    for (const part of GLYPHS[(i * 5 + 3) % GLYPHS.length]!) {
      p.shadow.moveTo(gx + part[0]! * unit, gy + part[1]! * unit);
      p.lit.moveTo(gx + part[0]! * unit + lip, gy + part[1]! * unit + lip);
      for (let k = 2; k < part.length; k += 2) {
        p.shadow.lineTo(gx + part[k]! * unit, gy + part[k + 1]! * unit);
        p.lit.lineTo(
          gx + part[k]! * unit + lip,
          gy + part[k + 1]! * unit + lip,
        );
      }
    }
  }
  p.cast.ellipse(
    x + w * 0.45,
    root - baseH * 0.2,
    w * 1.1,
    baseH * 1.6,
    0,
    0,
    Math.PI * 2,
  );
  /* Weathering: pale scuffs on the dark face, outside the panel. */
  for (let k = 0; k < 26; k += 1) {
    const sx = left + w * (0.03 + rng() * 0.94);
    const sy = top + h * (0.02 + rng() * 0.96);
    if (sx > pl && sx < pr && sy > pt && sy < pb) continue;
    const sw = w * (0.02 + rng() * 0.05);
    p.light.rect(sx, sy, sw, Math.max(0.8, sw * 0.3));
  }
  for (const [cx, cy] of [
    [left, top + h * 0.3],
    [right, top + h * 0.62],
    [left + w * 0.3, bottom],
  ] as const) {
    p.lit.moveTo(cx - w * 0.03, cy);
    p.lit.lineTo(cx, cy + w * 0.035);
    p.lit.lineTo(cx + w * 0.03, cy);
  }
  tuft(p, x - w * 0.7, root, h * 0.12, rng);
  tuft(p, x + w * 0.72, root, h * 0.1, rng);
  p.feet.push([x - w * 0.6, 0, w * 0.4], [x + w * 0.65, 0, w * 0.4]);
  const edge: Point[] = [];
  for (let i = 0; i <= 30; i += 1)
    edge.push([
      left + Math.sin((i / 30) * Math.PI * 3.5) * w * 0.04,
      bottom - h * 0.8 * (i / 30),
    ]);
  p.vines.push(edge);
  /* Vines climb the base only; the face stays clear. */
  const vine: Point[] = [];
  for (let i = 0; i <= 16; i += 1)
    vine.push([
      x - w * 0.66 + (w * 0.5 * i) / 16,
      root - baseH * (0.2 + Math.abs(Math.sin(i * 0.6)) * 0.8),
    ]);
  p.vines.push(vine);
};

/*
 * A wall receding from `near` to `far` depth at world x `wx`: a quad whose
 * courses converge on the vanishing point, its top broken down toward the far end,
 * window openings set in perspective.
 */
const sidewall = (
  p: Parts,
  box: Box,
  spec: RuinSpec,
  rng: () => number,
): void => {
  const near = spec.z;
  const far = spec.far ?? near * 3;
  const cx = box.boxWidth / 2;
  const wx = spec.wx ?? 2;
  const at = (z: number, up: number): Point => [
    cx + (wx * box.projection) / z,
    box.horizon +
      (box.projection / z) * (1 - (spec.lift ?? 0)) -
      (up * box.projection) / z,
  ];
  const steps = 14;
  const zs = Array.from(
    { length: steps + 1 },
    (_, i) => near * Math.pow(far / near, i / steps),
  );
  const topAt = (i: number): number =>
    spec.height *
    (i < steps * 0.45
      ? 1 - (i % 3 === 1 ? 0.04 : 0)
      : Math.max(
          0.25,
          1 - ((i - steps * 0.45) / steps) * 1.4 + (i % 2 ? 0.08 : -0.04),
        ));
  const face = new Path2D();
  face.moveTo(...at(near, 0));
  zs.forEach((z, i) => face.lineTo(...at(z, topAt(i))));
  face.lineTo(...at(far, 0));
  face.closePath();
  p.outline.addPath(face);
  /* Light from the upper left: the right-hand wall's face turns away from it. */
  if (wx > 0) p.shade.addPath(face);
  /* Its shadow falls toward the centre along the floor. */
  const castAt = (z: number): Point => [
    cx + ((wx - Math.sign(wx) * spec.height * 0.45) * box.projection) / z,
    box.horizon + (box.projection / z) * (1 - (spec.lift ?? 0)),
  ];
  p.cast.moveTo(...at(near, 0));
  zs.forEach((z) => p.cast.lineTo(...castAt(z)));
  p.cast.lineTo(...at(far, 0));
  p.cast.closePath();
  zs.forEach((z, i) => {
    if (i % 2 === 0) p.feet.push([at(z, 0)[0], z, (0.3 * box.projection) / z]);
  });
  const narrow = box.boxWidth < 520;
  /* The wall's thickness: its top surface, set back toward the centre. */
  const thick = (spec.width ?? 1) * 0.35 * Math.sign(wx);
  const inner = (z: number, up: number): Point => [
    cx + ((wx - thick) * box.projection) / z,
    box.horizon +
      (box.projection / z) * (1 - (spec.lift ?? 0)) -
      (up * box.projection) / z,
  ];
  const topFace = new Path2D();
  topFace.moveTo(...at(near, topAt(0)));
  zs.forEach((z, i) => topFace.lineTo(...at(z, topAt(i))));
  for (let i = steps; i >= 0; i -= 1)
    topFace.lineTo(...inner(zs[i]!, topAt(i)));
  topFace.closePath();
  p.outline.addPath(topFace);
  p.light.addPath(topFace);
  const courses = narrow ? 2 : 3;
  for (let c = 1; c < courses; c += 1) {
    const up = (spec.height * c) / courses;
    let started = false;
    zs.forEach((z, i) => {
      if (topAt(i) <= up) return;
      if (!started) {
        p.carve.moveTo(...at(z, up));
        started = true;
      } else p.carve.lineTo(...at(z, up));
    });
  }
  zs.forEach((z, i) => {
    if (i === 0 || i === steps) return;
    const up = topAt(i);
    const course = spec.height / courses;
    for (let c = 0; c < courses; c += 1) {
      if ((c + 1) * course > up) break;
      if (narrow || rng() < 0.55) continue;
      p.hatch.moveTo(...at(z, c * course));
      p.hatch.lineTo(...at(z, (c + 1) * course));
      /* Now and then a block is missing from the course. */
      if (c === Math.floor(up / course) - 1 && rng() < 0.3 && i < steps - 1) {
        const z2 = zs[i + 1]!;
        const gap = [
          at(z, c * course),
          at(z, (c + 1) * course),
          at(z2, (c + 1) * course),
          at(z2, c * course),
        ];
        p.deep.moveTo(...gap[0]!);
        gap.slice(1).forEach((pt) => p.deep.lineTo(...pt));
        p.deep.closePath();
      }
    }
    /* A window every third bay, while the wall stands high enough. */
    if (i % 3 === 1 && up > spec.height * 0.75) {
      const z2 = zs[i + 1]!;
      const lo = spec.height * 0.38;
      const hi = spec.height * 0.68;
      const quad = [at(z, lo), at(z, hi), at(z2, hi), at(z2, lo)];
      p.carve.moveTo(...quad[0]!);
      quad.slice(1).forEach((pt) => p.carve.lineTo(...pt));
      p.carve.closePath();
      p.shadow.moveTo(...quad[0]!);
      p.shadow.lineTo(...quad[1]!);
      p.shadow.lineTo(...quad[2]!);
    }
  });
  if (rng() < 2) {
    zs.forEach((z, i) => {
      if (i % 4 === 2)
        tuft(p, ...at(z, 0), (spec.height * 0.25 * box.projection) / z, rng);
      if (i % 5 === 3)
        mossCap(
          p,
          at(z, topAt(i))[0] - 3,
          at(z, topAt(i))[0] + 3,
          at(z, topAt(i))[1],
          (spec.height * 0.15 * box.projection) / z,
          rng,
          1,
        );
    });
  }
};

/* A low hill for a distant citadel: one smooth crest, grass strokes along it. */
const hill = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  p.outline.moveTo(x - w / 2, root);
  p.outline.bezierCurveTo(
    x - w * 0.3,
    root - h * 0.2,
    x - w * 0.2,
    root - h,
    x,
    root - h,
  );
  p.outline.bezierCurveTo(
    x + w * 0.2,
    root - h,
    x + w * 0.32,
    root - h * 0.25,
    x + w / 2,
    root,
  );
  p.outline.closePath();
  for (let k = 0; k < 40; k += 1) {
    const f = rng();
    const gx = x + (f - 0.5) * w * 0.9;
    const t = 1 - Math.abs(f - 0.5) * 2;
    const gy = root - h * Math.min(1, t * 1.35) + h * 0.04;
    p.moss.moveTo(gx, gy);
    p.moss.lineTo(gx + h * 0.02, gy - h * 0.05);
  }
};

const lengthsOf = (points: readonly Point[]): number[] => {
  let total = 0;
  return points.map((pt, i) => {
    if (i)
      total += Math.hypot(pt[0] - points[i - 1]![0], pt[1] - points[i - 1]![1]);
    return total;
  });
};

const build = (spec: RuinSpec, box: Box, seed: number): Ruin => {
  const rng = random(seed);
  const unit = box.projection / spec.z;
  const root = box.horizon + unit - (spec.lift ?? 0) * unit;
  const x =
    spec.wx === undefined
      ? spec.x * box.boxWidth
      : box.boxWidth / 2 + spec.wx * unit;
  const h = spec.height * unit;
  const w = spec.width * unit;
  const p = parts();
  if (spec.kind === 'plaza') plaza(p, box, spec, rng);
  else if (spec.kind === 'column')
    column(p, x, root, h, w, spec.broken ?? false, rng, spec.vine ?? false);
  else if (spec.kind === 'colonnade')
    colonnade(p, x, root, h, w, spec.count ?? 3, spec.broken ?? false, rng);
  else if (spec.kind === 'arch')
    arch(p, x, root, h, w, spec.broken ?? false, rng, spec.vine ?? false);
  else if (spec.kind === 'wall') wall(p, x, root, h, w, rng);
  else if (spec.kind === 'slab') slab(p, x, root, h, w, rng);
  else if (spec.kind === 'sidewall') sidewall(p, box, spec, rng);
  else if (spec.kind === 'hill') hill(p, x, root, h, w, rng);
  else if (spec.kind === 'block') block(p, x, root, h, w, rng);
  else if (spec.kind === 'steps') steps(p, x, root, h, w, rng);
  else if (spec.kind === 'fallen') fallen(p, x, root, h, w, rng);
  else if (spec.kind === 'rubble') rubble(p, x, root, h, w, rng);
  else if (spec.kind === 'tower')
    tower(p, x, root, h, w, rng, spec.broken ?? false);
  else if (spec.kind === 'stepped') stepped(p, x, root, h, w, rng);
  else if (spec.kind === 'tree') tree(p, x, root, h, w, rng);
  else if (spec.kind === 'house')
    house(p, x, root, h, w, rng, spec.broken ?? false);
  else if (spec.kind === 'aqueduct') aqueduct(p, x, root, h, w, rng);
  else if (spec.kind === 'monolith')
    monolith(p, x, root, h, w, rng, spec.vine ?? false);
  const size = unit / box.referenceProjection;
  return {
    z: spec.order ?? spec.z,
    x,
    back: p.back,
    dark: p.dark,
    light: p.light,
    moss: p.moss,
    ground: p.ground,
    cast: p.cast,
    feet: p.feet.length
      ? p.feet.map(([fx, fz, fs]) => [fx, fz || spec.z, fs] as const)
      : [[x, spec.z, w / 2]],
    deep: p.deep,
    shade: p.shade,
    lit: p.lit,
    outline: p.outline,
    carve: p.carve,
    hatch: p.hatch,
    shadow: p.shadow,
    tufts: p.tufts,
    vines: p.vines.map((points) => ({ points, lengths: lengthsOf(points) })),
    lineWidth: STALK_WIDTH.min + size * STALK_WIDTH.bySize,
    alpha:
      (spec.z > RUIN_LINE.farFrom ? RUIN_LINE.farShare : 1) *
      Math.min(
        RUIN_LINE.maxAlpha,
        STEM_ALPHA.base +
          Math.sqrt(
            1 / (spec.kind === 'plaza' ? (spec.near ?? spec.z) * 1.6 : spec.z),
          ) *
            STEM_ALPHA.byScale +
          RUIN_LINE.lift,
      ),
  };
};

/* Narrow frames drop the ruins marked `wide`, so a phone is not a wall of stone. */
export const buildRuins = (
  box: Box,
  narrow: boolean,
  specs: readonly RuinSpec[],
): Ruin[] =>
  specs
    .map((spec, i) => ({ spec, i }))
    .filter(({ spec }) => !(narrow && spec.wide))
    .map(({ spec, i }) => build(spec, box, 9001 + i * 97))
    .sort((a, b) => b.z - a.z);

/* Five petals round a centre in the bud colour; `open` 0 to 1 scales them up from closed. */
export const drawPetals = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  x: number,
  y: number,
  bud: number,
  open: number,
  /** Vine flowers draw at full strength; stem flowers keep their stem's. */
  opaque = false,
): void => {
  const grow = PETAL.closed + (1 - PETAL.closed) * open;
  const spread = PETAL.spread * bud * grow;
  const radius = Math.max(0.8, PETAL.radius * bud * grow);
  const saved = ctx.globalAlpha;
  if (opaque) ctx.globalAlpha = Math.max(saved, PETAL.alpha);
  ctx.fillStyle = palette.flower;
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
  ctx.fill();
  ctx.fillStyle = palette.background;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, radius * 0.6), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = saved;
};

/* Grass in a crack, in the stems' own stroke: a fan of thin blades that sway. */
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

/*
 * One loop: the vines creep up, bud and flower, hold, fade, and grow again.
 * `growth` is the share of each vine grown; `fade` dims it while it withers.
 */
const growthAt = (
  seconds: number,
): { growth: number; fade: number; since: number } => {
  const { grow, hold, wither, rest, head } = VINE_GROWTH;
  const cycle = grow + hold + wither + rest;
  const t = ((seconds % cycle) + cycle) % cycle;
  if (t < grow) {
    const f = t / grow;
    return {
      growth: head + (1 - head) * (1 - (1 - f) * (1 - f)),
      fade: 1,
      since: t,
    };
  }
  if (t < grow + hold) return { growth: 1, fade: 1, since: t };
  if (t < grow + hold + wither)
    return { growth: 1, fade: 1 - (t - grow - hold) / wither, since: t };
  return { growth: head, fade: 0, since: 0 };
};

const drawVine = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  vine: Vine,
  lineWidth: number,
  alpha: number,
  seconds: number,
): void => {
  const total = vine.lengths[vine.lengths.length - 1] ?? 0;
  const { growth, fade, since } = growthAt(seconds);
  if (fade <= 0) return;
  const reach = total * growth;
  /* Seconds since the tip passed `at`, from the inverse of the ease in `growthAt`. */
  const grownFor = (at: number): number => {
    const share = Math.max(
      0,
      (at / total - VINE_GROWTH.head) / (1 - VINE_GROWTH.head),
    );
    const reachedAt =
      VINE_GROWTH.grow * (1 - Math.sqrt(Math.max(0, 1 - share)));
    return since - reachedAt;
  };
  alpha *= fade;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = lineWidth * 0.55;
  ctx.beginPath();
  ctx.moveTo(...vine.points[0]!);
  for (let i = 1; i < vine.points.length && vine.lengths[i]! <= reach; i += 1)
    ctx.lineTo(...vine.points[i]!);
  ctx.stroke();

  const leafEvery = lineWidth * VINE_LEAF.every;
  const nod =
    Math.sin(breezeWave(vine.points[0]![0], 0, seconds) - BUD_NOD.lag) *
    BUD_NOD.amplitude;
  let index = 0;
  for (let at = leafEvery * 0.6; at < reach; at += leafEvery, index += 1) {
    let i = 1;
    while (i < vine.lengths.length - 1 && vine.lengths[i]! < at) i += 1;
    const [ax, ay] = vine.points[i - 1]!;
    const [bx, by] = vine.points[i]!;
    const dir = Math.atan2(by - ay, bx - ax);
    const side = index % 2 ? 1 : -1;
    const opening = Math.max(0, Math.min(1, grownFor(at) / VINE_BUD.swell));
    const every = vine.every ?? VINE_BUD.every;
    const isBud = index % every === every - 1;
    ctx.save();
    ctx.translate(bx, by);
    if (isBud) {
      const bloom = Math.max(
        0,
        Math.min(1, (grownFor(at) - VINE_BUD.swell) / VINE_BUD.opens),
      );
      /* Sizes vary bud to bud, so a vine is not a row of copies. */
      const bud =
        lineWidth *
        VINE_BUD.size *
        (vine.size ?? 1) *
        (0.8 + ((index * 37) % 7) * 0.06);
      ctx.rotate(side * 0.4 + nod);
      ctx.translate(side * bud * 2.5, -bud * 2);
      if (bloom <= 0) {
        ctx.fillStyle = palette.bud;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          2.4 * bud * opening,
          4.2 * bud * opening,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        drawPetals(ctx, palette, 0, 0, bud, bloom, true);
      }
    } else {
      const length = lineWidth * VINE_LEAF.length * opening;
      const width = lineWidth * VINE_LEAF.width * opening;
      ctx.rotate(dir + side * 1.05 + nod * 0.5);
      ctx.fillStyle = palette.subtle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(length * 0.5, -width, length, 0);
      ctx.quadraticCurveTo(length * 0.5, width, 0, 0);
      ctx.fill();
    }
    ctx.restore();
  }
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
    if (ruin.piece.plants)
      drawPlants(ctx, palette, ruin.piece.plants, seconds, lineWidth);
    for (const tuft of ruin.tufts) drawTuft(ctx, tuft, lineWidth, seconds);
    for (const vine of ruin.vines)
      drawVine(ctx, palette, vine, lineWidth, alpha, seconds);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.floor;
  ctx.fill(ruin.cast);
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.back);
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.outline;
  ctx.stroke(ruin.back);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.outline);
  /* Stone a step off the ground, paler with distance, so ruins read solid. */
  ctx.globalAlpha = Math.min(1, alpha * RUIN_LINE.stone);
  ctx.fillStyle = palette.veil;
  ctx.fill(ruin.outline);
  ctx.globalAlpha = Math.min(1, alpha * RUIN_LINE.stone);
  ctx.fillStyle = palette.floor;
  ctx.fill(ruin.deep);
  ctx.fill(ruin.shade);
  ctx.globalAlpha = 1;
  ctx.globalAlpha = Math.min(1, alpha + RUIN_LINE.darkLift);
  ctx.fillStyle = palette.border;
  ctx.fill(ruin.dark);
  ctx.globalAlpha = RUIN_LINE.lightAlpha;
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.light);

  ctx.globalAlpha = alpha * RUIN_LINE.carveAlpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.carve;
  ctx.stroke(ruin.ground);
  ctx.save();
  ctx.clip(ruin.outline);
  ctx.globalAlpha = RUIN_LINE.litAlpha;
  ctx.strokeStyle = palette.background;
  ctx.lineWidth = lineWidth * RUIN_LINE.carve;
  ctx.stroke(ruin.lit);
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = alpha * RUIN_LINE.hatchAlpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.hatch;
  ctx.stroke(ruin.hatch);
  ctx.globalAlpha = alpha * RUIN_LINE.shadowAlpha;
  ctx.strokeStyle = palette.subtle;
  ctx.lineWidth = lineWidth * RUIN_LINE.carve * 1.3;
  ctx.stroke(ruin.shadow);
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = alpha * RUIN_LINE.carveAlpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.carve;
  ctx.stroke(ruin.carve);
  ctx.restore();

  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.outline;
  ctx.stroke(ruin.outline);

  ctx.globalAlpha = Math.min(1, alpha * 1.1);
  ctx.strokeStyle = palette.bud;
  ctx.lineWidth = lineWidth * RUIN_LINE.moss;
  ctx.stroke(ruin.moss);
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = alpha * 0.9;
  for (const tuft of ruin.tufts) drawTuft(ctx, tuft, lineWidth, seconds);
  for (const vine of ruin.vines)
    drawVine(ctx, palette, vine, lineWidth, alpha, seconds);
  ctx.globalAlpha = 1;
};

/* An authored piece as a ruin, so it paints in depth order among the stems. */
export const pieceRuin = (piece: Piece, box: Box): Ruin => {
  const empty = new Path2D();
  const size = box.projection / piece.z / box.referenceProjection;
  return {
    piece,
    z: piece.z,
    x: 0,
    back: empty,
    dark: empty,
    light: empty,
    moss: empty,
    ground: empty,
    cast: empty,
    deep: empty,
    shade: empty,
    lit: empty,
    outline: empty,
    carve: empty,
    hatch: empty,
    shadow: empty,
    feet: piece.feet,
    tufts: [],
    vines: piece.climbs.map((c) => ({
      points: c.points,
      every: c.every,
      size: c.size,
      lengths: lengthsOf(c.points),
    })),
    lineWidth: STALK_WIDTH.min + size * STALK_WIDTH.bySize,
    alpha: 0.85,
  };
};
