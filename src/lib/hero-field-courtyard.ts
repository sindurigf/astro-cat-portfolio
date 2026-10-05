import type { HeroPalette } from './hero-field-scene';
/*
 * Authored ruins: hand-placed silhouettes and stone courses in world units
 * (x across from the centre, up from the ground, z depth), projected once per
 * layout. Every stone is an opaque polygon with a tone, so the masonry has
 * value, not just outline. Five compositions share the same pieces.
 */

export type Point = readonly [number, number];

/** 0 lit face, 1 mid, 2 shade, 3 a hole where a stone is missing. */
export type Tone = 0 | 1 | 2 | 3;

export interface Stone {
  readonly path: Path2D;
  readonly tone: Tone;
}

export interface Climb {
  readonly points: readonly Point[];
  /** Leaves between buds, and bud size as a share of the default. */
  readonly every: number;
  readonly size: number;
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
  /** Where weeds root: screen x, depth, spread in pixels. */
  readonly feet: ReadonlyArray<readonly [number, number, number]>;
  readonly climbs: readonly Climb[];
}

export interface View {
  readonly cx: number;
  readonly horizon: number;
  readonly projection: number;
}

type Foot = readonly [number, number, number];
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

interface Masonry {
  readonly stones: Stone[];
  readonly outline: Path2D;
}

/*
 * A wall face from u0 to u1 under an authored top profile, in courses of
 * `course`. Each stone's top follows the profile exactly, profile vertices
 * included, so no course rises above the broken edge. `skip` cuts openings.
 */
const masonry = (
  map: Map2,
  profile: readonly Point[],
  u0: number,
  u1: number,
  course: number,
  unit: number,
  shift: number,
  skip: (u: number, up: number) => boolean = () => false,
): Masonry => {
  const top = (u: number): number => heightAt(profile, u);
  const edge: Point[] = [map(u0, 0)];
  const inside = profile.filter(([u]) => u > u0 && u < u1).map(([u]) => u);
  [u0, ...inside, u1].forEach((u) => edge.push(map(u, top(u))));
  edge.push(map(u1, 0));
  const stones: Stone[] = [];
  const peak = Math.max(...profile.map(([, h]) => h));
  let index = shift;
  for (let row = 0; row * course < peak; row += 1) {
    const y0 = row * course;
    const y1 = y0 + course;
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
      if (skip((a + b) / 2, (y0 + y1) / 2)) continue;
      const cut = [a, ...inside.filter((p) => p > a && p < b), b];
      const pts: Point[] = [map(a, y0)];
      cut.forEach((p) => pts.push(map(p, Math.max(y0, Math.min(y1, top(p))))));
      pts.push(map(b, y0));
      stones.push({ path: polygon(pts), tone: TONES[index % TONES.length]! });
    }
  }
  return { stones, outline: polygon(edge) };
};

/* A vine along `pts`, budding every `every` leaves at `size` of the default. */
const climb = (points: Point[], every: number, size: number): Climb => ({
  points,
  every,
  size,
});

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
      { path: polygon(pts), tone },
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
    climbs: [],
  };
};

/* A heap of fallen stones: a few boulders as one piece. */
const heap = (v: View, x: number, z: number, w: number): Piece[] => [
  boulder(v, x - w * 0.25, z * 1.02, w * 0.45, w * 0.22, 1),
  boulder(v, x + w * 0.15, z, w * 0.55, w * 0.3, 0),
  boulder(v, x - w * 0.05, z * 0.97, w * 0.3, w * 0.42, 2),
];

