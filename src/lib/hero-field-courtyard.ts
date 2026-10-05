import type { HeroPalette } from './hero-field-scene';
/*
 * Authored ruins: hand-placed silhouettes and stone courses in world units
 * (x across from the centre, up from the ground, z depth), projected once per
 * layout. Every stone is an opaque polygon with a tone, so the masonry has
 * value, not just outline. One courtyard, lit by a low sun from behind on the left.
 */

export type Point = readonly [number, number];

/** 0 lit face, 1 mid, 2 shade, 3 a hole where a stone is missing. */
export type Tone = 0 | 1 | 2 | 3;

export interface Stone {
  readonly path: Path2D;
  readonly tone: Tone;
  /** Weathering: pits filled darker, chipped corners filled pale, a hairline crack. */
  readonly wear?: Path2D;
  readonly chips?: Path2D;
  readonly crack?: Path2D;
}

export interface Piece {
  /** Paint order: deeper first. */
  readonly z: number;
  /** 0 back, 1 middle, 2 front: sets line and tone strength. */
  readonly layer: 0 | 1 | 2;
  readonly stones: readonly Stone[];
  readonly outline: Path2D;
  /** Fine lines: cracks, flutes, joints inside a stone. */
  readonly detail: Path2D;
  /** Ground shadow cast by the piece. */
  readonly cast: Path2D;
  /** Where weeds root: screen x, depth, spread in pixels, and optionally how many. */
  readonly feet: ReadonlyArray<readonly [number, number, number, number?]>;
  /** Cut lines: carved script, stroked darker than joints. */
  readonly carve?: Path2D;
  /** 0 to 1: lifts every tone and line toward the ground, for distance. */
  readonly haze?: number;
  /** Extra shade over every stone, for a face turned from the sun. */
  readonly shade?: number;
  /** Sunlit top edges, drawn as a pale rim just inside the outline. */
  readonly lit?: Path2D;
  readonly castAlpha?: number;
  /** Shorter copies of a long cast, stacked so the shadow fades toward its far end. */
  readonly softCast?: readonly Path2D[];
  /** Depth that sets line width, when the piece spans depths (a side wall). */
  readonly lineDepth?: number;
  /** A wash of the ground colour over everything already drawn, inside the outline. */
  readonly mist?: number;
}

export interface View {
  readonly cx: number;
  readonly horizon: number;
  readonly projection: number;
}

type Foot = readonly [number, number, number, number?];

/* Low sun from behind on the left: ground offset per unit of height, so shadows reach toward the viewer. */
/* Each shorter copy adds a share of the shadow, so its far end is the faintest. */
const SOFT_REACH = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44] as const;
const SUN = { dx: 0.95, dz: -0.42, cast: 0.22, shade: 0.09 } as const;
type Map2 = (u: number, up: number) => Point;

const project = (v: View, x: number, up: number, z: number): Point => [
  v.cx + (x * v.projection) / z,
  v.horizon + (v.projection / z) * (1 - up),
];

/* Narrow frames pull wide-set ruins in, so the scene stays on screen. */
const share = (v: View, x: number, z: number): number =>
  Math.min(1, (0.92 * v.cx * z) / v.projection / Math.abs(x));

const polygon = (pts: readonly Point[]): Path2D => {
  const path = new Path2D();
  path.moveTo(...pts[0]!);
  pts.slice(1).forEach((pt) => path.lineTo(...pt));
  path.closePath();
  return path;
};

/* Height of an authored profile at u, linear between its points. */
const heightAt = (profile: readonly Point[], u: number): number => {
  for (let i = 1; i < profile.length; i += 1) {
    const [u0, h0] = profile[i - 1]!;
    const [u1, h1] = profile[i]!;
    if (u <= u1) return h0 + ((h1 - h0) * (u - u0)) / Math.max(1e-6, u1 - u0);
  }
  return profile[profile.length - 1]![1];
};

/* Fixed tone and length sequences: authored, so a wall is the same on every load. */
const TONES: readonly Tone[] = [
  0, 1, 0, 2, 1, 0, 1, 1, 2, 0, 1, 0, 3, 1, 0, 2, 1, 1, 0, 1,
];
const LENGTHS: readonly number[] = [
  0.82, 0.55, 1.1, 0.68, 0.94, 0.6, 1.25, 0.74, 0.5, 0.98,
];

/* Masonry course height, world units. */
const COURSE = 0.26;

