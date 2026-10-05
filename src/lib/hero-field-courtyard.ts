import type { HeroPalette } from './hero-field-scene';
/*
 * The courtyard ruins as authored geometry: hand-placed silhouettes and stone
 * courses in world units (x across from the centre, up from the ground, z depth),
 * projected once per layout. Every stone is an opaque polygon with a tone, so
 * the masonry has value, not just outline.
 */

export type Point = readonly [number, number];

/** 0 lit face, 1 mid, 2 shade, 3 a hole where a stone is missing. */
export type Tone = 0 | 1 | 2 | 3;

export interface Stone {
  readonly path: Path2D;
  readonly tone: Tone;
}

export interface Piece {
  /** Paint order: deeper first. */
  readonly z: number;
  /** 0 back, 1 middle, 2 front: sets line and tone strength. */
  readonly layer: 0 | 1 | 2;
  readonly stones: readonly Stone[];
  readonly outline: Path2D;
  /** Fine lines: cracks, joints inside a stone. */
  readonly detail: Path2D;
  /** Ground shadow cast by the piece. */
  readonly cast: Path2D;
  /** Where weeds root: screen x, depth, spread in pixels. */
  readonly feet: ReadonlyArray<readonly [number, number, number]>;
  /** Lines vines climb, in screen space. */
  readonly climbs: readonly (readonly Point[])[];
}

interface View {
  readonly cx: number;
  readonly horizon: number;
  readonly projection: number;
}

/* The side walls stand at this world x on a wide frame; narrower frames pull them in to stay on screen. */
const SIDE_X = 4.4;
const SIDE_NEAR = 2.6;
const widthShare = (v: View): number =>
  Math.min(1, (0.92 * v.cx * SIDE_NEAR) / v.projection / SIDE_X);

const project = (v: View, x: number, up: number, z: number): Point => [
  v.cx + (x * v.projection) / z,
  v.horizon + (v.projection / z) * (1 - up),
];

/* Fixed tone and width sequences: authored, so the wall looks the same on every load. */
const TONES: readonly Tone[] = [
  0, 1, 0, 2, 1, 0, 1, 1, 2, 0, 1, 0, 3, 1, 0, 2, 1, 1, 0, 1,
];
const WIDTHS: readonly number[] = [
  0.82, 0.55, 1.1, 0.68, 0.94, 0.6, 1.25, 0.74, 0.5, 0.98,
];
const COURSE = 0.26;

const polygon = (pts: readonly Point[]): Path2D => {
  const path = new Path2D();
  path.moveTo(...pts[0]!);
  pts.slice(1).forEach((pt) => path.lineTo(...pt));
  path.closePath();
  return path;
};

/* Height of a profile at x, by linear steps between its authored points. */
const heightAt = (profile: readonly Point[], x: number): number => {
  for (let i = 1; i < profile.length; i += 1) {
    const [x0, h0] = profile[i - 1]!;
    const [x1, h1] = profile[i]!;
    if (x <= x1) return h0 + ((h1 - h0) * (x - x0)) / Math.max(1e-6, x1 - x0);
  }
  return profile[profile.length - 1]![1];
};

/*
 * The back wall: a long front-facing wall with a gate whose keystone is gone,
 * a collapsed bay on the right, a jagged top. Coordinates in world units at `z`.
 */
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
const GATE = { x: -2.5, half: 0.75, spring: 1.15 } as const;