/* A toppled column: a lying fluted shaft, the broken end jagged, the cut end its drum face. */
const toppled = (v: View, x: number, z: number, len = 1.6): Piece => {
  const r = 0.2;
  const left = x - len / 2;
  const right = x + len / 2;
  const shaft: Point[] = [
    project(v, left + 0.06, 0, z),
    project(v, left, r * 0.6, z),
    project(v, left + 0.1, r * 1.1, z),
    project(v, left + 0.02, r * 1.6, z),
    project(v, left + 0.12, r * 2, z),
    project(v, right, r * 2, z),
    project(v, right, 0, z),
  ];
  const end = new Path2D();
  const [ex, ey] = project(v, right, r, z);
  const rr = (r * v.projection) / z;
  end.ellipse(ex, ey, rr * 0.4, rr, 0, 0, Math.PI * 2);
  const detail = new Path2D();
  for (const f of [0.3, 0.55, 0.8]) {
    detail.moveTo(...project(v, left + 0.1, r * 2 * f, z));
    detail.lineTo(...project(v, right - 0.05, r * 2 * f, z));
  }
  const outline = polygon(shaft);
  outline.addPath(end);
  return {
    z,
    layer: 2,
    stones: [
      { path: polygon(shaft), tone: 1 },
      {
        path: polygon([
          project(v, left, r * 2, z),
          project(v, right, r * 2, z),
          project(v, right, r * 1.4, z),
          project(v, left, r * 1.4, z),
        ]),
        tone: 0,
      },
      { path: end, tone: 2 },
    ],
    outline,
    detail,
    cast: polygon([
      project(v, left, 0, z),
      project(v, right + 0.3, 0, z * 0.96),
      project(v, right, 0, z),
    ]),
    feet: [
      [project(v, left, 0, z)[0], z * 0.98, (0.3 * v.projection) / z],
      [project(v, x, 0, z)[0], z * 0.98, (0.25 * v.projection) / z],
    ],
    climbs: [],
  };
};

/*
 * A standing column, front-facing: base, fluted shaft lit left and shaded right,
 * a capital, or a jagged broken top. `vine` sets how it is overgrown.
 */
const column = (
  v: View,
  x: number,
  z: number,
  h: number,
  broken: boolean,
  layer: 0 | 1 | 2,
  vine?: Climb['every'],
): Piece => {
  const r = 0.22;
  const base = 0.14;
  const top = broken ? h * 0.92 : h - 0.3;
  const jag: Point[] = broken
    ? [
        [x - r, top - 0.05],
        [x - r * 0.5, top + 0.12],
        [x - r * 0.1, top - 0.02],
        [x + r * 0.35, top + 0.2],
        [x + r, top - 0.1],
      ].map(([px, up]) => project(v, px, up, z))
    : [project(v, x - r * 0.9, top, z), project(v, x + r * 0.9, top, z)];
  const shaft = polygon([
    project(v, x - r, base, z),
    ...jag,
    project(v, x + r, base, z),
  ]);
  const stones: Stone[] = [
    {
      path: polygon([
        project(v, x - r * 1.4, 0, z),
        project(v, x - r * 1.4, base, z),
        project(v, x + r * 1.4, base, z),
        project(v, x + r * 1.4, 0, z),
      ]),
      tone: 1,
    },
    { path: shaft, tone: 1 },
    /* A lit band down the shaft's left, toward the light. */
    {
      path: polygon([
        project(v, x - r * 0.75, base, z),
        project(v, x - r * 0.75, top - 0.12, z),
        project(v, x - r * 0.2, top - 0.12, z),
        project(v, x - r * 0.2, base, z),
      ]),
      tone: 0,
    },
    {
      path: polygon([
        project(v, x + r * 0.35, base, z),
        project(v, x + r * 0.35, top - (broken ? 0.1 : 0), z),
        project(v, x + r, top - 0.1, z),
        project(v, x + r, base, z),
      ]),
      tone: 2,
    },
  ];
  const outline = polygon([
    project(v, x - r * 1.4, 0, z),
    project(v, x - r * 1.4, base, z),
    project(v, x - r, base, z),
    ...jag,
    project(v, x + r, base, z),
    project(v, x + r * 1.4, base, z),
    project(v, x + r * 1.4, 0, z),
  ]);
  if (!broken) {
    const cap = polygon([
      project(v, x - r * 1.6, top, z),
      project(v, x - r * 1.6, h, z),
      project(v, x + r * 1.6, h, z),
      project(v, x + r * 1.6, top, z),
    ]);
    stones.push({ path: cap, tone: 1 });
    stones.push({
      path: polygon([
        project(v, x - r * 1.6, h - 0.08, z),
        project(v, x - r * 1.6, h, z),
        project(v, x + r * 1.6, h, z),
        project(v, x + r * 1.6, h - 0.08, z),
      ]),
      tone: 0,
    });
    stones.push({
      path: polygon([
        project(v, x - r * 1.6, top, z),
        project(v, x - r * 1.6, top + 0.07, z),
        project(v, x + r * 1.6, top + 0.07, z),
        project(v, x + r * 1.6, top, z),
      ]),
      tone: 2,
    });
    outline.addPath(cap);
  }
  const detail = new Path2D();
  for (const f of [-0.5, -0.1, 0.3, 0.7]) {
    detail.moveTo(...project(v, x + r * f, base + 0.05, z));
    detail.lineTo(...project(v, x + r * f, top - 0.12, z));
  }
  const climbs: Climb[] = [];
  if (vine) {
    const pts: Point[] = [];
    for (let i = 0; i <= 30; i += 1) {
      const f = i / 30;
      pts.push(
        project(
          v,
          x + Math.sin(f * Math.PI * 3.4) * r * 1.05,
          top * 0.9 * f,
          z,
        ),
      );
    }
    climbs.push(climb(pts, vine, 1));
  }
  return {
    z,
    layer,
    stones,
    outline,
    detail,
    cast: polygon([
      project(v, x - r * 1.4, 0, z),
      project(v, x + r * 1.4 + h * 0.4, 0, z * 0.97),
      project(v, x + r * 1.4, 0, z),
    ]),
    feet: [
      [project(v, x - r * 1.5, 0, z)[0], z * 0.98, (0.25 * v.projection) / z],
      [project(v, x + r * 1.5, 0, z)[0], z * 0.98, (0.2 * v.projection) / z],
    ],
    climbs,
  };
};