/* Pits per stone, cycled: about 1.2 on average. */
const PIT_COUNT = [1, 2, 0, 1, 2, 1, 0, 2, 1, 2] as const;
/* Pit radius as a share of the stone's length and course. */
const PIT = { du: 0.045, dv: 0.13 } as const;

/* Course heights as a share of `course`, so bed lines do not run evenly. */
const COURSE_RUN: readonly number[] = [1, 0.8, 1.18, 0.9, 1.06, 0.74, 1.12];

/* Pits, a chipped corner and a hairline crack for stone n, in shares of its face. */
const weather = (
  map: Map2,
  a: number,
  b: number,
  y0: number,
  y1: number,
  n: number,
  full: boolean,
): Pick<Stone, 'wear' | 'chips' | 'crack'> => {
  const at = (fu: number, fv: number): Point =>
    map(a + (b - a) * fu, y0 + (y1 - y0) * fv);
  const wear = new Path2D();
  const count = PIT_COUNT[n % PIT_COUNT.length]!;
  for (let i = 0; i < count; i += 1) {
    const h = (n * 37 + i * 53) % 100;
    /* Most wear sits on an arris or a joint; the rest is spread over the face. */
    const edge = h % 3 !== 0;
    const fu = edge && h % 2 ? (h % 4 ? 0.06 : 0.94) : 0.12 + (h % 76) / 100;
    const fv =
      edge && !(h % 2)
        ? h % 5 > 1
          ? 0.9
          : 0.1
        : 0.18 + ((n * 29 + i * 41) % 62) / 100;
    const size = 0.5 + ((n * 13 + i * 7) % 11) / 10;
    const sides = 3 + ((n + i) % 3);
    const pts: Point[] = [];
    for (let k = 0; k < sides; k += 1) {
      const a = (k / sides) * Math.PI * 2 + (((n * 7 + k * 11) % 9) - 4) * 0.12;
      const r = size * (0.6 + ((n * 3 + k * 17 + i) % 7) * 0.1);
      pts.push(
        at(fu + Math.cos(a) * PIT.du * r, fv + Math.sin(a) * PIT.dv * r),
      );
    }
    wear.addPath(polygon(pts));
  }
  if (!full) return { wear };
  const out: { wear: Path2D; chips?: Path2D; crack?: Path2D } = { wear };
  if (n % 5 < 2) {
    const cu = n % 2;
    const cv = (n >> 1) % 2;
    const su = cu ? -1 : 1;
    const sv = cv ? -1 : 1;
    out.chips = polygon([
      at(cu, cv),
      at(cu + su * 0.17, cv),
      at(cu + su * 0.07, cv + sv * 0.16),
      at(cu, cv + sv * 0.42),
    ]);
  }
  if (n % 7 === 3) {
    const crack = new Path2D();
    crack.moveTo(...at(0.32, 1));
    crack.lineTo(...at(0.44, 0.62));
    crack.lineTo(...at(0.37, 0.34));
    crack.lineTo(...at(0.5, 0));
    out.crack = crack;
  }
  return out;
};

interface Masonry {
  readonly stones: Stone[];
  readonly outline: Path2D;
}

/*
 * A wall face from u0 to u1 under an authored top profile, in courses of
 * `course`. Each stone's top follows the profile exactly, profile vertices
 * included, so no course rises above the broken edge.
 */
const masonry = (
  map: Map2,
  profile: readonly Point[],
  u0: number,
  u1: number,
  course: number,
  unit: number,
  shift: number,
): Masonry => {
  const top = (u: number): number => heightAt(profile, u);
  const edge: Point[] = [map(u0, 0)];
  const inside = profile.filter(([u]) => u > u0 && u < u1).map(([u]) => u);
  [u0, ...inside, u1].forEach((u) => edge.push(map(u, top(u))));
  edge.push(map(u1, 0));
  const stones: Stone[] = [];
  const peak = Math.max(...profile.map(([, h]) => h));
  let index = shift;
  let y0 = 0;
  for (let row = 0; y0 < peak; row += 1) {
    const y1 = y0 + course * COURSE_RUN[row % COURSE_RUN.length]!;
    let u = u0 - (row % 2) * unit * 0.45;
    while (u < u1) {
      const a = Math.max(u0, u);
      const b = Math.min(
        u1,
        u + LENGTHS[(index * 3 + row) % LENGTHS.length]! * unit,
      );
      u = b;
      index += 1;
      if (b - a < unit * 0.08) continue;
      if (top(a) <= y0 && top(b) <= y0) continue;
      const cut = [a, ...inside.filter((p) => p > a && p < b), b];
      const pts: Point[] = [map(a, y0)];
      cut.forEach((p) => pts.push(map(p, Math.max(y0, Math.min(y1, top(p))))));
      pts.push(map(b, y0));
      const tone = TONES[index % TONES.length]!;
      stones.push({
        path: polygon(pts),
        tone,
        ...(tone !== 3
          ? weather(
              map,
              a,
              b,
              y0,
              Math.min(y1, top((a + b) / 2)),
              index,
              top(a) >= y1 && top(b) >= y1,
            )
          : {}),
      });
    }
    y0 = y1;
  }
  return { stones, outline: polygon(edge) };
};