const backWall = (v: View, z: number): Piece => {
  const stones: Stone[] = [];
  const detail = new Path2D();
  const outlinePts: Point[] = [[-6, 0], ...BACK_TOP, [6, 0]];
  const outline = polygon(outlinePts.map(([x, up]) => project(v, x, up, z)));
  let index = 0;
  for (let row = 0; row * COURSE < 2.8; row += 1) {
    const y0 = row * COURSE;
    const y1 = y0 + COURSE;
    let x = -6 - (row % 2) * 0.4;
    while (x < 6) {
      const w = WIDTHS[(index * 3 + row) % WIDTHS.length]!;
      const x0 = Math.max(-6, x);
      const x1 = Math.min(6, x + w);
      x += w;
      index += 1;
      const top = Math.min(heightAt(BACK_TOP, x0), heightAt(BACK_TOP, x1));
      if (y1 > top + COURSE * 0.4) continue;
      /* The gate opening: no stones inside the arch. */
      const mid = (x0 + x1) / 2;
      if (
        Math.abs(mid - GATE.x) < GATE.half &&
        y0 <
          GATE.spring +
            Math.sqrt(Math.max(0, GATE.half ** 2 - (mid - GATE.x) ** 2))
      )
        continue;
      const cap = Math.min(y1, top);
      stones.push({
        path: polygon([
          project(v, x0, y0, z),
          project(v, x0, cap, z),
          project(v, x1, cap, z),
          project(v, x1, y0, z),
        ]),
        tone: TONES[index % TONES.length]!,
      });
    }
  }
  /* Arch ring of voussoirs; the keystone is missing. */
  const inner = GATE.half;
  const outer = GATE.half + 0.32;
  const count = 9;
  for (let k = 0; k < count; k += 1) {
    if (k === Math.floor(count / 2)) continue;
    const a0 = Math.PI + (Math.PI * k) / count;
    const a1 = Math.PI + (Math.PI * (k + 1)) / count;
    const at = (a: number, r: number): Point =>
      project(v, GATE.x + Math.cos(a) * r, GATE.spring - Math.sin(a) * r, z);
    stones.push({
      path: polygon([
        at(a0, inner),
        at(a0, outer),
        at(a1, outer),
        at(a1, inner),
      ]),
      tone: k % 2 ? 0 : 1,
    });
  }
  /* The opening itself, dark. */
  const opening: Point[] = [
    project(v, -GATE.half, 0, z),
    project(v, -GATE.half, GATE.spring, z),
  ];
  for (let k = 0; k <= 12; k += 1) {
    const a = Math.PI + (Math.PI * k) / 12;
    opening.push(
      project(
        v,
        GATE.x + Math.cos(a) * GATE.half,
        GATE.spring - Math.sin(a) * GATE.half,
        z,
      ),
    );
  }
  opening.push(project(v, GATE.half, 0, z));
  stones.push({ path: polygon(opening), tone: 3 });
  /* Rubble spilled from the collapsed bay. */
  for (const [x, w, h] of [
    [2.7, 0.5, 0.3],
    [3.2, 0.7, 0.42],
    [3.8, 0.45, 0.25],
    [3.5, 0.35, 0.6],
  ] as const) {
    stones.push({
      path: polygon([
        project(v, x - w / 2, 0, z),
        project(v, x - w / 2 + 0.08, h, z),
        project(v, x + w / 2 - 0.05, h * 0.85, z),
        project(v, x + w / 2, 0, z),
      ]),
      tone: 0,
    });
  }
  detail.moveTo(...project(v, -3.9, 1.6, z));
  detail.lineTo(...project(v, -3.7, 1.1, z));
  detail.lineTo(...project(v, -3.85, 0.7, z));
  const feet: Array<readonly [number, number, number]> = [];
  for (let x = -5.5; x <= 5.5; x += 1.1)
    feet.push([project(v, x, 0, z)[0], z, (0.5 * v.projection) / z]);
  for (let x = -5; x < 5; x += 1.9)
    feet.push([
      project(v, x, heightAt(BACK_TOP, x), z)[0],
      z * 1.01,
      (0.25 * v.projection) / z,
    ]);
  return {
    z,
    layer: 0,
    stones,
    outline,
    detail,
    cast: new Path2D(),
    feet,
    climbs: [],
  };
};

/*
 * A side wall in perspective at world x `side * 4.4`, from depth `near` to `far`.
 * The top profile is authored along the wall's length (0 near, 1 far).
 */
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
const LENGTHS: readonly number[] = [
  0.07, 0.05, 0.09, 0.06, 0.08, 0.05, 0.1, 0.07,
];