/* A beam laid across column tops from x0 to x1, its right end broken off. */
const lintel = (
  v: View,
  x0: number,
  x1: number,
  z: number,
  up: number,
  broken: boolean,
  layer: 0 | 1 | 2,
): Piece => {
  const d = 0.3;
  const end = broken ? x1 - 0.35 : x1;
  const pts: Point[] = [
    project(v, x0, up, z),
    project(v, x0, up + d, z),
    project(v, end, up + d, z),
  ];
  if (broken)
    pts.push(
      project(v, end + 0.12, up + d * 0.55, z),
      project(v, end - 0.05, up + d * 0.3, z),
      project(v, x1 - 0.1, up, z),
    );
  else pts.push(project(v, x1, up, z));
  const outline = polygon(pts);
  return {
    z,
    layer,
    stones: [
      { path: outline, tone: 1 },
      {
        path: polygon([
          project(v, x0, up + d, z),
          project(v, end, up + d, z),
          project(v, end, up + d * 0.75, z),
          project(v, x0, up + d * 0.75, z),
        ]),
        tone: 0,
      },
    ],
    outline,
    detail: (() => {
      const p = new Path2D();
      p.moveTo(...project(v, x0, up + d * 0.4, z));
      p.lineTo(...project(v, end, up + d * 0.4, z));
      return p;
    })(),
    cast: new Path2D(),
    feet: [
      [
        project(v, (x0 + end) / 2, up + d, z)[0],
        z * 0.995,
        (0.3 * v.projection) / z,
      ],
    ],
    climbs: [],
  };
};

/* A front-facing wall from x0 to x1 at depth z under `profile` (u is x). */
const frontWall = (
  v: View,
  z: number,
  x0: number,
  x1: number,
  profile: readonly Point[],
  layer: 0 | 1 | 2,
  shift: number,
  opening?: (x: number, up: number) => boolean,
): Piece & { masonry: Masonry } => {
  const map: Map2 = (u, up) => project(v, u, up, z);
  const m = masonry(map, profile, x0, x1, 0.26, 1, shift, opening);
  const feet: Foot[] = [];
  for (let x = x0 + 0.5; x < x1; x += 1.1)
    feet.push([map(x, 0)[0], z, (0.45 * v.projection) / z]);
  return {
    z,
    layer,
    stones: m.stones,
    outline: m.outline,
    detail: new Path2D(),
    cast: new Path2D(),
    feet,
    climbs: [],
    masonry: m,
  };
};