/* A rough boulder or a fallen block, lit on its upper left. */
const boulder = (
  v: View,
  x: number,
  z: number,
  w: number,
  h: number,
  tone: Tone,
): Piece => {
  const pts: Point[] = [
    project(v, x - w / 2, 0, z),
    project(v, x - w * 0.45, h * 0.8, z),
    project(v, x - w * 0.1, h, z),
    project(v, x + w * 0.3, h * 0.9, z),
    project(v, x + w / 2, h * 0.5, z),
    project(v, x + w / 2, 0, z),
  ];
  const lit = [
    pts[1]!,
    pts[2]!,
    pts[3]!,
    project(v, x + w * 0.2, h * 0.7, z),
    project(v, x - w * 0.3, h * 0.6, z),
  ];
  const detail = new Path2D();
  detail.moveTo(...project(v, x - w * 0.05, h * 0.95, z));
  detail.lineTo(...project(v, x + w * 0.05, h * 0.5, z));
  return {
    z,
    layer: 2,
    stones: [
      {
        path: polygon(pts),
        tone,
        ...weather(
          (u, up) => project(v, x - w / 2 + u * w, up * h, z),
          0.15,
          0.85,
          0.1,
          0.7,
          Math.round(x * 13 + z * 7) + tone,
          false,
        ),
      },
      { path: polygon(lit), tone: 0 },
    ],
    outline: polygon(pts),
    detail,
    cast: polygon([
      project(v, x - w / 2, 0, z),
      project(v, x + w * 0.9, 0, z * 0.97),
      project(v, x + w / 2, 0, z),
    ]),
    feet: [
      [project(v, x - w / 2, 0, z)[0], z * 0.98, (w * 0.4 * v.projection) / z],
      [project(v, x + w / 2, 0, z)[0], z * 0.98, (w * 0.3 * v.projection) / z],
    ],
  };
};

/* A heap of fallen stones: a few boulders as one piece. */
const heap = (v: View, x: number, z: number, w: number): Piece[] => [
  boulder(v, x - w * 0.25, z * 1.02, w * 0.45, w * 0.22, 1),
  boulder(v, x + w * 0.15, z, w * 0.55, w * 0.3, 0),
  boulder(v, x - w * 0.05, z * 0.97, w * 0.3, w * 0.42, 2),
];

/* A front-facing wall from x0 to x1 at depth z under `profile` (u is x). */
const frontWall = (
  v: View,
  z: number,
  x0: number,
  x1: number,
  profile: readonly Point[],
  layer: 0 | 1 | 2,
  shift: number,
  unit = 1,
): Piece => {
  const map: Map2 = (u, up) => project(v, u, up, z);
  const m = masonry(map, profile, x0, x1, COURSE, unit, shift);
  const feet: Foot[] = [];
  for (let x = x0 + 0.5; x < x1; x += 1.1)
    feet.push([map(x, 0)[0], z, (0.45 * v.projection) / z]);
  const lit = new Path2D();
  lit.moveTo(...map(x0, heightAt(profile, x0)));
  profile
    .filter(([u]) => u > x0 && u < x1)
    .forEach(([u, h]) => lit.lineTo(...map(u, h)));
  lit.lineTo(...map(x1, heightAt(profile, x1)));
  return {
    z,
    layer,
    stones: m.stones,
    outline: m.outline,
    detail: new Path2D(),
    cast: new Path2D(),
    feet,
    lit,
    /* Faces toward the viewer are turned from a sun behind them. */
    shade: SUN.shade * 0.6,
  };
};

