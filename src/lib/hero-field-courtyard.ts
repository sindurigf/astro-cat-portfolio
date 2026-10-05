import { VINE_GROWTH } from './hero-field-scene';
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
  /** Weathering: pits filled darker, chipped corners filled pale, a hairline crack. */
  readonly wear?: Path2D;
  readonly chips?: Path2D;
  readonly crack?: Path2D;
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
  /** Where weeds root: screen x, depth, spread in pixels, and optionally how many. */
  readonly feet: ReadonlyArray<readonly [number, number, number, number?]>;
  readonly climbs: readonly Climb[];
  /** Cut lines: carved script, stroked darker than joints. */
  readonly carve?: Path2D;
  /** Plants rooted at this piece, drawn after it. */
  readonly plants?: readonly Plant[];
  /** 0 to 1: lifts every tone and line toward the ground, for distance. */
  readonly haze?: number;
  /** Extra shade over every stone, for a face turned from the sun. */
  readonly shade?: number;
  /** Sunlit top edges, drawn as a pale rim just inside the outline. */
  readonly lit?: Path2D;
  readonly castAlpha?: number;
  /** A wash of the ground colour over everything already drawn, inside the outline. */
  readonly mist?: number;
}

export type PlantKind = 'grass' | 'shrub' | 'cover';

export interface Plant {
  readonly kind: PlantKind;
  /** Root, screen space. */
  readonly x: number;
  readonly y: number;
  /** Full-grown size, CSS pixels. */
  readonly size: number;
  /** 0 to 1: staggers growth and sway between plants. */
  readonly phase: number;
}

export interface View {
  readonly cx: number;
  readonly horizon: number;
  readonly projection: number;
}

type Foot = readonly [number, number, number, number?];

