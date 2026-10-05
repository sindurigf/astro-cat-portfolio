/*
 * The ruins among the stems, in the stems' stroke language: an outline, finer
 * carving, finer still weathering hatch, grass tufts in the cracks and vines
 * that climb, bud and flower. Filled with the ground, so a stem behind is hidden
 * and one in front overlaps. Geometry is built once per layout.
 */
import {
  BUD_NOD,
  PETAL,
  RUINS,
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

type Point = readonly [number, number];

interface Tuft {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

interface Vine {
  readonly points: readonly Point[];
  /** Cumulative length at each point. */
  readonly lengths: readonly number[];
}

export interface Ruin {
  readonly z: number;
  readonly x: number;
  readonly back: Path2D;
  readonly dark: Path2D;
  readonly light: Path2D;
  readonly moss: Path2D;
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

/* Where an unbroken `column` of this height and diameter carries its load. */
const capitalTop = (root: number, h: number, w: number): number =>
  root - h + w * 0.03;

/* A beam on column tops: architrave with two fasciae, frieze above it. */
const beam = (
  p: Parts,
  left: number,
  right: number,
  y: number,
  deep: number,
  rng: () => number,
  brokenRight: boolean,
): number => {
  const frieze = deep * 0.8;
  const end = brokenRight ? right - deep * 0.6 : right;
  p.outline.moveTo(left, y);
  chipped(p.outline, [left, y], [left, y - deep - frieze], rng, deep * 0.1, 1);
  chipped(
    p.outline,
    [left, y - deep - frieze],
    [end, y - deep - frieze],
    rng,
    deep * 0.18,
    3,
  );
  if (brokenRight) {
    p.outline.lineTo(end + deep * 0.3, y - deep * 1.1);
    p.outline.lineTo(end - deep * 0.1, y - deep * 0.6);
    p.outline.lineTo(right, y - deep * 0.2);
    p.outline.lineTo(right, y);
  } else p.outline.lineTo(right, y);
  p.outline.closePath();
  p.carve.moveTo(left, y - deep * 0.45);
  p.carve.lineTo(end, y - deep * 0.45);
  p.carve.moveTo(left, y - deep);
  p.carve.lineTo(end, y - deep);
  /* Triglyphs: three grooves every bay. */
  for (let gx = left + deep * 0.6; gx < end - deep * 0.6; gx += deep * 2.2) {
    for (const g of [0, 0.22, 0.44]) {
      p.carve.moveTo(gx + g * deep, y - deep - frieze * 0.1);
      p.carve.lineTo(gx + g * deep, y - deep - frieze * 0.9);
    }
  }
  p.shade.rect(left, y - deep * 0.45, end - left, deep * 0.45);
  weather(
    p.hatch,
    left,
    y - deep - frieze,
    end - left,
    deep + frieze,
    Math.max(1.6, deep * 0.3),
    rng,
  );
  tuft(p, left + (end - left) * 0.7, y - deep - frieze, deep * 1.4, rng);
  return y - deep - frieze;
};

const portico = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  vine: boolean,
): void => {
  const cw = w * 0.15;
  const left = x - w * 0.34;
  const right = x + w * 0.34;
  column(p, left, root, h, cw, false, rng, vine);
  column(p, right, root, h, cw, false, rng, false);
  const y = capitalTop(root, h, cw);
  const top = beam(p, x - w / 2, x + w / 2, y, cw * 0.75, rng, false);
  /* Pediment: the left half stands, the right is broken away. */
  const apex = top - w * 0.2;
  p.outline.moveTo(x - w / 2 - cw * 0.2, top);
  p.outline.lineTo(x, apex);
  p.outline.lineTo(x + w * 0.06, apex + w * 0.05);
  p.outline.lineTo(x + w * 0.02, apex + w * 0.1);
  p.outline.lineTo(x + w * 0.12, apex + w * 0.14);
  p.outline.lineTo(x + w * 0.16, top);
  p.outline.closePath();
  p.carve.moveTo(x - w / 2 + cw * 0.5, top - cw * 0.25);
  p.carve.lineTo(x - cw * 0.1, apex + cw * 0.5);
  p.carve.lineTo(x + w * 0.04, apex + w * 0.08);
  weather(
    p.hatch,
    x - w * 0.3,
    apex,
    w * 0.4,
    top - apex,
    Math.max(1.6, cw * 0.2),
    rng,
  );
  tuft(p, x + w * 0.12, apex + w * 0.14, cw * 1.2, rng);
  tuft(p, x - w * 0.42, top - cw * 0.3, cw, rng);
};

const terrace = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const deck = h * 0.16;
  const left = x - w / 2;
  const right = x + w / 2;
  /* Terrace wall in courses, the stair projecting from its middle. */
  p.outline.moveTo(left, root);
  p.outline.lineTo(left, root - deck);
  chipped(
    p.outline,
    [left, root - deck],
    [right, root - deck],
    rng,
    deck * 0.12,
    4,
  );
  p.outline.lineTo(right, root);
  p.outline.closePath();
  const rows = 3;
  for (let r = 1; r < rows; r += 1) {
    p.carve.moveTo(left, root - (deck * r) / rows);
    p.carve.lineTo(right, root - (deck * r) / rows);
  }
  for (let r = 0; r < rows; r += 1) {
    for (
      let bx = left + (r % 2 ? w * 0.03 : w * 0.06);
      bx < right;
      bx += w * 0.06
    ) {
      p.carve.moveTo(bx, root - (deck * r) / rows);
      p.carve.lineTo(bx, root - (deck * (r + 1)) / rows);
    }
  }
  const stairW = w * 0.3;
  const steps = 6;
  const rise = deck / steps;
  for (let i = 0; i < steps; i += 1) {
    const inset = (stairW * 0.12 * (steps - i)) / steps;
    const y = root - rise * i;
    p.outline.rect(x - stairW / 2 - inset, y - rise, stairW + inset * 2, rise);
    p.lit.moveTo(x - stairW / 2 - inset, y - rise);
    p.lit.lineTo(x + stairW / 2 + inset, y - rise);
    if (i === 2)
      chipped(
        p.carve,
        [x + stairW * 0.2, y - rise],
        [x + stairW * 0.45, y - rise],
        rng,
        rise * 0.4,
        1,
      );
  }
  tuft(p, x - stairW * 0.3, root - rise * 2, rise * 3, rng);
  tuft(p, left + w * 0.1, root - deck, deck * 0.8, rng);
  /* Colonnade along the back edge, one column fallen, its beam broken there. */
  const count = 7;
  const colH = h * 0.62;
  const cw = (w / count) * 0.3;
  const deckTop = root - deck - h * 0.03;
  for (let i = 0; i < count; i += 1) {
    const cx = left + w * 0.06 + (w * 0.88 * i) / (count - 1);
    if (i === count - 2) {
      column(p, cx, deckTop, colH * 0.45, cw, true, rng, false);
      continue;
    }
    column(p, cx, deckTop, colH, cw, false, rng, i === 1);
  }
  const y = capitalTop(deckTop, colH, cw);
  beam(
    p,
    left + w * 0.06 - cw,
    left + w * 0.06 + (w * 0.88 * (count - 3)) / (count - 1) + cw * 1.6,
    y,
    cw * 0.7,
    rng,
    true,
  );
};

/* A ring of columns seen from the front: `back` holds the far half and the step, `front` the near half. */
const tholos = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  half: 'back' | 'front',
): void => {
  const count = 10;
  const rx = w / 2;
  const ry = w * 0.12;
  const cw = w * 0.07;
  const at = (a: number): { cx: number; cy: number; ch: number } => ({
    cx: x + Math.cos(a) * rx,
    cy: root + Math.sin(a) * ry,
    ch: h * (1 + Math.sin(a) * 0.08),
  });
  if (half === 'back') {
    p.outline.ellipse(
      x,
      root + ry * 0.2,
      rx * 1.12,
      ry * 1.5,
      0,
      0,
      Math.PI * 2,
    );
    p.carve.ellipse(x, root, rx * 1.04, ry * 1.25, 0, 0, Math.PI * 2);
  }
  const angles = Array.from(
    { length: count },
    (_, i) => (i / count) * Math.PI * 2 + Math.PI / count + Math.PI / 2,
  )
    .filter((a) => (half === 'back' ? Math.sin(a) < 0 : Math.sin(a) >= 0))
    .sort((a, b) => Math.sin(a) - Math.sin(b));
  angles.forEach((a, i) => {
    const { cx, cy, ch } = at(a);
    const broken = half === 'front' ? i % 2 === 1 : i === 1;
    column(
      p,
      cx,
      cy,
      broken ? ch * (0.4 + (i % 3) * 0.12) : ch,
      cw * (1 + Math.sin(a) * 0.06),
      broken,
      rng,
      half === 'front' && i === 0,
    );
  });
  /* Entablature: a curved band over the standing columns of each half. */
  const band = (from: number, to: number): void => {
    const deep = cw * 0.9;
    const steps = 24;
    const top: Point[] = [];
    for (let k = 0; k <= steps; k += 1) {
      const a = from + ((to - from) * k) / steps;
      const { cx, cy, ch } = at(a);
      top.push([cx, capitalTop(cy, ch, cw)]);
    }
    p.outline.moveTo(top[0]![0], top[0]![1]);
    top.forEach(([tx, ty]) =>
      p.outline.lineTo(tx, ty - deep - (rng() < 0.15 ? deep * 0.2 : 0)),
    );
    for (let k = top.length - 1; k >= 0; k -= 1)
      p.outline.lineTo(top[k]![0], top[k]![1]);
    p.outline.closePath();
    p.carve.moveTo(top[0]![0], top[0]![1] - deep * 0.45);
    top.forEach(([tx, ty]) => p.carve.lineTo(tx, ty - deep * 0.45));
    tuft(
      p,
      top[Math.floor(steps / 2)]![0],
      top[Math.floor(steps / 2)]![1] - deep,
      deep * 1.5,
      rng,
    );
  };
  if (half === 'back') band(Math.PI * 1.08, Math.PI * 1.9);
  else band(Math.PI * 0.08, Math.PI * 0.3);
};