/* A side wall in perspective at world x, from depth `near` to `far`; u is 0 near to 1 far. */
const sideWall = (
  v: View,
  x: number,
  near: number,
  far: number,
  profile: readonly Point[],
): Piece => {
  const side = Math.sign(x);
  const zAt = (t: number): number => near * Math.pow(far / near, t);
  const map: Map2 = (t, up) => project(v, x, up, zAt(t));
  const m = masonry(
    (t, up) => map(t, up),
    profile,
    0,
    1,
    COURSE,
    0.07,
    side > 0 ? 5 : 0,
  );
  /* The left wall's face is turned from the sun and reads a tone darker. */
  const stones = m.stones.map((s) =>
    side < 0 && s.tone < 2 ? { ...s, tone: (s.tone + 1) as Tone } : s,
  );
  const top = (t: number): number => heightAt(profile, t);
  const topPts: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    topPts.push(map(t, top(t)));
    inner.push(project(v, x - side * 0.45, top(t), zAt(t)));
  }
  stones.push({ path: polygon([...topPts, ...inner.reverse()]), tone: 0 });
  const cast: Point[] = [];
  for (let i = 0; i <= 20; i += 1) cast.push(map(i / 20, 0));
  for (let i = 20; i >= 0; i -= 1)
    cast.push(project(v, x - side * top(i / 20) * 0.5, 0, zAt(i / 20)));
  const feet: Foot[] = [];
  for (let t = 0.05; t < 1; t += 0.13)
    feet.push([
      project(v, x - side * 0.1, 0, zAt(t))[0],
      zAt(t),
      (0.4 * v.projection) / zAt(t),
    ]);
  const lit = new Path2D();
  lit.moveTo(...topPts[0]!);
  topPts.slice(1).forEach((pt) => lit.lineTo(...pt));
  return {
    z: far + 0.01,
    lineDepth: near * 1.8,
    layer: 1,
    stones,
    outline: m.outline,
    detail: new Path2D(),
    cast: polygon(cast),
    feet,
    lit,
    ...(side < 0 ? { shade: SUN.shade } : {}),
  };
};

/* An invented script: strokes on a 3 by 3 grid, not any real or fictional alphabet. */
const SCRIPT: readonly (readonly (readonly number[])[])[] = [
  [
    [0, 0, 2, 0],
    [1, 0, 1, 2],
  ],
  [[0, 2, 1, 0, 2, 2]],
  [[0, 0, 0, 2, 2, 2]],
  [
    [0, 1, 2, 1],
    [1, 0, 1, 1],
  ],
  [[2, 0, 0, 1, 2, 2]],
  [
    [0, 0, 2, 2],
    [0, 2, 1, 1],
  ],
  [[0, 0, 2, 0, 2, 2]],
  [
    [1, 0, 1, 2],
    [0, 2, 2, 2],
  ],
  [
    [0, 0, 1, 1, 2, 0],
    [1, 1, 1, 2],
  ],
  [[0, 1, 1, 0, 2, 1, 1, 2]],
];

/*
 * The poneglyph: one perfectly cut block among broken masonry. A near-cube in
 * the masonry's own tones, crisp edges, its front covered in tight rows of
 * script cut in as shade lines. `plinth` sets it on a low base.
 */