const sideWall = (v: View, side: -1 | 1, near: number, far: number): Piece => {
  const x = side * SIDE_X * widthShare(v);
  const thick = 0.45;
  const zAt = (t: number): number => near * Math.pow(far / near, t);
  const stones: Stone[] = [];
  const outlinePts: Point[] = [project(v, x, 0, near)];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    outlinePts.push(project(v, x, heightAt(SIDE_TOP, t), zAt(t)));
  }
  outlinePts.push(project(v, x, 0, far));
  const outline = polygon(outlinePts);
  /* Wall face, stone by stone; the right wall's face is turned from the light. */
  let index = side > 0 ? 5 : 0;
  for (let row = 0; row * COURSE < 1.6; row += 1) {
    const y0 = row * COURSE;
    let t = (row % 2) * 0.03;
    while (t < 1) {
      const len = LENGTHS[(index + row) % LENGTHS.length]!;
      const t0 = t;
      const t1 = Math.min(1, t + len);
      t = t1;
      index += 1;
      const top = Math.min(heightAt(SIDE_TOP, t0), heightAt(SIDE_TOP, t1));
      if (y0 + COURSE > top + COURSE * 0.35) continue;
      const cap = Math.min(y0 + COURSE, top);
      const base = TONES[index % TONES.length]!;
      const tone: Tone =
        base === 3 ? 3 : side > 0 ? (Math.min(2, base + 1) as Tone) : base;
      stones.push({
        path: polygon([
          project(v, x, y0, zAt(t0)),
          project(v, x, cap, zAt(t0)),
          project(v, x, cap, zAt(t1)),
          project(v, x, y0, zAt(t1)),
        ]),
        tone,
      });
    }
  }
  /* The lit top of the wall, set back toward the centre by its thickness. */
  const topPts: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const up = heightAt(SIDE_TOP, t);
    topPts.push(project(v, x, up, zAt(t)));
    inner.push(project(v, x - side * thick, up, zAt(t)));
  }
  stones.push({ path: polygon([...topPts, ...inner.reverse()]), tone: 0 });
  /* Its shadow falls toward the centre across the paving. */
  const castPts: Point[] = [];
  for (let i = 0; i <= 20; i += 1) castPts.push(project(v, x, 0, zAt(i / 20)));
  for (let i = 20; i >= 0; i -= 1)
    castPts.push(
      project(v, x - side * heightAt(SIDE_TOP, i / 20) * 0.5, 0, zAt(i / 20)),
    );
  const feet: Array<readonly [number, number, number]> = [];
  for (let t = 0.05; t < 1; t += 0.11)
    feet.push([
      project(v, x - side * 0.1, 0, zAt(t))[0],
      zAt(t),
      (0.4 * v.projection) / zAt(t),
    ]);
  feet.push([
    project(v, x, heightAt(SIDE_TOP, 0.48), zAt(0.48))[0],
    zAt(0.48) * 0.99,
    (0.3 * v.projection) / zAt(0.48),
  ]);
  const climb: Point[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const f = i / 24;
    const t = 0.22 + Math.sin(f * Math.PI * 3) * 0.015;
    climb.push(
      project(v, x - side * 0.05, heightAt(SIDE_TOP, 0.24) * 0.95 * f, zAt(t)),
    );
  }
  return {
    z: far + 0.01,
    layer: 1,
    stones,
    outline,
    detail: new Path2D(),
    cast: polygon(castPts),
    feet,
    climbs: [climb],
  };
};

/* Front rubble: authored boulders and a toppled column drum, in world units. */
const RUBBLE: ReadonlyArray<readonly [number, number, number, number, number]> =
  [
    // x, z, width, height, tone
    [-3.9, 3.1, 0.9, 0.42, 0],
    [-3.2, 3.3, 0.6, 0.3, 1],
    [-3.55, 3.0, 0.45, 0.62, 2],
    [3.7, 3.4, 0.8, 0.38, 1],
    [3.15, 3.2, 0.55, 0.26, 0],
  ];

const rubble = (v: View): Piece[] =>
  RUBBLE.map(([wx, z, w, h, tone]) => {
    const x = wx * widthShare(v);
    const pts: Point[] = [
      project(v, x - w / 2, 0, z),
      project(v, x - w * 0.45, h * 0.8, z),
      project(v, x - w * 0.1, h, z),
      project(v, x + w * 0.3, h * 0.9, z),
      project(v, x + w / 2, h * 0.5, z),
      project(v, x + w / 2, 0, z),
    ];
    const lit: Point[] = [
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
        { path: polygon(pts), tone: tone as Tone },
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
        [
          project(v, x - w / 2, 0, z)[0],
          z * 0.98,
          (w * 0.4 * v.projection) / z,
        ],
        [
          project(v, x + w / 2, 0, z)[0],
          z * 0.98,
          (w * 0.3 * v.projection) / z,
        ],
      ],
      climbs: [],
    };
  });

/* A toppled column: a lying fluted shaft, its broken end toward the centre. */
const toppled = (v: View, x: number, z: number): Piece => {
  const len = 1.6;
  const r = 0.2;
  const left = x - len / 2;
  const right = x + len / 2;
  /* The broken end is jagged; the cut end is the visible drum face. */
  const shaft: Point[] = [
    project(v, left + 0.06, 0, z),
    project(v, left, r * 0.6, z),
    project(v, left + 0.1, r * 1.1, z),
    project(v, left + 0.02, r * 1.6, z),
    project(v, left + 0.12, r * 2, z),
    project(v, right, r * 2, z),
    project(v, right, 0, z),
  ];
  const stones: Stone[] = [
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
  ];
  const end = new Path2D();
  const [ex, ey] = project(v, right, r, z);
  const rr = (r * v.projection) / z;
  end.ellipse(ex, ey, rr * 0.4, rr, 0, 0, Math.PI * 2);
  stones.push({ path: end, tone: 2 });
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
    stones,
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

export const courtyardPieces = (v: View): Piece[] =>
  [
    backWall(v, 10),
    sideWall(v, -1, SIDE_NEAR, 10),
    sideWall(v, 1, SIDE_NEAR, 10),
    toppled(v, 1.7 * widthShare(v), 3.9),
    ...rubble(v),
  ].sort((a, b) => b.z - a.z);

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