/* Rendering switches per option, read while a composition builds. */
interface Style {
  readonly weathered: boolean;
  readonly sun: boolean;
}
const PLAIN: Style = { weathered: false, sun: false };
let style: Style = PLAIN;
/* Low sun from behind on the left: ground offset per unit of height, so shadows reach toward the viewer. */
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
  for (let i = 0; i < 1 + (n % 3); i += 1) {
    const fu = 0.12 + ((n * 37 + i * 53) % 76) / 100;
    const fv = 0.18 + ((n * 29 + i * 41) % 62) / 100;
    const du = 0.025 + ((n + i) % 3) * 0.012;
    const dv = 0.07 + ((n + i * 2) % 3) * 0.03;
    wear.addPath(
      polygon([
        at(fu - du, fv),
        at(fu - du * 0.3, fv + dv),
        at(fu + du, fv + dv * 0.5),
        at(fu + du * 0.6, fv - dv * 0.7),
      ]),
    );
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
  let y0 = 0;
  for (let row = 0; y0 < peak; row += 1) {
    const y1 =
      y0 +
      course * (style.weathered ? COURSE_RUN[row % COURSE_RUN.length]! : 1);
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
      const tone = TONES[index % TONES.length]!;
      stones.push({
        path: polygon(pts),
        tone,
        ...(style.weathered && tone !== 3
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
      {
        path: polygon(pts),
        tone,
        ...(style.weathered
          ? weather(
              (u, up) => project(v, x - w / 2 + u * w, up * h, z),
              0.15,
              0.85,
              0.1,
              0.7,
              Math.round(x * 13 + z * 7) + tone,
              false,
            )
          : {}),
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
  const lit = new Path2D();
  if (style.sun) {
    lit.moveTo(...map(x0, heightAt(profile, x0)));
    profile
      .filter(([u]) => u > x0 && u < x1)
      .forEach(([u, h]) => lit.lineTo(...map(u, h)));
    lit.lineTo(...map(x1, heightAt(profile, x1)));
  }
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
    ...(style.sun ? { lit, shade: SUN.shade * 0.6 } : {}),
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
  /* The face turned from the light reads a tone darker: upper-left light, or a low sun from the left. */
  const turned = style.sun ? side < 0 : side > 0;
  const stones = m.stones.map((s) =>
    turned && s.tone < 2 ? { ...s, tone: (s.tone + 1) as Tone } : s,
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
  if (style.sun) {
    lit.moveTo(...topPts[0]!);
    topPts.slice(1).forEach((pt) => lit.lineTo(...pt));
  }
  return {
    z: far + 0.01,
    layer: 1,
    stones,
    outline: m.outline,
    detail: new Path2D(),
    cast: polygon(cast),
    feet,
    climbs: climbs(map, top),
    ...(style.sun ? { lit, ...(side < 0 ? { shade: SUN.shade } : {}) } : {}),
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
        Math.cos(a) * (radius + 0.55),
        h,
        zc - Math.sin(a) * (depth + 0.3),
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
    climbs: [],
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
      climbs: [],
    },
  ];
};

/* A broken tower: a narrow tall run of masonry with a jagged top. */
const tower = (
  v: View,
  z: number,
  x: number,
  w: number,
  h: number,
  layer: 0 | 1 | 2,
  shift: number,
): Piece =>
  frontWall(
    v,
    z,
    x - w / 2,
    x + w / 2,
    [
      [x - w / 2, h * 0.92],
      [x - w * 0.2, h],
      [x, h * 0.86],
      [x + w * 0.15, h * 0.95],
      [x + w / 2, h * 0.7],
    ],
    layer,
    shift,
  );

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

/* Ruin profiles that rise and fall: high fragments beside knee-high stubs. */
const STEPPED_SIDE: readonly Point[] = stepped([
  [0, 0.35],
  [0.06, 0.5],
  [0.12, 0.42],
  [0.2, 0.9],
  [0.28, 0.85],
  [0.33, 0.45],
  [0.4, 0.5],
  [0.48, 1.7],
  [0.56, 1.62],
  [0.62, 1.2],
  [0.7, 2.5],
  [0.8, 2.4],
  [0.88, 1.9],
  [1, 2.6],
]);
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
const BACK_STEP: readonly Point[] = stepped([
  [-6, 1.2],
  [-5, 2.6],
  [-4.2, 2.5],
  [-3.6, 3.3],
  [-2.9, 3.2],
  [-2.3, 1.6],
  [-1.2, 1.7],
  [-0.4, 2.4],
  [0.6, 2.3],
  [1.4, 1.1],
  [2.4, 0.9],
  [3.0, 1.9],
  [3.8, 1.8],
  [4.6, 0.8],
  [6, 1.0],
]);

const lowSides = (
  v: View,
  k: number,
  profile: readonly Point[],
  near = 2.6,
  far = 10,
  right: readonly Point[] = profile.map(([t, h]) => [t, h * 0.9] as Point),
): Piece[] => [
  sideWall(v, -4.4 * k, near, far, profile, () => []),
  sideWall(v, 4.4 * k, near, far, right, () => []),
];

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
];
const MORE_CRACK_SPOTS: readonly Point[] = [
  ...CRACK_SPOTS,
  [-2.4, 3.1],
  [0.2, 2.9],
];
const cracks = (v: View, spots = CRACK_SPOTS): Piece => {
  return {
    z: 1.9,
    layer: 2,
    stones: [],
    outline: new Path2D(),
    detail: new Path2D(),
    cast: new Path2D(),
    feet: spots.map(([x, z]) => {
      const sx = x * share(v, 3.3, 2.1);
      return [
        project(v, sx, 0, z)[0],
        z,
        (0.05 * v.projection) / z,
        1,
      ] as const;
    }),
    climbs: [],
  };
};

/* Extra feet ringing a block's base, so flowers circle it. */
const ring = (
  v: View,
  piece: Piece,
  x: number,
  z: number,
  w: number,
  count: number,
): Piece => {
  const feet: Foot[] = [];
  for (let i = 0; i < 7; i += 1) {
    /* The front arc only: feet behind the block would be hidden by it. */
    const a = Math.PI * (1.05 + (0.9 * i) / 6);
    const px = x + Math.cos(a) * w * 0.75;
    const pz = z + Math.sin(a) * w * 0.35;
    feet.push([
      project(v, px, 0, pz)[0],
      pz * 0.98,
      (0.18 * v.projection) / pz,
      count,
    ]);
  }
  return { ...piece, feet: [...piece.feet, ...feet] };
};

/*
 * The poneglyph turned, a corner toward the viewer: two script faces receding
 * to either side, the top lit. World plan: `a` is the turn from square-on.
 */
const poneglyphTurned = (
  v: View,
  x: number,
  z: number,
  h: number,
  w: number,
  a: number,
): Piece => {
  const d = w * 0.92;
  const L: Point = [-Math.cos(a), Math.sin(a)];
  const R: Point = [Math.sin(a), Math.cos(a)];
  const at = (px: number, pz: number, up: number): Point =>
    project(v, px, up, pz);
  const c: Point = [x, z];
  const lp: Point = [x + L[0] * w, z + L[1] * w];
  const rp: Point = [x + R[0] * d, z + R[1] * d];
  const bp: Point = [lp[0] + R[0] * d, lp[1] + R[1] * d];
  const left = polygon([
    at(c[0], c[1], 0),
    at(c[0], c[1], h),
    at(lp[0], lp[1], h),
    at(lp[0], lp[1], 0),
  ]);
  const right = polygon([
    at(c[0], c[1], 0),
    at(c[0], c[1], h),
    at(rp[0], rp[1], h),
    at(rp[0], rp[1], 0),
  ]);
  const top = polygon([
    at(c[0], c[1], h),
    at(lp[0], lp[1], h),
    at(bp[0], bp[1], h),
    at(rp[0], rp[1], h),
  ]);
  const outline = new Path2D();
  [left, right, top].forEach((f) => outline.addPath(f));
  const carve = new Path2D();
  const face = (from: Point, to: Point, cols: number): void => {
    const margin = 0.07;
    const rows = Math.round(
      (cols * h) / Math.hypot(to[0] - from[0], to[1] - from[1]),
    );
    const g =
      Math.min((1 - margin * 2) / cols, ((1 - margin * 2) * 1) / rows) * 0.62;
    const p = (u: number, vv: number): Point =>
      at(
        from[0] + (to[0] - from[0]) * u,
        from[1] + (to[1] - from[1]) * u,
        vv * h,
      );
    for (let r = 0; r < rows; r += 1) {
      for (let col = 0; col < cols; col += 1) {
        const glyph =
          SCRIPT[(r * 7 + col * 3 + ((r * col) % 5)) % SCRIPT.length]!;
        const u0 = margin + (col + 0.2) * ((1 - margin * 2) / cols);
        const v0 = 1 - margin - (r + 0.2) * ((1 - margin * 2) / rows);
        const gu = g;
        const gv = (g * cols) / rows;
        for (const stroke of glyph) {
          carve.moveTo(
            ...p(u0 + (stroke[0]! * gu) / 2, v0 - (stroke[1]! * gv) / 2),
          );
          for (let k = 2; k < stroke.length; k += 2)
            carve.lineTo(
              ...p(u0 + (stroke[k]! * gu) / 2, v0 - (stroke[k + 1]! * gv) / 2),
            );
        }
      }
    }
  };
  face(lp, c, 9);
  face(c, rp, 8);
  return {
    z: z + d * 0.4,
    layer: 2,
    stones: [
      { path: left, tone: 1 },
      { path: right, tone: 2 },
      { path: top, tone: 0 },
    ],
    outline,
    detail: new Path2D(),
    carve,
    cast: polygon([
      at(c[0], c[1], 0),
      at(rp[0] + h * 0.4, rp[1], 0),
      at(rp[0], rp[1], 0),
    ]),
    feet: [
      [at(c[0], c[1], 0)[0], z * 0.98, (0.3 * v.projection) / z],
      [at(lp[0], lp[1], 0)[0], lp[1] * 0.98, (0.3 * v.projection) / lp[1]],
      [at(rp[0], rp[1], 0)[0], rp[1] * 0.98, (0.3 * v.projection) / rp[1]],
    ],
    climbs: [],
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
const mirror = (pts: readonly Point[]): Point[] =>
  pts.map(([x, h]) => [-x, h] as Point).reverse();

type Caster = readonly [number, number, number];

/* Long low-sun shadows: each [x, z, height] along a base casts to x + h·dx, z + h·dz. */
const sunCast = (v: View, pts: readonly Caster[]): Path2D => {
  const path = new Path2D();
  for (let i = 1; i < pts.length; i += 1) {
    const [xa, za, ha] = pts[i - 1]!;
    const [xb, zb, hb] = pts[i]!;
    path.addPath(
      polygon([
        project(v, xa, 0, za),
        project(v, xb, 0, zb),
        project(v, xb + hb * SUN.dx, 0, zb + hb * SUN.dz),
        project(v, xa + ha * SUN.dx, 0, za + ha * SUN.dz),
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
    i === 0 ? { ...piece, cast: sunCast(v, pts), castAlpha: SUN.cast } : piece,
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
    top.push([f, h], [f + w * 0.35, h * 1.04], [f + w * 0.42, h * 0.92]);
    top.push([f + w, h * 0.96]);
    if (i % 4 === 2 && h > 3)
      stones.push({
        path: polygon(
          [
            [f + w * 0.38, h * 0.48],
            [f + w * 0.38, h * 0.66],
            [f + w * 0.6, h * 0.66],
            [f + w * 0.6, h * 0.48],
          ].map(([u, up]) => project(v, u! * span, up!, z)),
        ),
        tone: 3,
      });
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
      climbs: [],
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
      climbs: [],
    },
  ];
};

const atmosphere = (v: View): Piece[] =>
  SKYLINES.flatMap(({ z, haze, blocks }) => skyline(v, z, haze, blocks));

/* A near column drum cut by the frame's lower corner: largest, darkest, slightly soft. */
const drum = (
  v: View,
  side: -1 | 1,
  z: number,
  r: number,
  h: number,
): Piece => {
  const x = side * ((v.cx * z) / v.projection) * 0.9;
  const ring = (up: number, from: number, to: number): Point[] =>
    Array.from({ length: 25 }, (_, i) => {
      const a = from + ((to - from) * i) / 24;
      return project(v, x + Math.cos(a) * r, up, z + Math.sin(a) * r * 0.6);
    });
  const body = polygon([...ring(0, 0, -Math.PI), ...ring(h, -Math.PI, 0)]);
  const top = polygon(ring(h * 0.97, 0, Math.PI * 2));
  const detail = new Path2D();
  for (let i = 1; i < 10; i += 1) {
    const a = -Math.PI + (Math.PI * i) / 10;
    detail.moveTo(
      ...project(v, x + Math.cos(a) * r, 0, z + Math.sin(a) * r * 0.6),
    );
    detail.lineTo(
      ...project(v, x + Math.cos(a) * r, h * 0.94, z + Math.sin(a) * r * 0.6),
    );
  }
  const chip = polygon([
    project(v, x - side * r * 0.2, h, z - r * 0.6),
    project(v, x - side * r * 0.62, h * 0.97, z - r * 0.46),
    project(v, x - side * r * 0.5, h * 0.78, z - r * 0.5),
    project(v, x - side * r * 0.3, h * 0.84, z - r * 0.58),
  ]);
  const outline = new Path2D();
  outline.addPath(body);
  outline.addPath(top);
  return {
    z,
    layer: 2,
    stones: [
      {
        path: body,
        tone: 2,
        ...weather(
          (u, up) => project(v, x - r + u * 2 * r, up * h, z - r * 0.6),
          0.1,
          0.9,
          0.1,
          0.85,
          4,
          false,
        ),
      },
      { path: top, tone: 1, chips: chip },
    ],
    outline,
    detail,
    cast: new Path2D(),
    feet: [
      [
        project(v, x - side * r * 1.1, 0, z)[0],
        z * 0.98,
        (0.2 * v.projection) / z,
        3,
      ],
    ],
    climbs: [],
  };
};

const framing = (v: View): Piece[] => [
  drum(v, -1, 1.35, 0.42, 0.62),
  ...bloom(
    boulder(v, -((v.cx * 1.5) / v.projection) * 0.55, 1.5, 0.34, 0.2, 2),
    1,
  ),
];

/* Flagstones between the walls: constant world size, so they shrink with depth; joints stagger. */
const FLAG_DEPTH = [0.62, 0.74, 0.58, 0.7, 0.66] as const;
const flagstones = (v: View, k: number): Piece => {
  const half = 4.4 * k;
  const detail = new Path2D();
  const stones: Stone[] = [];
  let z0 = 1.65;
  for (let row = 0; z0 < 10; row += 1) {
    const z1 = z0 + FLAG_DEPTH[row % FLAG_DEPTH.length]! * (0.8 + z0 * 0.06);
    detail.moveTo(...project(v, -half, 0, z1));
    detail.lineTo(...project(v, half, 0, z1));
    let x = -half - (row % 3) * 0.37;
    let n = row * 3;
    while (x < half) {
      const next = Math.min(half, x + LENGTHS[n % LENGTHS.length]! * 1.25);
      if (x > -half) {
        detail.moveTo(...project(v, x, 0, z0));
        detail.lineTo(...project(v, x, 0, z1));
      }
      if (n % 9 === 4 && z0 > 3)
        stones.push({
          path: polygon([
            project(v, Math.max(-half, x), 0, z0),
            project(v, Math.max(-half, x), 0, z1),
            project(v, next, 0, z1),
            project(v, next, 0, z0),
          ]),
          tone: 1,
        });
      x = next;
      n += 1;
    }
    z0 = z1;
  }
  return {
    z: 10.4,
    layer: 2,
    stones,
    outline: new Path2D(),
    detail,
    cast: new Path2D(),
    feet: [],
    climbs: [],
  };
};

/* Two short hairline cracks running in toward the stone's base. */
const floorCracks = (v: View, k: number, to: number): Piece => {
  const detail = new Path2D();
  [-0.9, 2.2].forEach((x0, c) => {
    const xs = x0 * k;
    const x1 = to + (c ? 0.3 : -0.3);
    for (let i = 0; i <= 5; i += 1) {
      const f = i / 5;
      const jog = (((i * 7 + c * 3) % 5) - 2) * 0.03;
      const pt = project(v, xs + (x1 - xs) * f + jog, 0, 2.5 + 0.95 * f);
      if (i === 0) detail.moveTo(...pt);
      else detail.lineTo(...pt);
    }
  });
  return {
    z: 2.45,
    layer: 1,
    stones: [],
    outline: new Path2D(),
    detail,
    cast: new Path2D(),
    feet: [],
    climbs: [],
  };
};

/* Small rubble of one world size across the floor, so it shrinks with distance. */
const RUBBLE: readonly (readonly [number, number, number])[] = [
  [-2.7, 2.9, 0.4],
  [0.3, 2.75, 0.3],
  [3.5, 4.8, 0.32],
  [0.1, 4.4, 0.34],
  [-0.9, 6.2, 0.32],
  [2.1, 7.3, 0.3],
  [-2.2, 8.6, 0.3],
  [0.9, 9.3, 0.28],
];
/* No weeds of their own: the floor stays open. */
const rubble = (v: View, k: number): Piece[] =>
  RUBBLE.map(([x, z, w], i) => ({
    ...boulder(v, x * k, z, w, w * 0.5, (i % 3) as Tone),
    feet: [],
  }));

const ground = (v: View): Piece[] => {
  const k = share(v, 4.4, 2.6);
  return [flagstones(v, k), floorCracks(v, k, 1.35 * k), ...rubble(v, k)];
};

/* q1's pieces, with more crack stems; `sun` swaps in long shadows. */
const ruinOne = (v: View, sun = false): Piece[] => {
  const k = share(v, 4.4, 2.6);
  const cast = (pieces: readonly Piece[], pts: readonly Caster[]): Piece[] =>
    sun ? sunlit(v, pieces, pts) : [...pieces];
  return [
    cracks(v, MORE_CRACK_SPOTS),
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
      bloom(
        sideWall(v, -4.4 * k, 2.6, 10, TALL_SIDE, () => []),
        4,
      ),
      wallCasters(-4.4 * k, 2.6, 10, TALL_SIDE),
    ),
    ...bloom(
      sideWall(v, 4.4 * k, 2.6, 10, LOW_SIDE, () => []),
      1,
    ),
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
  ];
};

const STYLES: Record<string, Style> = {
  r1: { weathered: true, sun: false },
  r2: { weathered: true, sun: true },
  r3: { weathered: true, sun: false },
  r4: { weathered: true, sun: false },
  r5: { weathered: true, sun: true },
};

/* Plant kinds per option, so growth styles differ as well as layouts. */
const PLANTS: Record<string, PlantKind> = {
  pA: 'grass',
  pB: 'shrub',
  pC: 'cover',
  pD: 'grass',
  pE: 'shrub',
};

const COMPOSITIONS: Record<string, (v: View) => Piece[]> = {
  r1: (v) => [...ruinOne(v), ...atmosphere(v)],
  r2: (v) => ruinOne(v, true),
  r3: (v) => [...ruinOne(v), ...framing(v)],
  r4: (v) => [...ruinOne(v), ...ground(v)],
  r5: (v) => [...ruinOne(v, true), ...atmosphere(v)],
  /* 1: tall wall and tower left, poneglyph off-centre right, rubble right; flowers clustered at the wall's feet. */
  q1: (v) => {
    const k = share(v, 4.4, 2.6);
    return [
      cracks(v),
      frontWall(v, 10, -6, 6, FALLEN_BACK, 0, 2),
      tower(v, 8.5, -3.6 * k, 1.3, 4.8, 0, 3),
      ...bloom(
        sideWall(v, -4.4 * k, 2.6, 10, TALL_SIDE, () => []),
        4,
      ),
      ...bloom(
        sideWall(v, 4.4 * k, 2.6, 10, LOW_SIDE, () => []),
        1,
      ),
      ...bloom(heap(v, 3.2 * k, 3.2, 1.4), 1),
      ...bloom(heap(v, 2.6 * k, 5.4, 1.1), 1),
      ...bloom(poneglyph(v, 1.35 * k, 3.6, 1.6, 1.5, true), 1),
      ...bloom(heap(v, -1.4 * k, 2.3, 0.8), 2),
    ];
  },

  /* 2: the mirror: poneglyph left against the low rubble side; flowers scattered across the rubble. */
  q2: (v) => {
    const k = share(v, 4.4, 2.6);
    return [
      cracks(v),
      frontWall(v, 10, -6, 6, mirror(FALLEN_BACK), 0, 5),
      tower(v, 8.5, 3.6 * k, 1.3, 4.8, 0, 6),
      ...bloom(
        sideWall(v, 4.4 * k, 2.6, 10, TALL_SIDE, () => []),
        1,
      ),
      ...bloom(
        sideWall(v, -4.4 * k, 2.6, 10, LOW_SIDE, () => []),
        2,
      ),
      ...bloom(heap(v, -3.3 * k, 3.1, 1.5), 4),
      ...bloom(heap(v, -2.4 * k, 5.0, 1.2), 3),
      ...bloom(boulder(v, -3.9 * k, 4.2, 0.8, 0.36, 1), 3),
      ...bloom(heap(v, 0.4 * k, 2.6, 0.9), 3),
      ...bloom(poneglyph(v, -1.35 * k, 3.6, 1.6, 1.5, false), 1),
    ];
  },

  /* 3: poneglyph close in the right third, a tall wall receding diagonally behind it, open low ruins left; flowers ring its base. */
  q3: (v) => {
    const k = share(v, 4.4, 2.6);
    const px = 1.6 * k;
    const [block] = poneglyph(v, px, 3.5, 1.35, 1.25, false);
    return [
      cracks(v),
      frontWall(v, 12, -7, 7, LOW_TOP, 0, 3),
      ...bloom(
        sideWall(
          v,
          4.0 * k,
          3.0,
          12,
          TALL_SIDE.map(([t, h]) => [t, h * 1.25] as Point),
          () => [],
        ),
        1,
      ),
      ...bloom(
        frontWall(
          v,
          6,
          -5.2 * k,
          -1.6 * k,
          stepped([
            [-5.2 * k, 0.4],
            [-4.3 * k, 0.75],
            [-3.2 * k, 0.35],
            [-2.3 * k, 0.6],
            [-1.6 * k, 0.3],
          ]),
          1,
          4,
        ),
        1,
      ),
      ...bloom(
        sideWall(v, -4.4 * k, 2.6, 10, LOW_SIDE, () => []),
        1,
      ),
      ...bloom(toppled(v, -2.0 * k, 4.2, 1.5), 1),
      ring(v, bloom(block!, 1)[0]!, px, 3.5, 1.25, 3),
      ...bloom(heap(v, -3.2 * k, 2.6, 0.9), 1),
    ];
  },

  /* 4: poneglyph half-turned, corner forward; a tower behind on the far side; a rubble field in front with flowers scattered through it. */
  q4: (v) => {
    const k = share(v, 4.4, 2.6);
    return [
      cracks(v),
      frontWall(v, 12, -7, 7, LOW_TOP, 0, 2),
      tower(v, 9, 2.8 * k, 1.4, 5.0, 0, 7),
      ...bloom(
        frontWall(
          v,
          9.1,
          1.0 * k,
          5 * k,
          stepped([
            [1.0 * k, 1.4],
            [2.2 * k, 2.2],
            [3.6 * k, 1.1],
            [5 * k, 0.6],
          ]),
          0,
          1,
        ),
        1,
      ),
      ...bloom(
        sideWall(v, -4.4 * k, 2.6, 10, LOW_SIDE, () => []),
        1,
      ),
      ...bloom(
        sideWall(
          v,
          4.4 * k,
          2.6,
          10,
          LOW_SIDE.map(([t, h]) => [t, h * 1.4] as Point),
          () => [],
        ),
        1,
      ),
      ...bloom(poneglyphTurned(v, -0.4 * k, 3.7, 1.75, 1.35, 0.62), 1),
      ...bloom(heap(v, -2.9 * k, 2.7, 1.3), 4),
      ...bloom(heap(v, 2.3 * k, 2.5, 1.2), 4),
      ...bloom(boulder(v, 1.0 * k, 2.2, 0.6, 0.28, 0), 3),
      ...bloom(heap(v, -1.7 * k, 3.4, 0.9), 3),
      ...bloom(boulder(v, 3.4 * k, 3.6, 0.7, 0.32, 1), 3),
    ];
  },

  /* 5, mine: a stepped terrace wall runs back on the left to a broken tower; a toppled column points across to the poneglyph on its plinth right; flowers at the wall feet and ringing the base. */
  q5: (v) => {
    const k = share(v, 4.4, 2.6);
    const px = 1.5 * k;
    const blocks = poneglyph(v, px, 4.0, 1.7, 1.6, true);
    return [
      cracks(v),
      frontWall(v, 12, -7, 7, LOW_TOP, 0, 4),
      tower(v, 10, -2.6 * k, 1.5, 5.4, 0, 2),
      ...bloom(
        sideWall(
          v,
          -3.6 * k,
          2.6,
          10,
          TALL_SIDE.map(([t, h]) => [t, h * (0.6 + t * 0.6)] as Point),
          () => [],
        ),
        3,
      ),
      ...bloom(
        sideWall(v, 4.4 * k, 2.6, 10, LOW_SIDE, () => []),
        1,
      ),
      ...bloom(toppled(v, -0.6 * k, 3.0, 1.8), 2),
      ring(v, bloom(blocks[0]!, 1)[0]!, px, 4.0, 1.6, 2),
      ...blocks.slice(1),
      ...bloom(heap(v, 3.3 * k, 3.0, 1.2), 1),
    ];
  },
  pA: (v) => {
    const k = share(v, 4.4, 2.6);
    return [
      frontWall(
        v,
        10,
        -6,
        6,
        BACK_STEP.map(([x, h]) => [x, h * 1.05] as Point),
        0,
        1,
      ),
      ...lowSides(v, k, STEPPED_SIDE),
      frontWall(
        v,
        3.2,
        -3.9 * k,
        -2.9 * k,
        [
          [-3.9 * k, 0.45],
          [-3.4 * k, 0.6],
          [-2.9 * k, 0.3],
        ],
        2,
        4,
      ),
      frontWall(
        v,
        3.4,
        2.8 * k,
        3.9 * k,
        [
          [2.8 * k, 0.35],
          [3.3 * k, 0.55],
          [3.9 * k, 0.4],
        ],
        2,
        6,
      ),
      ...poneglyph(v, 0, 5, 1.9, 1.75, true),
      ...heap(v, 2.0 * k, 2.3, 0.9),
    ];
  },

  pB: (v) => {
    const k = share(v, 4.4, 2.6);
    const tall: Point[] = stepped([
      [0, 1.6],
      [0.15, 2.3],
      [0.3, 2.2],
      [0.45, 2.9],
      [0.6, 2.8],
      [0.75, 2.5],
      [1, 3.0],
    ]);
    return [
      frontWall(
        v,
        10,
        -6,
        6,
        [
          [-6, 2.4],
          [-3, 2.6],
          [-1, 1.4],
          [1, 1.2],
          [3, 0.6],
          [6, 0.5],
        ],
        0,
        2,
      ),
      tower(v, 8.5, -3.6 * k, 1.3, 4.8, 0, 3),
      sideWall(v, -4.4 * k, 2.6, 10, tall, () => []),
      sideWall(v, 4.4 * k, 2.6, 10, LOW_SIDE, () => []),
      ...heap(v, 3.2 * k, 3.2, 1.4),
      ...heap(v, 2.4 * k, 5.2, 1.1),
      boulder(v, 3.8 * k, 4.4, 0.7, 0.35, 1),
      ...poneglyph(v, 0, 5, 1.9, 1.75, false),
      ...heap(v, -1.8 * k, 2.3, 0.9),
    ];
  },

  pC: (v) => {
    const k = share(v, 4.4, 2.6);
    const arch = { cx: 0, half: 1.5, spring: 1.9 };
    const back = frontWall(
      v,
      7.6,
      -5.5,
      5.5,
      stepped([
        [-5.5, 1.5],
        [-4, 2.4],
        [-2.6, 3.4],
        [-1.9, 3.9],
        [-0.6, 4.05],
        [0.3, 3.0],
        [0.9, 2.4],
        [2.2, 3.2],
        [3.4, 2.6],
        [5.5, 1.2],
      ]),
      1,
      2,
      inArch(arch.cx, arch.half, arch.spring),
    );
    /* A broken arch: only the left half of the ring still stands. */
    const ring: Stone[] = [];
    const count = 9;
    for (let i = 0; i < 4; i += 1) {
      const a0 = Math.PI + (Math.PI * i) / count;
      const a1 = Math.PI + (Math.PI * (i + 1)) / count;
      const at = (a: number, r: number): Point =>
        project(
          v,
          arch.cx + Math.cos(a) * r,
          arch.spring - Math.sin(a) * r,
          7.6,
        );
      ring.push({
        path: polygon([
          at(a0, arch.half),
          at(a0, arch.half + 0.35),
          at(a1, arch.half + 0.35),
          at(a1, arch.half),
        ]),
        tone: i % 2 ? 0 : 1,
      });
    }
    const opening: Point[] = [
      project(v, -arch.half, 0, 7.6),
      project(v, -arch.half, arch.spring, 7.6),
    ];
    for (let i = 0; i <= 12; i += 1) {
      const a = Math.PI + (Math.PI * i) / 12;
      opening.push(
        project(
          v,
          Math.cos(a) * arch.half,
          arch.spring - Math.sin(a) * arch.half,
          7.6,
        ),
      );
    }
    opening.push(project(v, arch.half, 0, 7.6));
    (back.stones as Stone[]).push({ path: polygon(opening), tone: 3 }, ...ring);
    return [
      frontWall(v, 12, -7, 7, LOW_TOP, 0, 6),
      back,
      ...lowSides(
        v,
        k,
        LOW_SIDE,
        2.6,
        10,
        stepped([
          [0, 0.9],
          [0.15, 0.4],
          [0.32, 0.35],
          [0.45, 1.2],
          [0.6, 0.6],
          [0.78, 0.3],
          [1, 0.8],
        ]),
      ),
      ...poneglyph(v, 0, 7.2, 2.4, 2.2, false),
      ...heap(v, -2.2 * k, 3.4, 1.1),
      toppled(v, 2.2 * k, 3.8, 1.4),
    ];
  },

  pD: (v) => {
    const k = share(v, 4.4, 2.6);
    return [
      frontWall(
        v,
        11,
        -6,
        6,
        [
          [-6, 0.9],
          [-4, 1.3],
          [-2, 0.8],
          [0, 1.1],
          [2, 0.7],
          [4, 1.0],
          [6, 0.8],
        ],
        0,
        1,
      ),
      tower(v, 8, -2.4, 1.6, 5.2, 0, 4),
      frontWall(
        v,
        8.1,
        -3.4,
        -1.4,
        [
          [-3.4, 1.4],
          [-2.8, 2.1],
          [-1.4, 1.2],
        ],
        0,
        7,
      ),
      ...lowSides(v, k, LOW_SIDE),
      ...poneglyph(v, 1.35 * k, 3.4, 1.6, 1.5, true),
      ...heap(v, -2.6 * k, 3.0, 1.1),
      boulder(v, -1.0 * k, 2.4, 0.6, 0.28, 1),
    ];
  },

  pE: (v) => {
    const k = share(v, 4.4, 2.6);
    /* My own: two broken towers flank the poneglyph like a gate that lost its lintel. */
    return [
      frontWall(v, 12, -7, 7, LOW_TOP, 0, 3),
      tower(v, 6.4, -1.9, 1.2, 3.6, 1, 2),
      tower(v, 6.4, 1.9, 1.2, 2.3, 1, 5),
      frontWall(
        v,
        6.5,
        -5.2,
        -2.5,
        [
          [-5.2, 0.5],
          [-4.2, 0.9],
          [-3.3, 0.6],
          [-2.5, 1.4],
        ],
        1,
        1,
      ),
      frontWall(
        v,
        6.5,
        2.5,
        5.2,
        [
          [2.5, 1.0],
          [3.4, 0.5],
          [4.4, 0.7],
          [5.2, 0.35],
        ],
        1,
        8,
      ),
      ...lowSides(v, k, LOW_SIDE, 2.6, 6.4),
      ...poneglyph(v, 0, 5.2, 1.9, 1.75, true),
      lintel(v, -0.9, 0.6, 4.4, 0, false, 2),
      ...heap(v, 2.2 * k, 3.0, 1.0),
    ];
  },
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
    Array.from({ length: 6 }, (_, i) => [
      4.6 + 0.55 * i,
      7.0 + 0.55 * i,
      1.6 + 0.3 * i,
      0.4 * i,
      0.4 * (i + 1),
    ]).forEach(([r, zc, d, u0, u1], i) => {
      pieces.push(
        tier(
          v,
          zc,
          r * k,
          d,
          u0,
          u1,
          /* A collapsed section breaks through the upper tiers. */
          i >= 2 ? [[0.62 - i * 0.01, 0.76 + i * 0.01]] : [],
          i > 2 ? 0 : 1,
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
    const k = share(v, 3.4, 7.5);
    const z = 7.5;
    const door = { cx: 0, half: 1.05, height: 3.6 };
    const cella = frontWall(
      v,
      z + 0.6,
      -3.6 * k,
      3.6 * k,
      [
        [-3.6 * k, 3.9],
        [-1.4, 4.2],
        [1.4, 4.1],
        [2.4 * k, 3.0],
        [3.6 * k, 2.2],
      ],
      0,
      3,
      (x, up) => Math.abs(x - door.cx) < door.half && up < door.height,
    );
    (cella.stones as Stone[]).push({
      path: polygon([
        project(v, -door.half, 0, z + 0.6),
        project(v, -door.half, door.height, z + 0.6),
        project(v, door.half, door.height, z + 0.6),
        project(v, door.half, 0, z + 0.6),
      ]),
      tone: 3,
    });
    const pieces: Piece[] = [cella];
    const xs = [-2.8, -1.4, 1.4, 2.8].map((x) => x * k);
    xs.forEach((x, i) =>
      pieces.push(column(v, x, z, 4.4, i === 3, 1, i === 0 ? 3 : undefined)),
    );
    pieces.push(
      lintel(v, xs[0]! - 0.4, xs[2]! + 0.4, z, 4.4, true, 1),
      pediment(v, z, xs[0]! - 0.4, xs[2]! + 0.4, 4.7, 1.0),
    );
    pieces.push(...steps(v, 0, 4.4, z - 0.1, 6.6 * k, 4, 0.12, 2));
    pieces.push(
      toppled(v, 3.2 * k, 4.6, 1.4),
      ...heap(v, -3.6 * k, 4.4, 1.1),
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

const compose = (name: string, v: View): Piece[] => {
  style = STYLES[name] ?? PLAIN;
  try {
    return (COMPOSITIONS[name] ?? COMPOSITIONS.courtyard!)(v);
  } finally {
    style = PLAIN;
  }
};

export const scenePieces = (name: string, v: View): Piece[] => {
  const pieces = compose(name, v);
  const kind = PLANTS[name];
  if (!kind) return pieces.sort((a, b) => b.z - a.z);
  /* Plants root at each piece's feet, sized by depth; a fixed sequence keeps them stable. */
  let n = 0;
  return pieces
    .map((piece) => ({
      ...piece,
      plants: piece.feet
        .filter((_, i) => kind === 'cover' || i % 2 === 0)
        .map(([x, z]): Plant => {
          n += 1;
          return {
            kind: n % 5 === 0 && kind !== 'cover' ? 'cover' : kind,
            x: x + ((((n * 37) % 11) - 5) * (0.04 * v.projection)) / z,
            y: v.horizon + v.projection / z,
            size: ((kind === 'shrub' ? 0.5 : 0.65) * v.projection) / z,
            phase: ((n * 61) % 100) / 100,
          };
        }),
    }))
    .sort((a, b) => b.z - a.z);
};

/* Each plant's growth: 0 bare to 1 full, with its own delay, then the shared loop's wither. */
const plantGrowth = (
  seconds: number,
  phase: number,
): { g: number; fade: number } => {
  const { grow, hold, wither, rest } = VINE_GROWTH;
  const cycle = grow + hold + wither + rest;
  const t = ((seconds % cycle) + cycle) % cycle;
  const delay = phase * grow * 0.35;
  const g = Math.max(0, Math.min(1, (t - delay) / (grow * 0.75)));
  const fade =
    t < grow + hold
      ? 1
      : t < grow + hold + wither
        ? 1 - (t - grow - hold) / wither
        : 0;
  return { g: 1 - (1 - g) * (1 - g), fade };
};

/* A tiny five-petal flower, a few pixels across. */
const tinyFlower = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  x: number,
  y: number,
  r: number,
  open: number,
): void => {
  if (open <= 0) return;
  const rr = r * (0.4 + 0.6 * open);
  ctx.fillStyle = palette.flower;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    ctx.moveTo(
      x + Math.cos(a) * rr * 0.9 + rr * 0.55,
      y + Math.sin(a) * rr * 0.9,
    );
    ctx.arc(
      x + Math.cos(a) * rr * 0.9,
      y + Math.sin(a) * rr * 0.9,
      rr * 0.55,
      0,
      Math.PI * 2,
    );
  }
  ctx.fill();
  ctx.fillStyle = palette.background;
  ctx.beginPath();
  ctx.arc(x, y, rr * 0.4, 0, Math.PI * 2);
  ctx.fill();
};

const leaf = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  angle: number,
): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
  ctx.fill();
  ctx.restore();
};

export const drawPlants = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  plants: readonly Plant[],
  seconds: number,
  lineWidth: number,
): void => {
  ctx.lineCap = 'round';
  for (const plant of plants) {
    const { g, fade } = plantGrowth(seconds, plant.phase);
    if (g <= 0 || fade <= 0) continue;
    const { x, y, size } = plant;
    const sway = Math.sin(seconds * 0.9 + plant.phase * 6.28) * 0.06;
    const bloom = Math.max(0, (g - 0.78) / 0.22);
    const flowerR = Math.max(1, size * 0.026);
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = palette.border;
    ctx.fillStyle = palette.subtle;
    ctx.lineWidth = Math.max(0.8, lineWidth * 0.6);
    if (plant.kind === 'grass') {
      const blades = 4 + Math.round(5 * g);
      ctx.beginPath();
      for (let i = 0; i < blades; i += 1) {
        const lean = (i / (blades - 1 || 1) - 0.5) * 1.1 + sway;
        const len = size * g * (0.55 + ((i * 29) % 7) * 0.07);
        const tx = x + Math.sin(lean) * len;
        const ty = y - Math.cos(lean) * len;
        ctx.moveTo(x + (i - blades / 2) * 0.8, y);
        ctx.quadraticCurveTo(
          x + Math.sin(lean) * len * 0.3,
          y - len * 0.6,
          tx,
          ty,
        );
      }
      ctx.stroke();
      ctx.globalAlpha = fade;
      for (let i = 2; i < blades; i += 4) {
        const lean = (i / (blades - 1 || 1) - 0.5) * 1.1 + sway;
        const len = size * g * (0.55 + ((i * 29) % 7) * 0.07);
        tinyFlower(
          ctx,
          palette,
          x + Math.sin(lean) * len,
          y - Math.cos(lean) * len,
          flowerR,
          bloom,
        );
      }
    } else if (plant.kind === 'shrub') {
      const branches = 3 + Math.round(2 * g);
      const tips: Point[] = [];
      ctx.beginPath();
      for (let i = 0; i < branches; i += 1) {
        const a = (i / (branches - 1) - 0.5) * 1.3 + sway;
        const len = size * 0.85 * g * (0.75 + ((i * 17) % 5) * 0.08);
        const tx = x + Math.sin(a) * len;
        const ty = y - Math.cos(a) * len;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x + Math.sin(a) * len * 0.2,
          y - len * 0.55,
          tx,
          ty,
        );
        tips.push([tx, ty]);
      }
      ctx.stroke();
      const unfurl = Math.max(0, Math.min(1, (g - 0.25) / 0.5));
      tips.forEach(([tx, ty], i) => {
        for (let k = 1; k <= 3; k += 1) {
          const f = k / 4;
          const lx = x + (tx - x) * f;
          const ly = y + (ty - y) * f;
          leaf(
            ctx,
            lx,
            ly,
            size * 0.22 * unfurl,
            -Math.PI / 2 + (k % 2 ? 0.9 : -0.9) + (i - branches / 2) * 0.2,
          );
        }
        leaf(
          ctx,
          tx,
          ty,
          size * 0.18 * unfurl,
          -Math.PI / 2 + (i % 2 ? 0.5 : -0.5),
        );
      });
      ctx.globalAlpha = fade;
      tips.forEach(([tx, ty], i) => {
        if (i % 2 === 0)
          tinyFlower(ctx, palette, tx, ty - flowerR, flowerR, bloom);
      });
    } else {
      /* Creeping cover: a dense mat of small leaves that spreads out and up the stone it roots against. */
      const spread = size * (0.5 + 2.1 * g);
      const rise = size * (0.1 + 0.75 * g);
      const count = Math.round(10 + 46 * g);
      for (let i = 0; i < count; i += 1) {
        const f = ((i * 41) % count) / count - 0.5;
        const up = ((i * 23) % 11) / 11;
        const crown = 1 - (2 * f) ** 2;
        const lx = x + f * spread;
        const ly = y - up * rise * Math.max(0.15, crown);
        leaf(
          ctx,
          lx,
          ly,
          size * (0.1 + 0.05 * g),
          -Math.PI / 2 + f * 2.2 + (up - 0.5) + sway,
        );
      }
      ctx.globalAlpha = fade;
      for (let i = 0; i < 5; i += 1) {
        const f = ((i * 37) % 9) / 9 - 0.5;
        tinyFlower(
          ctx,
          palette,
          x + f * spread * 0.9,
          y - (1 - (2 * f) ** 2) * rise * 0.8 - flowerR,
          flowerR,
          bloom,
        );
      }
    }
  }
  ctx.globalAlpha = 1;
};

/* Tone strength: the line colour over the opaque ground, per tone, then per layer. */
const TONE_ALPHA: Record<Tone, number> = { 0: 0, 1: 0.1, 2: 0.24, 3: 0.62 };
const LAYER = [
  { tone: 0.8, line: 0.52, joint: 0.28 },
  { tone: 0.85, line: 0.68, joint: 0.3 },
  { tone: 1, line: 0.88, joint: 0.38 },
] as const;
const CAST_ALPHA = 0.12;
const STONE_BASE = 0.07;
const WEAR_ALPHA = 0.2;
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