const poneglyph = (
  v: View,
  x: number,
  z: number,
  h: number,
  w: number,
  plinth: boolean,
): Piece[] => {
  const base = plinth ? h * 0.12 : 0;
  const d = w * 0.42;
  const dx = d * 0.62;
  const dy = d * 0.34;
  const left = x - w / 2;
  const right = x + w / 2;
  const p = (px: number, up: number): Point => project(v, px, up, z);
  const stones: Stone[] = [];
  const outline = new Path2D();
  /* The plinth is its own piece behind the block, so its edges never cross the face. */
  const plinthStones: Stone[] = [];
  const plinthOutline = new Path2D();
  if (plinth) {
    const pl = w * 0.22;
    const front = polygon([
      p(left - pl, 0),
      p(left - pl, base),
      p(right + pl, base),
      p(right + pl, 0),
    ]);
    const top = polygon([
      p(left - pl, base),
      p(left - pl + dx * 1.3, base + dy * 1.3),
      p(right + pl + dx * 1.3, base + dy * 1.3),
      p(right + pl, base),
    ]);
    const side = polygon([
      p(right + pl, 0),
      p(right + pl, base),
      p(right + pl + dx * 1.3, base + dy * 1.3),
      p(right + pl + dx * 1.3, dy * 1.3),
    ]);
    plinthStones.push(
      { path: front, tone: 1 },
      { path: top, tone: 0 },
      { path: side, tone: 2 },
    );
    [front, top, side].forEach((f) => plinthOutline.addPath(f));
  }
  const front = polygon([
    p(left, base),
    p(left, base + h),
    p(right, base + h),
    p(right, base),
  ]);
  const top = polygon([
    p(left, base + h),
    p(left + dx, base + h + dy),
    p(right + dx, base + h + dy),
    p(right, base + h),
  ]);
  const side = polygon([
    p(right, base),
    p(right, base + h),
    p(right + dx, base + h + dy),
    p(right + dx, base + dy),
  ]);
  stones.push(
    { path: side, tone: 2 },
    { path: top, tone: 0 },
    { path: front, tone: 1 },
  );
  [front, top, side].forEach((f) => outline.addPath(f));
  /* Script: tight rows filling the face inside a narrow margin. */
  const carve = new Path2D();
  const margin = w * 0.07;
  const cols = 11;
  const rows = Math.round((cols * h) / w);
  const cw = (w - margin * 2) / cols;
  const ch = (h - margin * 2) / rows;
  const g = Math.min(cw, ch) * 0.62;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const glyph = SCRIPT[(r * 7 + c * 3 + ((r * c) % 5)) % SCRIPT.length]!;
      const gx = left + margin + c * cw + (cw - g) / 2;
      const gy = base + h - margin - r * ch - (ch - g) / 2;
      for (const stroke of glyph) {
        carve.moveTo(
          ...p(gx + (stroke[0]! * g) / 2, gy - (stroke[1]! * g) / 2),
        );
        for (let k = 2; k < stroke.length; k += 2)
          carve.lineTo(
            ...p(gx + (stroke[k]! * g) / 2, gy - (stroke[k + 1]! * g) / 2),
          );
      }
    }
  }
  const block: Piece = {
    z,
    layer: 2,
    stones,
    outline,
    detail: new Path2D(),
    carve,
    cast: polygon([
      p(left - 0.1, 0),
      p(right + dx + h * 0.35, 0),
      p(right + dx, dy),
    ]),
    feet: [
      [p(left - 0.3, 0)[0], z * 0.98, (0.5 * v.projection) / z],
      [p(right + 0.4, 0)[0], z * 0.98, (0.45 * v.projection) / z],
    ],
  };
  if (!plinth) return [block];
  return [
    block,
    {
      z: z + 0.02,
      layer: 2,
      stones: plinthStones,
      outline: plinthOutline,
      detail: new Path2D(),
      cast: new Path2D(),
      feet: [],
    },
  ];
};

/* A broken tower: a narrow tall run of masonry with a jagged top. */
/* Courses lost from the top, per stone-width step: the top breaks stone by stone. */
const TOWER_LOSS = [0, 1, 0, 2, 1, 3, 1, 2, 4] as const;
const TOWER_STONE = 0.42;

const tower = (
  v: View,
  z: number,
  x: number,
  w: number,
  h: number,
  layer: 0 | 1 | 2,
  shift: number,
): Piece => {
  const slope: readonly Point[] = [
    [x - w / 2, h * 0.92],
    [x - w * 0.2, h],
    [x, h * 0.86],
    [x + w * 0.15, h * 0.95],
    [x + w / 2, h * 0.7],
  ];
  const steps = Math.ceil(w / (TOWER_STONE * 0.55));
  const profile: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const u0 = x - w / 2 + (w * i) / steps;
    const u1 = x - w / 2 + (w * (i + 1)) / steps;
    const lost = TOWER_LOSS[i % TOWER_LOSS.length]!;
    const top =
      (Math.floor(heightAt(slope, (u0 + u1) / 2) / COURSE) - lost) * COURSE;
    profile.push([u0, top], [u1 - 0.001, top]);
  }
  return frontWall(
    v,
    z,
    x - w / 2,
    x + w / 2,
    profile,
    layer,
    shift,
    TOWER_STONE,
  );
};

/*
 * Masonry breaks in steps, not slopes: hold each height across its run, drop
 * near-vertically to the next, with a small chip at each drop.
 */
const stepped = (pts: readonly Point[]): Point[] => {
  const out: Point[] = [];
  pts.forEach(([u, h], i) => {
    const next = pts[i + 1];
    out.push([u, h]);
    if (!next) return;
    const run = next[0] - u;
    out.push(
      [u + run * 0.45, h * (i % 2 ? 0.97 : 1.02)],
      [next[0] - run * 0.04, h],
      [next[0] - run * 0.015, (h + next[1]) / 2 + Math.abs(h - next[1]) * 0.12],
    );
  });
  return out;
};