/* An arched opening with a voussoir ring; one stone, the keystone, is gone. */
const archRing = (
  v: View,
  z: number,
  cx: number,
  half: number,
  spring: number,
  stones: Stone[],
  keystone = false,
): void => {
  const count = 9;
  for (let k = 0; k < count; k += 1) {
    if (!keystone && k === Math.floor(count / 2)) continue;
    const a0 = Math.PI + (Math.PI * k) / count;
    const a1 = Math.PI + (Math.PI * (k + 1)) / count;
    const at = (a: number, r: number): Point =>
      project(v, cx + Math.cos(a) * r, spring - Math.sin(a) * r, z);
    stones.push({
      path: polygon([
        at(a0, half),
        at(a0, half + 0.32),
        at(a1, half + 0.32),
        at(a1, half),
      ]),
      tone: k % 2 ? 0 : 1,
    });
  }
  const hole: Point[] = [
    project(v, cx - half, 0, z),
    project(v, cx - half, spring, z),
  ];
  for (let k = 0; k <= 12; k += 1) {
    const a = Math.PI + (Math.PI * k) / 12;
    hole.push(
      project(v, cx + Math.cos(a) * half, spring - Math.sin(a) * half, z),
    );
  }
  hole.push(project(v, cx + half, 0, z));
  stones.push({ path: polygon(hole), tone: 3 });
};
const inArch =
  (cx: number, half: number, spring: number) =>
  (x: number, up: number): boolean =>
    Math.abs(x - cx) < half + 0.05 &&
    up < spring + Math.sqrt(Math.max(0, (half + 0.05) ** 2 - (x - cx) ** 2));