/* A long coursed wall with a doorway and a fallen right end. */
const wallgate = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
): void => {
  const left = x - w / 2;
  const right = x + w / 2;
  const rows = 6;
  const course = h / rows;
  const doorX = x + w * 0.2;
  const doorW = w * 0.08;
  const doorH = h * 0.78;
  const fall = x + w * 0.31;
  const profile = (bx: number): number => {
    if (bx < fall) return h;
    const f = (bx - fall) / (right - fall);
    return Math.max(course, Math.round((h * (1 - f * 0.8)) / course) * course);
  };
  p.outline.moveTo(left, root);
  p.outline.lineTo(left, root - h * 0.9);
  chipped(
    p.outline,
    [left, root - h * 0.9],
    [left + w * 0.06, root - h],
    rng,
    course * 0.3,
    1,
  );
  chipped(
    p.outline,
    [left + w * 0.06, root - h],
    [fall, root - h],
    rng,
    course * 0.25,
    6,
  );
  for (let bx = fall; bx < right; bx += w * 0.03) {
    p.outline.lineTo(bx, root - profile(bx));
    p.outline.lineTo(Math.min(right, bx + w * 0.03), root - profile(bx));
  }
  p.outline.lineTo(right, root);
  p.outline.lineTo(doorX + doorW / 2, root);
  p.outline.lineTo(doorX + doorW / 2, root - doorH);
  p.outline.lineTo(doorX - doorW / 2, root - doorH);
  p.outline.lineTo(doorX - doorW / 2, root);
  p.outline.closePath();
  /* Lintel over the door, one stone wider each side. */
  p.carve.rect(
    doorX - doorW * 0.9,
    root - doorH - course * 1.1,
    doorW * 1.8,
    course * 1.1,
  );
  p.shade.rect(doorX + doorW * 0.25, root - doorH, doorW * 0.25, doorH);
  for (let r = 0; r < rows; r += 1) {
    const y = root - course * r;
    let bx = left + (r % 2 ? w * 0.02 : 0);
    while (bx < right) {
      const bw = w * (0.035 + rng() * 0.03);
      const inDoor =
        bx + bw > doorX - doorW / 2 &&
        bx < doorX + doorW / 2 &&
        course * (r + 1) <= doorH + 0.5;
      if (course * (r + 1) <= profile(bx + bw / 2) + 0.5 && !inDoor) {
        const out = rng() < 0.08 ? course * 0.15 : 0;
        p.carve.moveTo(bx + out, y);
        p.carve.lineTo(bx + out, y - course);
        p.carve.lineTo(Math.min(right, bx + bw) + out, y - course);
        if (rng() < 0.1)
          crack(p.hatch, bx + bw * 0.5, y - course, course * 0.9, rng);
      }
      bx += bw;
    }
  }
  weather(p.hatch, left, root - h, w, h, Math.max(1.6, course * 0.35), rng);
  for (let k = 0; k < 5; k += 1)
    tuft(
      p,
      left + w * (0.08 + k * 0.2),
      root - (k % 2 ? 0 : profile(left + w * (0.08 + k * 0.2))),
      course * 1.6,
      rng,
    );
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

/* Moss along a top edge: short fine strokes that droop over the lip. */
const mossCap = (
  p: Parts,
  x0: number,
  x1: number,
  y: number,
  size: number,
  rng: () => number,
): void => {
  const step = Math.max(1.2, size * 0.18);
  for (let x = x0; x < x1; x += step * (0.6 + rng() * 0.8)) {
    const up = size * (0.15 + rng() * 0.35);
    const lean = (rng() - 0.5) * size * 0.3;
    p.moss.moveTo(x, y + size * 0.05);
    p.moss.quadraticCurveTo(x + lean * 0.3, y - up * 0.6, x + lean, y - up);
    if (rng() < 0.35) {
      const drop = size * (0.3 + rng() * 0.7);
      p.moss.moveTo(x, y);
      p.moss.quadraticCurveTo(
        x + size * 0.1,
        y + drop * 0.5,
        x + (rng() - 0.5) * size * 0.2,
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

/* Post and lintel: two posts with banded capitals; the lintel sits on them or lies fallen. */
const trilithon = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  fallen: boolean,
): void => {
  const pw = w * 0.2;
  const posts = [x - w * 0.36, x + w * 0.36];
  const lintel = h * 0.16;
  posts.forEach((px, i) => {
    const ph = fallen && i === 1 ? h * 0.55 : h - lintel;
    p.outline.moveTo(px - pw / 2, root);
    p.outline.lineTo(px - pw * 0.46, root - ph);
    p.outline.lineTo(px - pw * 0.62, root - ph - pw * 0.1);
    p.outline.lineTo(px - pw * 0.62, root - ph - pw * 0.32);
    chipped(
      p.outline,
      [px - pw * 0.62, root - ph - pw * 0.32],
      [px + pw * 0.62, root - ph - pw * 0.32],
      rng,
      pw * 0.1,
      1,
    );
    p.outline.lineTo(px + pw * 0.62, root - ph - pw * 0.1);
    p.outline.lineTo(px + pw * 0.46, root - ph);
    p.outline.lineTo(px + pw / 2, root);
    p.outline.closePath();
    for (const b of [0.06, 0.12]) {
      p.carve.moveTo(px - pw * 0.48, root - ph + ph * b);
      p.carve.lineTo(px + pw * 0.48, root - ph + ph * b);
    }
    p.shade.rect(px + pw * 0.1, root - ph, pw * 0.4, ph);
    crack(p.carve, px - pw * 0.1, root - ph * 0.7, ph * 0.3, rng);
    weather(
      p.hatch,
      px - pw / 2,
      root - ph,
      pw,
      ph,
      Math.max(1.6, pw * 0.15),
      rng,
    );
    tuft(p, px - pw * 0.6, root, pw * 1.2, rng);
    if (!(fallen && i === 1))
      mossCap(
        p,
        px - pw * 0.62,
        px + pw * 0.62,
        root - ph - pw * 0.32,
        pw * 0.5,
        rng,
      );
  });
  if (fallen) {
    /* The lintel slid off the broken post and leans to the ground. */
    const a = -0.38;
    stone(p, x + w * 0.05, root, w * 1.0, lintel, a, rng, false);
  } else {
    const top = root - h;
    stone(p, x, top + lintel + w * 0.04, w * 1.08, lintel, 0, rng, false);
    hang(p, x + w * 0.2, top + lintel, h * 0.35, rng);
  }
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

/* The monolith: a near-cube of dark stone; the face carved, the crown lit, moss on top. */
const monolith = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  vine: boolean,
): void => {
  const depth = w * 0.24;
  const dx = depth;
  const dy = -depth * 0.5;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = root - h;
  const front: Point[] = [
    [left, root],
    [left, top],
    [right, top],
    [right, root],
  ];
  const crown: Point[] = [
    [left, top],
    [left + dx, top + dy],
    [right + dx, top + dy],
    [right, top],
  ];
  const side: Point[] = [
    [right, top],
    [right + dx, top + dy],
    [right + dx, root + dy],
    [right, root],
  ];
  for (const face of [front, crown, side]) {
    p.outline.moveTo(...face[0]!);
    face.slice(1).forEach((pt) => p.outline.lineTo(...pt));
    p.outline.closePath();
    p.dark.moveTo(...face[0]!);
    face.slice(1).forEach((pt) => p.dark.lineTo(...pt));
    p.dark.closePath();
  }
  p.light.moveTo(...crown[0]!);
  crown.slice(1).forEach((pt) => p.light.lineTo(...pt));
  p.light.closePath();
  p.deep.moveTo(...side[0]!);
  side.slice(1).forEach((pt) => p.deep.lineTo(...pt));
  p.deep.closePath();
  /* Chipped edges catch the light. */
  p.lit.moveTo(left + w * 0.02, root - h * 0.05);
  p.lit.lineTo(left + w * 0.02, top + h * 0.02);
  p.lit.lineTo(right - w * 0.02, top + h * 0.02);
  for (const [cx, cy] of [
    [left + w * 0.7, top],
    [right, top + h * 0.3],
    [left, top + h * 0.55],
  ] as const) {
    p.lit.moveTo(cx - w * 0.03, cy);
    p.lit.lineTo(cx, cy + w * 0.03);
    p.lit.lineTo(cx + w * 0.03, cy);
  }
  /* Glyph rows: a light cut edge with a dark inner shadow. */
  const cols = 6;
  const rows = 7;
  const padX = w * 0.11;
  const padY = h * 0.1;
  const cell = (w - padX * 2) / cols;
  const pitch = (h - padY * 2) / rows;
  const glyph = Math.min(cell, pitch) * 0.6;
  const unit = glyph / 2;
  const cut = Math.max(0.6, glyph * 0.08);
  for (let i = 0; i < cols * rows; i += 1) {
    if (i % 13 === 9) continue;
    const gx = left + padX + (i % cols) * cell + (cell - glyph) / 2;
    const gy = top + padY + Math.floor(i / cols) * pitch + (pitch - glyph) / 2;
    for (const part of GLYPHS[(i * 5 + 1) % GLYPHS.length]!) {
      p.lit.moveTo(gx + part[0]! * unit + cut, gy + part[1]! * unit + cut);
      for (let k = 2; k < part.length; k += 2)
        p.lit.lineTo(
          gx + part[k]! * unit + cut,
          gy + part[k + 1]! * unit + cut,
        );
    }
  }
  crack(p.lit, left + w * 0.72, top + h * 0.02, h * 0.35, rng);
  mossCap(p, left, right + dx, top + dy * 0.5, Math.max(3, w * 0.09), rng);
  tuft(p, left - w * 0.04, root, h * 0.18, rng);
  tuft(p, right + dx * 0.8, root + dy, h * 0.14, rng);
  if (vine) {
    const climb: Point[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const f = i / 40;
      climb.push([
        left + w * 0.04 + Math.sin(f * Math.PI * 4) * w * 0.04,
        root - h * 0.98 * f,
      ]);
    }
    p.vines.push(climb);
    hang(p, right + dx * 0.5, top + dy * 0.5, h * 0.55, rng);
    hang(p, left + w * 0.55, top, h * 0.3, rng);
  }
};

const tablet = (
  p: Parts,
  x: number,
  root: number,
  h: number,
  w: number,
  rng: () => number,
  vine: boolean,
): void => {
  const plinth = h * 0.055;
  const base = root - plinth * 2;
  const top = root - h;
  const r = w * 0.44;
  const bevel = w * 0.045;

  /* Two-step plinth with chamfered top edges. */
  p.outline.moveTo(x - w * 0.72, root);
  p.outline.lineTo(x - w * 0.72, root - plinth * 0.8);
  p.outline.lineTo(x - w * 0.68, root - plinth);
  chipped(
    p.outline,
    [x - w * 0.68, root - plinth],
    [x + w * 0.76, root - plinth],
    rng,
    plinth * 0.25,
    3,
  );
  p.outline.lineTo(x + w * 0.8, root - plinth * 0.8);
  p.outline.lineTo(x + w * 0.8, root);
  p.outline.closePath();
  p.outline.moveTo(x - w * 0.62, root - plinth);
  p.outline.lineTo(x - w * 0.62, base + plinth * 0.2);
  p.outline.lineTo(x - w * 0.58, base);
  p.outline.lineTo(x + w * 0.66, base);
  p.outline.lineTo(x + w * 0.7, base + plinth * 0.2);
  p.outline.lineTo(x + w * 0.7, root - plinth);
  p.outline.closePath();
  p.carve.moveTo(x - w * 0.68, root - plinth * 0.8);
  p.carve.lineTo(x + w * 0.76, root - plinth * 0.8);

  /*
   * The slab as a solid: its face, and the same outline set back up and to the
   * right, which shows the crown (lit) and the right side (in shade).
   */
  const depth = w * 0.17;
  const dx = depth;
  const dy = -depth * 0.55;
  const slab = (ox: number, oy: number, chips: boolean): Path2D => {
    const path = new Path2D();
    path.moveTo(x - w / 2 + ox, base + oy);
    path.lineTo(x - w / 2 + ox, top + r + oy);
    path.bezierCurveTo(
      x - w / 2 + ox,
      top + r * 0.3 + oy,
      x - w * 0.28 + ox,
      top + oy,
      x + ox,
      top + oy,
    );
    if (chips) {
      path.lineTo(x + w * 0.1, top + h * 0.006);
      path.lineTo(x + w * 0.16, top + h * 0.045);
      path.lineTo(x + w * 0.21, top + h * 0.02);
      path.lineTo(x + w * 0.26, top + h * 0.03);
      path.bezierCurveTo(
        x + w * 0.42,
        top + h * 0.08,
        x + w / 2,
        top + r * 0.6,
        x + w / 2,
        top + r,
      );
    } else {
      path.bezierCurveTo(
        x + w * 0.28 + ox,
        top + oy,
        x + w / 2 + ox,
        top + r * 0.3 + oy,
        x + w / 2 + ox,
        top + r + oy,
      );
    }
    path.lineTo(x + w / 2 + ox, base + oy);
    path.closePath();
    return path;
  };
  const face = slab(0, 0, true);
  p.back.addPath(slab(dx, dy, false));
  p.back.moveTo(x - w * 0.36, top + r * 0.22);
  p.back.lineTo(x - w * 0.36 + dx, top + r * 0.22 + dy);
  p.back.moveTo(x + w / 2, top + r);
  p.back.lineTo(x + w / 2 + dx, top + r + dy);
  p.back.moveTo(x + w / 2, base);
  p.back.lineTo(x + w / 2 + dx, base + dy);
  p.deep.moveTo(x + w / 2, base);
  p.deep.lineTo(x + w / 2, top + r);
  p.deep.lineTo(x + w / 2 + dx, top + r + dy);
  p.deep.lineTo(x + w / 2 + dx, base + dy);
  p.deep.closePath();
  p.outline.addPath(face);
  p.shade.addPath(face);
  for (let y = top + r + depth; y < base; y += Math.max(1.8, depth * 0.16)) {
    p.hatch.moveTo(x + w / 2 + dx * 0.12, y + dy * 0.1);
    p.hatch.lineTo(x + w / 2 + dx * 0.88, y + dy * 0.9);
  }

  /* Chamfer: an inner outline joined to the corners. */
  const inset = bevel;
  p.carve.moveTo(x - w / 2 + inset, base - inset * 0.4);
  p.carve.lineTo(x - w / 2 + inset, top + r + inset * 0.3);
  p.carve.bezierCurveTo(
    x - w / 2 + inset,
    top + r * 0.38 + inset,
    x - w * 0.26,
    top + inset,
    x,
    top + inset,
  );
  p.carve.bezierCurveTo(
    x + w * 0.26,
    top + inset,
    x + w / 2 - inset,
    top + r * 0.38 + inset,
    x + w / 2 - inset,
    top + r + inset * 0.3,
  );
  p.carve.lineTo(x + w / 2 - inset, base - inset * 0.4);
  p.carve.moveTo(x - w / 2, base);
  p.carve.lineTo(x - w / 2 + inset, base - inset * 0.4);
  p.carve.moveTo(x + w / 2, base);
  p.carve.lineTo(x + w / 2 - inset, base - inset * 0.4);

  /* A panel recessed for the text, with its shadowed upper and left edges. */
  const panelLeft = x - w / 2 + inset * 2.6;
  const panelRight = x + w / 2 - inset * 2.6;
  const panelTop = top + r * 0.78;
  const panelBottom = base - h * 0.08;
  p.carve.moveTo(panelLeft, panelBottom);
  p.carve.lineTo(panelLeft, panelTop);
  p.carve.lineTo(panelRight, panelTop);
  p.carve.lineTo(panelRight, panelBottom);
  p.carve.lineTo(panelLeft, panelBottom);
  p.lit.moveTo(x - w / 2 + inset * 0.45, base - inset * 0.5);
  p.lit.lineTo(x - w / 2 + inset * 0.45, top + r);
  p.lit.bezierCurveTo(
    x - w / 2 + inset * 0.45,
    top + r * 0.35,
    x - w * 0.27,
    top + inset * 0.45,
    x,
    top + inset * 0.45,
  );
  p.lit.moveTo(panelLeft, panelBottom - inset * 0.3);
  p.lit.lineTo(panelRight - inset * 0.3, panelBottom - inset * 0.3);
  p.lit.lineTo(panelRight - inset * 0.3, panelTop);
  p.shadow.moveTo(panelLeft + inset * 0.35, panelBottom);
  p.shadow.lineTo(panelLeft + inset * 0.35, panelTop + inset * 0.35);
  p.shadow.lineTo(panelRight, panelTop + inset * 0.35);

  const cols = 5;
  const rows = 7;
  const cell = (panelRight - panelLeft) / cols;
  const pitch = (panelBottom - panelTop) / rows;
  const glyph = Math.min(cell, pitch) * 0.56;
  const unit = glyph / 2;
  const cut = Math.max(0.6, glyph * 0.07);
  for (let i = 0; i < cols * rows; i += 1) {
    if (i % 11 === 7) continue;
    const gx = panelLeft + (i % cols) * cell + (cell - glyph) / 2;
    const gy = panelTop + Math.floor(i / cols) * pitch + (pitch - glyph) / 2;
    for (const part of GLYPHS[(i * 7 + 3) % GLYPHS.length]!) {
      p.carve.moveTo(gx + part[0]! * unit, gy + part[1]! * unit);
      p.shadow.moveTo(gx + part[0]! * unit + cut, gy + part[1]! * unit + cut);
      p.lit.moveTo(gx + part[0]! * unit - cut, gy + part[1]! * unit - cut);
      for (let k = 2; k < part.length; k += 2) {
        p.carve.lineTo(gx + part[k]! * unit, gy + part[k + 1]! * unit);
        p.shadow.lineTo(
          gx + part[k]! * unit + cut,
          gy + part[k + 1]! * unit + cut,
        );
        p.lit.lineTo(
          gx + part[k]! * unit - cut,
          gy + part[k + 1]! * unit - cut,
        );
      }
    }
  }

  crack(p.carve, x + w * 0.16, top + h * 0.05, h * 0.3, rng);
  crack(p.hatch, x - w * 0.36, base - h * 0.32, h * 0.2, rng);
  weather(
    p.hatch,
    x - w / 2 + inset,
    top + r * 0.4,
    w * 0.3,
    h * 0.25,
    Math.max(1.6, w * 0.035),
    rng,
  );
  tuft(p, x - w * 0.6, root - plinth, h * 0.12, rng);
  tuft(p, x + w * 0.64, base, h * 0.1, rng);
  tuft(p, x + w * 0.14, top + h * 0.03, h * 0.07, rng);

  if (vine) {
    const left: Point[] = [];
    for (let i = 0; i <= 50; i += 1) {
      const f = i / 50;
      const y = base - (base - (top + r * 0.6)) * f;
      left.push([
        x - w / 2 + Math.sin(f * Math.PI * 4.5) * inset * 1.6 + inset * 0.4,
        y,
      ]);
    }
    for (let i = 1; i <= 16; i += 1) {
      const f = i / 16;
      left.push([
        x - w / 2 + w * 0.3 * f,
        top +
          r * 0.6 -
          r * 0.55 * Math.sin(f * Math.PI * 0.5) +
          Math.sin(f * 9) * inset * 0.5,
      ]);
    }
    p.vines.push(left);
    const right: Point[] = [];
    for (let i = 0; i <= 36; i += 1) {
      const f = i / 36;
      right.push([
        x + w / 2 + dx * 0.5 + Math.sin(f * Math.PI * 3.5) * dx * 0.4,
        base + dy * 0.5 * f - (base - top - r) * 0.85 * f,
      ]);
    }
    p.vines.push(right);
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
  const x = spec.x * box.boxWidth;
  const h = spec.height * unit;
  const w = spec.width * unit;
  const p = parts();
  if (spec.kind === 'column')
    column(p, x, root, h, w, spec.broken ?? false, rng, spec.vine ?? false);
  else if (spec.kind === 'colonnade')
    colonnade(p, x, root, h, w, spec.count ?? 3, spec.broken ?? false, rng);
  else if (spec.kind === 'arch')
    arch(p, x, root, h, w, spec.broken ?? false, rng, spec.vine ?? false);
  else if (spec.kind === 'wall') wall(p, x, root, h, w, rng);
  else if (spec.kind === 'block') block(p, x, root, h, w, rng);
  else if (spec.kind === 'portico')
    portico(p, x, root, h, w, rng, spec.vine ?? false);
  else if (spec.kind === 'terrace') terrace(p, x, root, h, w, rng);
  else if (spec.kind === 'tholos')
    tholos(p, x, root, h, w, rng, spec.half ?? 'back');
  else if (spec.kind === 'wallgate') wallgate(p, x, root, h, w, rng);
  else if (spec.kind === 'tower')
    tower(p, x, root, h, w, rng, spec.broken ?? false);
  else if (spec.kind === 'stepped') stepped(p, x, root, h, w, rng);
  else if (spec.kind === 'trilithon')
    trilithon(p, x, root, h, w, rng, spec.broken ?? false);
  else if (spec.kind === 'tree') tree(p, x, root, h, w, rng);
  else if (spec.kind === 'monolith')
    monolith(p, x, root, h, w, rng, spec.vine ?? false);
  else tablet(p, x, root, h, w, rng, spec.vine ?? false);
  const size = unit / box.referenceProjection;
  return {
    z: spec.order ?? spec.z,
    x,
    back: p.back,
    dark: p.dark,
    light: p.light,
    moss: p.moss,
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
    alpha: Math.min(
      RUIN_LINE.maxAlpha,
      STEM_ALPHA.base +
        Math.sqrt(1 / spec.z) * STEM_ALPHA.byScale +
        RUIN_LINE.lift,
    ),
  };
};

/* Narrow frames drop the ruins marked `wide`, so a phone is not a wall of stone. */
export const buildRuins = (
  box: Box,
  narrow: boolean,
  specs: readonly RuinSpec[] = RUINS,
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
): void => {
  const grow = PETAL.closed + (1 - PETAL.closed) * open;
  const spread = PETAL.spread * bud * grow;
  const radius = Math.max(0.8, PETAL.radius * bud * grow);
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
  ctx.fillStyle = palette.bud;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, radius * 0.75), 0, Math.PI * 2);
  ctx.fill();
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
    const isBud = index % VINE_BUD.every === VINE_BUD.every - 1;
    ctx.save();
    ctx.translate(bx, by);
    if (isBud) {
      const bloom = Math.max(
        0,
        Math.min(1, (grownFor(at) - VINE_BUD.swell) / VINE_BUD.opens),
      );
      const bud = lineWidth * VINE_BUD.size;
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
        drawPetals(ctx, palette, 0, 0, bud, bloom);
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
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.back);
  ctx.fillStyle = palette.veil;
  ctx.fill(ruin.deep);
  ctx.fill(ruin.deep);
  ctx.strokeStyle = palette.border;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth * RUIN_LINE.outline;
  ctx.stroke(ruin.back);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.outline);
  ctx.globalAlpha = Math.min(1, alpha + RUIN_LINE.darkLift);
  ctx.fillStyle = palette.border;
  ctx.fill(ruin.dark);
  ctx.globalAlpha = RUIN_LINE.lightAlpha;
  ctx.fillStyle = palette.background;
  ctx.fill(ruin.light);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.veil;
  ctx.fill(ruin.shade);

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