const LOW_SIDE: readonly Point[] = stepped([
  [0, 0.3],
  [0.1, 0.45],
  [0.18, 0.3],
  [0.3, 0.55],
  [0.42, 0.4],
  [0.55, 0.6],
  [0.7, 0.42],
  [0.85, 0.7],
  [1, 0.5],
]);
/* Sets how many flowering stems grow at each of these pieces' feet. */
const bloom = (pieces: Piece | readonly Piece[], count: number): Piece[] =>
  (Array.isArray(pieces) ? pieces : [pieces]).map((piece: Piece) => ({
    ...piece,
    /* Loose clumps of four to six; `count` 1 is the sparsest. */
    feet: piece.feet.map(
      ([x, z, span]) => [x, z, span, Math.min(6, 3 + count)] as const,
    ),
  }));

/* Single stems in the floor's cracks toward the front, so the lower third is not bare. */
const CRACK_SPOTS: readonly Point[] = [
  [-3.1, 2.1],
  [-1.6, 2.5],
  [-0.4, 1.95],
  [0.9, 2.3],
  [2.2, 2.05],
  [3.3, 2.6],
  [-2.4, 3.1],
  [0.2, 2.9],
];
const cracks = (v: View): Piece => {
  return {
    z: 1.9,
    layer: 2,
    stones: [],
    outline: new Path2D(),
    detail: new Path2D(),
    cast: new Path2D(),
    feet: CRACK_SPOTS.map(([x, z]) => {
      const sx = x * share(v, 3.3, 2.1);
      return [
        project(v, sx, 0, z)[0],
        z,
        (0.05 * v.projection) / z,
        1,
      ] as const;
    }),
  };
};

const TALL_SIDE: readonly Point[] = stepped([
  [0, 1.6],
  [0.15, 2.3],
  [0.3, 2.2],
  [0.45, 2.9],
  [0.6, 2.8],
  [0.75, 2.5],
  [1, 3.0],
]);
const FALLEN_BACK: readonly Point[] = stepped([
  [-6, 2.4],
  [-3, 2.6],
  [-1, 1.4],
  [1, 1.2],
  [3, 0.6],
  [6, 0.5],
]);
type Caster = readonly [number, number, number];

/* Long low-sun shadows: each [x, z, height] along a base casts to x + h·dx, z + h·dz. */
const sunCast = (v: View, pts: readonly Caster[], reach = 1): Path2D => {
  const path = new Path2D();
  for (let i = 1; i < pts.length; i += 1) {
    const [xa, za, ha] = pts[i - 1]!;
    const [xb, zb, hb] = pts[i]!;
    path.addPath(
      polygon([
        project(v, xa, 0, za),
        project(v, xb, 0, zb),
        project(v, xb + hb * reach * SUN.dx, 0, zb + hb * reach * SUN.dz),
        project(v, xa + ha * reach * SUN.dx, 0, za + ha * reach * SUN.dz),
      ]),
    );
  }
  return path;
};

const wallCasters = (
  x: number,
  near: number,
  far: number,
  profile: readonly Point[],
): Caster[] =>
  Array.from({ length: 31 }, (_, i) => {
    const t = i / 30;
    return [x, near * Math.pow(far / near, t), heightAt(profile, t)] as const;
  });

const heapCasters = (x: number, z: number, w: number): Caster[] => [
  [x - w * 0.47, z, w * 0.2],
  [x, z, w * 0.38],
  [x + w * 0.47, z, w * 0.15],
];

/* Swaps the first piece's cast for a long sun shadow. */
const sunlit = (v: View, pieces: readonly Piece[], pts: readonly Caster[]) =>
  pieces.map((piece, i) =>
    i === 0
      ? {
          ...piece,
          cast: new Path2D(),
          castAlpha: SUN.cast,
          softCast: SOFT_REACH.map((reach) => sunCast(v, pts, reach)),
        }
      : piece,
  );

/* Far ruined skylines: [width, height] blocks across the frame, in shares of its width. */
const SKYLINES: ReadonlyArray<{
  z: number;
  haze: number;
  blocks: readonly number[];
}> = [
  {
    z: 16,
    haze: 0.22,
    blocks: [
      0.1, 3.2, 0.06, 6.0, 0.14, 2.2, 0.05, 5.0, 0.12, 2.8, 0.08, 6.8, 0.16,
      2.0, 0.07, 4.6, 0.12, 2.6,
    ],
  },
  {
    z: 26,
    haze: 0.42,
    blocks: [
      0.12, 6.0, 0.08, 10.5, 0.15, 4.4, 0.06, 8.6, 0.18, 6.4, 0.07, 12, 0.14,
      5.0, 0.1, 7.8,
    ],
  },
  {
    z: 40,
    haze: 0.6,
    blocks: [
      0.16, 10, 0.07, 17, 0.2, 7.6, 0.08, 15, 0.17, 9.6, 0.1, 19, 0.22, 8.4,
    ],
  },
];
const MIST = 0.22;
/* Skyline windows, world units: spacing across and up, and size. */
const SKY_WINDOW = { pitch: 1.1, rise: 1.5, width: 0.32, height: 0.6 } as const;