/* A side wall in perspective at world x, from depth `near` to `far`; u is 0 near to 1 far. */
const sideWall = (
  v: View,
  x: number,
  near: number,
  far: number,
  profile: readonly Point[],
  climbs: (map: Map2, top: (u: number) => number) => Climb[],
): Piece => {
  const side = Math.sign(x);
  const zAt = (t: number): number => near * Math.pow(far / near, t);
  const map: Map2 = (t, up) => project(v, x, up, zAt(t));
  const m = masonry(
    (t, up) => map(t, up),
    profile,
    0,
    1,
    0.26,
    0.07,
    side > 0 ? 5 : 0,
  );
  /* The face turned from the upper-left light reads a tone darker. */
  const stones = m.stones.map((s) =>
    side > 0 && s.tone < 2 ? { ...s, tone: (s.tone + 1) as Tone } : s,
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
  return {
    z: far + 0.01,
    layer: 1,
    stones,
    outline: m.outline,
    detail: new Path2D(),
    cast: polygon(cast),
    feet,
    climbs: climbs(map, top),
  };
};

/* Steps rising from depth z0 toward z1, front-facing, `count` treads, width w. */
const steps = (
  v: View,
  x: number,
  z0: number,
  z1: number,
  w: number,
  count: number,
  rise: number,
  layer: 0 | 1 | 2,
): Piece[] => {
  const out: Piece[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const zf = z0 + ((z1 - z0) * i) / count;
    const zb = z0 + ((z1 - z0) * (i + 1)) / count;
    const up = rise * (i + 1);
    const half = w / 2 - i * 0.05;
    const riser = polygon([
      project(v, x - half, up - rise, zf),
      project(v, x - half, up, zf),
      project(v, x + half, up, zf),
      project(v, x + half, up - rise, zf),
    ]);
    const tread = polygon([
      project(v, x - half, up, zf),
      project(v, x - half, up, zb),
      project(v, x + half, up, zb),
      project(v, x + half, up, zf),
    ]);
    const outline = new Path2D();
    outline.addPath(riser);
    outline.addPath(tread);
    const detail = new Path2D();
    const chip = i % 2 ? -0.6 : 0.4;
    detail.moveTo(...project(v, x + half * chip, up, zf));
    detail.lineTo(...project(v, x + half * chip + 0.15, up - rise * 0.6, zf));
    out.push({
      z: zf,
      layer,
      stones: [
        { path: riser, tone: i % 3 === 1 ? 2 : 1 },
        { path: tread, tone: 0 },
      ],
      outline,
      detail,
      cast: new Path2D(),
      feet:
        i % 2
          ? [
              [
                project(v, x - half, up, zf)[0],
                zf * 0.99,
                (0.3 * v.projection) / zf,
              ],
            ]
          : [
              [
                project(v, x + half, up, zf)[0],
                zf * 0.99,
                (0.3 * v.projection) / zf,
              ],
            ],
      climbs: [],
    });
  }
  return out;
};

/* One tier of a curved bank of seats: a band on an arc around the centre, behind the slab. */
const tier = (
  v: View,
  zc: number,
  radius: number,
  depth: number,
  up0: number,
  up1: number,
  gaps: readonly (readonly [number, number])[],
  layer: 0 | 1 | 2,
): Piece => {
  const start = Math.PI * 1.08;
  const end = Math.PI * 1.92;
  const at = (u: number, up: number): Point => {
    const a = start + (end - start) * u;
    return project(v, Math.cos(a) * radius, up, zc - Math.sin(a) * depth);
  };
  const profile: Point[] = [];
  for (let i = 0; i <= 20; i += 1) {
    const u = i / 20;
    const gap = gaps.find(([a, b]) => u > a && u < b);
    profile.push([u, gap ? up0 + (up1 - up0) * 0.25 : up1]);
  }
  /* The riser face, sitting on the tier below. */
  const face = masonry(
    (u, up) => at(u, up + up0),
    profile.map(([u, h]) => [u, h - up0] as Point),
    0,
    1,
    (up1 - up0) / 2,
    0.06,
    Math.round(radius * 7),
    () => false,
  );
  const stones = face.stones;
  /* The seat top: the lit surface back to the next tier. */
  const seat: Point[] = [];
  const back: Point[] = [];
  for (let i = 0; i <= 30; i += 1) {
    const u = i / 30;
    const h = heightAt(profile, u);
    const a = start + (end - start) * u;
    seat.push(project(v, Math.cos(a) * radius, h, zc - Math.sin(a) * depth));
    back.push(
      project(
        v,
        Math.cos(a) * (radius + 0.6),
        h,
        zc - Math.sin(a) * (depth + 0.6),
      ),
    );
  }
  stones.push({ path: polygon([...seat, ...back.reverse()]), tone: 0 });
  const feet: Foot[] = [];
  for (let u = 0.08; u < 1; u += 0.16) {
    const [fx] = at(u, up1);
    const a = start + (end - start) * u;
    feet.push([
      fx,
      zc - Math.sin(a) * depth,
      (0.3 * v.projection) / (zc - Math.sin(a) * depth),
    ]);
  }
  const outline = new Path2D();
  outline.addPath(face.outline);
  outline.addPath(polygon([...seat, ...back.slice().reverse()]));
  return {
    z: zc - depth * 0.2,
    layer,
    stones,
    outline,
    detail: new Path2D(),
    cast: new Path2D(),
    feet,
    climbs: [],
  };
};

/* A pediment: the triangular gable over a temple front, its right half fallen. */
const pediment = (
  v: View,
  z: number,
  x0: number,
  x1: number,
  up: number,
  rise: number,
): Piece => {
  const mid = (x0 + x1) / 2;
  const pts: Point[] = [
    project(v, x0 - 0.2, up, z),
    project(v, mid, up + rise, z),
    project(v, mid + 0.25, up + rise * 0.78, z),
    project(v, mid + 0.1, up + rise * 0.55, z),
    project(v, mid + 0.55, up + rise * 0.38, z),
    project(v, mid + 0.4, up, z),
  ];
  const inner: Point[] = [
    project(v, x0 + 0.25, up + 0.12, z),
    project(v, mid, up + rise - 0.22, z),
    project(v, mid + 0.08, up + rise * 0.6, z),
    project(v, mid + 0.3, up + 0.12, z),
  ];
  return {
    z,
    layer: 1,
    stones: [
      { path: polygon(pts), tone: 0 },
      { path: polygon(inner), tone: 2 },
    ],
    outline: polygon(pts),
    detail: new Path2D(),
    cast: new Path2D(),
    feet: [
      [
        project(v, mid + 0.3, up + rise * 0.6, z)[0],
        z * 0.99,
        (0.25 * v.projection) / z,
      ],
    ],
    climbs: [],
  };
};

/* Profiles, authored: u along the wall, height in world units. */
const BACK_TOP: readonly Point[] = [
  [-6, 2.02],
  [-5.2, 2.21],
  [-4.6, 2.11],
  [-4.0, 2.41],
  [-3.2, 2.34],
  [-2.6, 2.6],
  [-1.4, 2.67],
  [-0.4, 2.47],
  [0.5, 2.54],
  [1.4, 2.73],
  [2.2, 2.08],
  [2.6, 1.17],
  [3.4, 0.72],
  [4.0, 1.23],
  [4.6, 1.95],
  [5.4, 1.82],
  [6, 2.08],
];
const SIDE_TOP: readonly Point[] = [
  [0, 1.15],
  [0.08, 1.3],
  [0.16, 1.2],
  [0.24, 1.55],
  [0.34, 1.5],
  [0.42, 1.0],
  [0.48, 0.55],
  [0.56, 0.7],
  [0.62, 1.3],
  [0.72, 1.45],
  [0.82, 1.35],
  [0.9, 1.6],
  [1, 1.5],
];
const LOW_TOP: readonly Point[] = [
  [-6, 0.9],
  [-4.5, 1.05],
  [-3, 0.7],
  [-1.5, 0.95],
  [0, 0.8],
  [1.5, 1.0],
  [3, 0.65],
  [4.5, 0.95],
  [6, 0.85],
];

/* The slab's foreground: one heap and a fallen block off-centre, toward the viewer. */
const foreground = (v: View, side: -1 | 1): Piece[] => [
  ...heap(v, side * 1.9 * share(v, 1.9, 2.1), 2.1, 1.1),
  boulder(v, -side * 2.6 * share(v, 2.6, 2.4), 2.4, 0.8, 0.32, 1),
];

const COMPOSITIONS: Record<string, (v: View) => Piece[]> = {
  courtyard: (v) => {
    const k = share(v, 4.4, 2.6);
    const gate = { cx: -2.5, half: 0.75, spring: 1.15 };
    const back = frontWall(
      v,
      10,
      -6,
      6,
      BACK_TOP,
      0,
      0,
      inArch(gate.cx, gate.half, gate.spring),
    );
    archRing(v, 10, gate.cx, gate.half, gate.spring, back.stones as Stone[]);
    for (const [x, w, h] of [
      [2.7, 0.5, 0.3],
      [3.2, 0.7, 0.42],
      [3.8, 0.45, 0.25],
      [3.5, 0.35, 0.6],
    ] as const) {
      (back.stones as Stone[]).push({
        path: polygon([
          project(v, x - w / 2, 0, 10),
          project(v, x - w / 2 + 0.08, h, 10),
          project(v, x + w / 2 - 0.05, h * 0.85, 10),
          project(v, x + w / 2, 0, 10),
        ]),
        tone: 0,
      });
    }
    /* Left: a vine climbs and trails along the wall top. Right: one drapes down from the broken edge. */
    const left = sideWall(v, -4.4 * k, 2.6, 10, SIDE_TOP, (map, top) => {
      const pts: Point[] = [];
      for (let i = 0; i <= 18; i += 1)
        pts.push(
          map(0.18 + Math.sin(i * 0.9) * 0.008, top(0.18) * (i / 18) * 0.97),
        );
      for (let i = 1; i <= 26; i += 1) {
        const t = 0.18 + 0.2 * (i / 26);
        pts.push(map(t, top(t) * 0.97 - Math.abs(Math.sin(i * 0.8)) * 0.06));
      }
      return [climb(pts, 3, 1.15)];
    });
    const right = sideWall(
      v,
      4.4 * k,
      2.6,
      10,
      SIDE_TOP.map(([t, h]) => [t, h * 0.92] as Point),
      (map, top) => {
        const pts: Point[] = [];
        for (let i = 0; i <= 22; i += 1) {
          const f = i / 22;
          pts.push(
            map(
              0.43 + Math.sin(f * Math.PI * 2) * 0.012,
              top(0.43) * 0.98 * (1 - f * 0.85),
            ),
          );
        }
        return [climb(pts, 2, 0.8)];
      },
    );
    return [
      back,
      left,
      right,
      toppled(v, 1.7 * k, 3.9),
      ...heap(v, -3.6 * k, 3.1, 1.2),
      boulder(v, 3.5 * k, 3.4, 0.8, 0.38, 1),
      ...foreground(v, -1),
    ];
  },

  avenue: (v) => {
    const k = share(v, 2.4, 2.4);
    const pieces: Piece[] = [frontWall(v, 16, -6, 6, LOW_TOP, 0, 2)];
    const zs = [2.4, 3.3, 4.5, 6.1, 8.2, 11];
    zs.forEach((z, i) => {
      for (const side of [-1, 1] as const) {
        const broken = (i + (side > 0 ? 1 : 0)) % 3 === 1;
        const h = broken ? 1.1 + (i % 2) * 0.4 : 2.3;
        pieces.push(
          column(
            v,
            side * 2.4 * k,
            z,
            h,
            broken,
            i < 2 ? 2 : i < 4 ? 1 : 0,
            i === 1 && side < 0 ? 3 : i === 2 && side > 0 ? 2 : undefined,
          ),
        );
      }
    });
    pieces.push(
      lintel(v, -2.4 * k - 0.35, -2.4 * k + 0.35, 4.5, 2.3, false, 1),
    );
    pieces.push(
      toppled(v, 0.9 * k, 5.2, 1.4),
      ...heap(v, -1.2 * k, 7, 0.9),
      ...foreground(v, 1),
    );
    return pieces;
  },

  amphitheatre: (v) => {
    const k = share(v, 4.2, 6);
    const pieces: Piece[] = [];
    [
      [4.8, 7.0, 1.6, 0, 0.7],
      [5.6, 7.8, 2.0, 0.7, 1.4],
      [6.4, 8.6, 2.4, 1.4, 2.1],
      [7.2, 9.4, 2.8, 2.1, 2.8],
    ].forEach(([r, zc, d, u0, u1], i) => {
      pieces.push(
        tier(
          v,
          zc,
          r * k,
          d,
          u0,
          u1,
          i === 1
            ? [[0.62, 0.78]]
            : i === 3
              ? [
                  [0.15, 0.32],
                  [0.7, 0.8],
                ]
              : [],
          i > 1 ? 0 : 1,
        ),
      );
    });
    pieces.push(
      column(v, -4.6 * k, 5.2, 2.0, false, 1, 3),
      column(v, 4.4 * k, 5.6, 1.2, true, 1),
    );
    pieces.push(
      ...steps(v, 0, 3.6, 4.4, 1.6, 2, 0.12, 2),
      toppled(v, 2.4 * k, 4.2, 1.2),
      ...heap(v, -2.6 * k, 4.6, 1.0),
      ...foreground(v, -1),
    );
    return pieces;
  },

  temple: (v) => {
    const k = share(v, 3.2, 6.5);
    const z = 6.5;
    const door = { cx: 0, half: 0.75 };
    const cella = frontWall(
      v,
      z + 0.6,
      -3.4 * k,
      3.4 * k,
      [
        [-3.4 * k, 2.3],
        [-1.2, 2.5],
        [1.2, 2.4],
        [3.4 * k, 1.6],
      ],
      0,
      3,
      (x, up) => Math.abs(x - door.cx) < door.half && up < 1.9,
    );
    (cella.stones as Stone[]).push({
      path: polygon([
        project(v, -door.half, 0, z + 0.6),
        project(v, -door.half, 1.9, z + 0.6),
        project(v, door.half, 1.9, z + 0.6),
        project(v, door.half, 0, z + 0.6),
      ]),
      tone: 3,
    });
    const pieces: Piece[] = [cella];
    const xs = [-2.6, -1.2, 1.2, 2.6].map((x) => x * k);
    xs.forEach((x, i) =>
      pieces.push(column(v, x, z, 2.6, i === 3, 1, i === 0 ? 3 : undefined)),
    );
    pieces.push(
      lintel(v, xs[0]! - 0.4, xs[2]! + 0.4, z, 2.6, true, 1),
      pediment(v, z, xs[0]! - 0.4, xs[2]! + 0.4, 2.9, 1.0),
    );
    pieces.push(...steps(v, 0, 4.2, z - 0.1, 6.2 * k, 4, 0.12, 2));
    pieces.push(
      toppled(v, 3.0 * k, 4.6, 1.4),
      ...heap(v, -3.4 * k, 4.4, 1.1),
      ...foreground(v, 1),
    );
    return pieces;
  },

  aqueduct: (v) => {
    const k = share(v, 5, 7);
    const z = 7;
    const spans = 5;
    const half = 0.62;
    const width = 10 * k;
    const span = width / spans;
    const gap = 3;
    const profile: Point[] = [];
    for (let i = 0; i <= spans; i += 1) {
      const x = -width / 2 + span * i;
      if (i === gap)
        profile.push([x - 0.05, 3.3], [x + 0.2, 1.4], [x + span - 0.2, 1.1]);
      else profile.push([x, 3.2 + (i % 2) * 0.12]);
    }
    const arches = (x: number, up: number): boolean => {
      const i = Math.floor((x + width / 2) / span);
      const cx = -width / 2 + span * (i + 0.5);
      return (
        i !== gap &&
        Math.abs(x - cx) < half + 0.05 &&
        up < 1.6 + Math.sqrt(Math.max(0, (half + 0.05) ** 2 - (x - cx) ** 2))
      );
    };
    const bridge = frontWall(
      v,
      z,
      -width / 2,
      width / 2,
      profile,
      1,
      4,
      arches,
    );
    for (let i = 0; i < spans; i += 1)
      if (i !== gap)
        archRing(
          v,
          z,
          -width / 2 + span * (i + 0.5),
          half,
          1.6,
          bridge.stones as Stone[],
          i % 2 === 0,
        );
    const vine: Point[] = [];
    const gx = -width / 2 + span * gap;
    for (let i = 0; i <= 22; i += 1)
      vine.push(
        project(v, gx - 0.15 + Math.sin(i * 0.7) * 0.06, 3.2 * (1 - i / 26), z),
      );
    const withVine: Piece = { ...bridge, climbs: [climb(vine, 2, 1)] };
    return [
      frontWall(v, 15, -7, 7, LOW_TOP, 0, 6),
      withVine,
      ...heap(v, gx + span * 0.5, z * 0.98, 1.4),
      column(v, -3.6 * k, 4.2, 1.3, true, 2, 3),
      toppled(v, 2.8 * k, 4.6, 1.3),
      ...foreground(v, -1),
    ];
  },
};

export const SCENE_NAMES = Object.keys(COMPOSITIONS);

export const scenePieces = (name: string, v: View): Piece[] =>
  (COMPOSITIONS[name] ?? COMPOSITIONS.courtyard!)(v).sort((a, b) => b.z - a.z);

/* Tone strength: the line colour over the opaque ground, per tone, then per layer. */
const TONE_ALPHA: Record<Tone, number> = { 0: 0, 1: 0.1, 2: 0.24, 3: 0.62 };
const LAYER = [
  { tone: 0.6, line: 0.42, joint: 0.22 },
  { tone: 0.85, line: 0.68, joint: 0.3 },
  { tone: 1, line: 0.88, joint: 0.38 },
] as const;
const CAST_ALPHA = 0.12;

export const drawPiece = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  piece: Piece,
  lineWidth: number,
): void => {
  const layer = LAYER[piece.layer];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = CAST_ALPHA * layer.tone;
  ctx.fillStyle = palette.border;
  ctx.fill(piece.cast);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.background;
  ctx.fill(piece.outline);
  ctx.strokeStyle = palette.border;
  for (const stone of piece.stones) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.background;
    ctx.fill(stone.path);
    if (stone.tone) {
      ctx.globalAlpha = TONE_ALPHA[stone.tone] * layer.tone;
      ctx.fillStyle = palette.border;
      ctx.fill(stone.path);
    }
    ctx.globalAlpha = layer.joint;
    ctx.lineWidth = lineWidth * 0.55;
    ctx.stroke(stone.path);
  }
  ctx.globalAlpha = layer.joint;
  ctx.lineWidth = lineWidth * 0.5;
  ctx.stroke(piece.detail);
  ctx.globalAlpha = layer.line;
  ctx.lineWidth = lineWidth * 1.15;
  ctx.stroke(piece.outline);
  ctx.globalAlpha = 1;
};