const skyline = (
  v: View,
  z: number,
  haze: number,
  blocks: readonly number[],
): Piece[] => {
  const span = (v.cx * z) / v.projection;
  let total = 0;
  for (let i = 0; i < blocks.length; i += 2) total += blocks[i]!;
  const across = 2.3 / total;
  const top: Point[] = [];
  const stones: Stone[] = [];
  let f = -1.15;
  for (let i = 0; i < blocks.length; i += 2) {
    const w = blocks[i]! * across;
    const h = blocks[i + 1]!;
    const n = i / 2;
    const notch = 0.35 + (n % 3) * 0.25;
    top.push(
      [f, h],
      [f + w * 0.22, h],
      [f + w * 0.24, h - notch],
      [f + w * 0.38, h - notch * 0.8],
      [f + w * 0.4, h * 1.03],
      [f + w * 0.6, h * 1.03],
      [f + w * (n % 2 ? 0.64 : 0.7), h - notch * 2],
      [f + w, h - notch * 1.6],
    );
    const cols = Math.max(1, Math.round((w * span) / SKY_WINDOW.pitch));
    const rows = Math.floor((h - notch * 2) / SKY_WINDOW.rise);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if ((n + r * 2 + c) % 3 === 0) continue;
        const u = f + (w * (c + 0.5)) / cols;
        const half = SKY_WINDOW.width / 2 / span;
        const up = SKY_WINDOW.rise * (r + 0.45);
        stones.push({
          path: polygon(
            [
              [u - half, up],
              [u - half, up + SKY_WINDOW.height],
              [u + half, up + SKY_WINDOW.height],
              [u + half, up],
            ].map(([a, b]) => project(v, a! * span, b!, z)),
          ),
          tone: 3,
        });
      }
    }
    f += w;
  }
  const outline = polygon([
    project(v, -1.15 * span, 0, z),
    ...top.map(([u, h]) => project(v, u * span, h, z)),
    project(v, f * span, 0, z),
  ]);
  const ground = project(v, 0, 0, z - 1)[1];
  return [
    {
      z,
      layer: 0,
      haze,
      stones: [{ path: outline, tone: 1 }, ...stones],
      outline,
      detail: new Path2D(),
      cast: new Path2D(),
      feet: [],
    },
    {
      z: z - 1,
      layer: 0,
      mist: MIST,
      stones: [],
      outline: polygon([
        [0, 0],
        [v.cx * 2, 0],
        [v.cx * 2, ground],
        [0, ground],
      ]),
      detail: new Path2D(),
      cast: new Path2D(),
      feet: [],
    },
  ];
};

const atmosphere = (v: View): Piece[] =>
  SKYLINES.flatMap(({ z, haze, blocks }) => skyline(v, z, haze, blocks));

/* Tall wall and tower left, the poneglyph off-centre right, rubble right; far skylines behind. */
export const scenePieces = (v: View): Piece[] => {
  const k = share(v, 4.4, 2.6);
  const cast = (pieces: readonly Piece[], pts: readonly Caster[]): Piece[] =>
    sunlit(v, pieces, pts);
  return [
    ...atmosphere(v),
    cracks(v),
    frontWall(v, 10, -6, 6, FALLEN_BACK, 0, 2),
    ...cast(
      [tower(v, 8.5, -3.6 * k, 1.3, 4.8, 0, 3)],
      [
        [-3.6 * k - 0.65, 8.5, 4.4],
        [-3.6 * k, 8.5, 4.1],
        [-3.6 * k + 0.65, 8.5, 3.4],
      ],
    ),
    ...cast(
      bloom(sideWall(v, -4.4 * k, 2.6, 10, TALL_SIDE), 4),
      wallCasters(-4.4 * k, 2.6, 10, TALL_SIDE),
    ),
    ...bloom(sideWall(v, 4.4 * k, 2.6, 10, LOW_SIDE), 1),
    ...cast(
      bloom(heap(v, 3.2 * k, 3.2, 1.4), 1),
      heapCasters(3.2 * k, 3.2, 1.4),
    ),
    ...cast(
      bloom(heap(v, 2.6 * k, 5.4, 1.1), 1),
      heapCasters(2.6 * k, 5.4, 1.1),
    ),
    ...cast(bloom(poneglyph(v, 1.35 * k, 3.6, 1.6, 1.5, true), 1), [
      [1.35 * k - 0.75, 3.6, 1.8],
      [1.35 * k + 0.75, 3.6, 1.8],
      [1.35 * k + 1.1, 3.95, 1.8],
    ]),
    ...cast(
      bloom(heap(v, -1.4 * k, 2.3, 0.8), 2),
      heapCasters(-1.4 * k, 2.3, 0.8),
    ),
  ].sort((a, b) => b.z - a.z);
};

/* Tone strength: the line colour over the opaque ground, per tone, then per layer. */
const TONE_ALPHA: Record<Tone, number> = { 0: 0, 1: 0.1, 2: 0.24, 3: 0.62 };
const LAYER = [
  { tone: 0.8, line: 0.52, joint: 0.28 },
  { tone: 0.85, line: 0.68, joint: 0.36 },
  { tone: 1, line: 0.88, joint: 0.38 },
] as const;
const CAST_ALPHA = 0.12;
const STONE_BASE = 0.07;
const WEAR_ALPHA = 0.34;
const LIT_ALPHA = 0.9;

export const drawPiece = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  piece: Piece,
  lineWidth: number,
): void => {
  if (piece.mist) {
    ctx.globalAlpha = piece.mist;
    ctx.fillStyle = palette.background;
    ctx.fill(piece.outline);
    ctx.globalAlpha = 1;
    return;
  }
  const layer = LAYER[piece.layer];
  const clear = 1 - (piece.haze ?? 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = (piece.castAlpha ?? CAST_ALPHA) * layer.tone;
  ctx.fillStyle = palette.border;
  ctx.fill(piece.cast);
  if (piece.softCast) {
    ctx.globalAlpha /= piece.softCast.length;
    piece.softCast.forEach((path) => ctx.fill(path));
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fill(piece.outline);
  ctx.strokeStyle = palette.border;
  for (const stone of piece.stones) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.background;
    ctx.fill(stone.path);
    /* Every stone sits a step off the ground, so even lit faces read as stone. */
    ctx.globalAlpha = (STONE_BASE + (piece.shade ?? 0)) * layer.tone * clear;
    ctx.fillStyle = palette.border;
    ctx.fill(stone.path);
    if (stone.tone) {
      ctx.globalAlpha = TONE_ALPHA[stone.tone] * layer.tone * clear;
      ctx.fill(stone.path);
    }
    if (stone.wear) {
      ctx.globalAlpha = WEAR_ALPHA * layer.tone * clear;
      ctx.fill(stone.wear);
    }
    ctx.lineWidth = lineWidth * 0.4;
    if (stone.crack) {
      ctx.globalAlpha = layer.joint * clear;
      ctx.stroke(stone.crack);
    }
    ctx.globalAlpha = layer.joint * clear;
    ctx.lineWidth = lineWidth * 0.55;
    ctx.stroke(stone.path);
    if (stone.chips) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.background;
      ctx.fill(stone.chips);
      ctx.globalAlpha = layer.joint * clear * 0.8;
      ctx.lineWidth = lineWidth * 0.4;
      ctx.stroke(stone.chips);
    }
  }
  ctx.globalAlpha = layer.joint * clear;
  ctx.lineWidth = lineWidth * 0.5;
  ctx.stroke(piece.detail);
  if (piece.carve) {
    /* Cut, not drawn: a lit lip below each stroke, the shadowed groove above it. */
    ctx.save();
    ctx.translate(lineWidth * 0.3, lineWidth * 0.7);
    ctx.globalAlpha = LIT_ALPHA * clear;
    ctx.strokeStyle = palette.background;
    ctx.lineWidth = lineWidth * 0.6;
    ctx.stroke(piece.carve);
    ctx.restore();
    ctx.strokeStyle = palette.border;
    ctx.globalAlpha = layer.line * 0.85 * clear;
    ctx.lineWidth = lineWidth * 0.45;
    ctx.stroke(piece.carve);
  }
  if (piece.lit) {
    ctx.save();
    ctx.translate(0, lineWidth * 1.2);
    ctx.globalAlpha = LIT_ALPHA;
    ctx.strokeStyle = palette.background;
    ctx.lineWidth = lineWidth * 2.2;
    ctx.stroke(piece.lit);
    ctx.restore();
    ctx.strokeStyle = palette.border;
  }
  ctx.globalAlpha = layer.line * clear;
  ctx.lineWidth = lineWidth * 1.15;
  ctx.stroke(piece.outline);
  ctx.globalAlpha = 1;
};
