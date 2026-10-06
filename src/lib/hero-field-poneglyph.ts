/*
 * The poneglyph and the flowers at its foot. Flat 2D: a carved front lit from
 * the left, a shaded side and top. Lengths are eye heights (`projection / z`
 * pixels each at depth `z`), bloom lengths are bud units.
 */
import type { HeroPalette } from './hero-field-scene';

const TAU = Math.PI * 2;

/** Centre as a share of the box, then eye heights; the side recedes up and right. */
export const PONEGLYPH = {
  x: 0.66,
  width: 0.66,
  height: 0.98,
  side: 0.17,
  rise: 0.09,
  plinth: 0.09,
  margin: 0.05,
} as const;

/* Ink over the ground per plane, and the outline's alpha; light falls from the left. */
const TONE = { face: 0.06, top: 0.02, side: 0.32, plinth: 0.14 } as const;
const OUTLINE_ALPHA = 0.85;
/* Cast to the right along the ground, eye heights, and its ink. */
const SHADOW = { reach: 0.42, alpha: 0.12 } as const;

/* An invented script on a 3 by 3 grid; strokes as flat [x, y, x, y, ...] runs. */
const GLYPHS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 0, 1, 0, -1],
  [-1, -1, -1, 1, 1, 1],
  [-1, 1, 0, -1, 1, 1],
  [-1, 0, 1, 0, 0, 1, 0, -1],
  [-1, -1, 1, 1, 1, -1],
  [1, 1, -1, 0, 1, -1],
  [-1, 1, 1, 1, 1, -1, -1, -1],
  [0, 1, 0, -1, -1, -1],
];
/* Columns across the face, the share of the face the script fills, and a glyph's share of its cell. */
const SCRIPT = { columns: 7, fill: 0.8, glyph: 0.3 } as const;
/* Cut, not drawn: a lit lip below each stroke, the groove above it. */
const CUT = { lip: 0.8, groove: 0.7 } as const;
/* Line widths as shares of one eye height in pixels. */
const LINE = { outline: 0.008, groove: 0.0045, lip: 0.006 } as const;

type Point = readonly [number, number];

export interface Stone {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly root: number;
  /** Pixels per eye height at its depth. */
  readonly unit: number;
}

export const stoneAt = (
  boxWidth: number,
  root: number,
  unit: number,
): Stone => {
  const centre = PONEGLYPH.x * boxWidth;
  const half = (PONEGLYPH.width * unit) / 2;
  const plinth = PONEGLYPH.plinth * unit;
  return {
    left: centre - half,
    right: centre + half,
    top: root - plinth - PONEGLYPH.height * unit,
    root,
    unit,
  };
};

const polygon = (ctx: CanvasRenderingContext2D, points: Point[]): void => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

/* A box's front, top and side, each the ground colour with ink over it. */
const block = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  unit: number,
  face: number,
): void => {
  const dx = PONEGLYPH.side * unit;
  const dy = PONEGLYPH.rise * unit;
  const planes: [Point[], number][] = [
    [
      [
        [x0, y0],
        [x0 + dx, y0 - dy],
        [x1 + dx, y0 - dy],
        [x1, y0],
      ],
      TONE.top,
    ],
    [
      [
        [x1, y0],
        [x1 + dx, y0 - dy],
        [x1 + dx, y1 - dy],
        [x1, y1],
      ],
      TONE.side,
    ],
    [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      face,
    ],
  ];
  ctx.lineJoin = 'round';
  ctx.lineWidth = LINE.outline * unit;
  for (const [points, tone] of planes) {
    polygon(ctx, points);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.background;
    ctx.fill();
    ctx.globalAlpha = tone;
    ctx.fillStyle = palette.border;
    ctx.fill();
    ctx.globalAlpha = OUTLINE_ALPHA;
    ctx.strokeStyle = palette.border;
    ctx.stroke();
  }
};

const script = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  { left, right, top, root, unit }: Stone,
): void => {
  const face = root - PONEGLYPH.plinth * unit - top;
  const cell = ((right - left) * SCRIPT.fill) / SCRIPT.columns;
  const rows = Math.floor((face * SCRIPT.fill) / cell);
  const x0 = (left + right) / 2 - (cell * SCRIPT.columns) / 2;
  const y0 = top + (face - rows * cell) / 2;
  const marks = new Path2D();
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < SCRIPT.columns; c += 1) {
      const glyph = GLYPHS[(r * 7 + c * 3 + ((r * c) % 5)) % GLYPHS.length]!;
      const cx = x0 + (c + 0.5) * cell;
      const cy = y0 + (r + 0.5) * cell;
      for (let k = 0; k < glyph.length; k += 2) {
        const x = cx + glyph[k]! * cell * SCRIPT.glyph;
        const y = cy - glyph[k + 1]! * cell * SCRIPT.glyph;
        if (k) marks.lineTo(x, y);
        else marks.moveTo(x, y);
      }
    }
  ctx.lineCap = 'round';
  ctx.save();
  ctx.translate(LINE.lip * unit * 0.4, LINE.lip * unit * 0.8);
  ctx.globalAlpha = CUT.lip;
  ctx.strokeStyle = palette.background;
  ctx.lineWidth = LINE.lip * unit;
  ctx.stroke(marks);
  ctx.restore();
  ctx.globalAlpha = CUT.groove;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = LINE.groove * unit;
  ctx.stroke(marks);
};

export const drawPoneglyph = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  stone: Stone,
): void => {
  const { left, right, top, root, unit } = stone;
  const margin = PONEGLYPH.margin * unit;
  const plinthTop = root - PONEGLYPH.plinth * unit;
  const reach = SHADOW.reach * unit;
  polygon(ctx, [
    [left - margin, root],
    [right + margin + PONEGLYPH.side * unit, root - PONEGLYPH.rise * unit],
    [right + margin + reach, root - PONEGLYPH.rise * unit * 0.5],
    [right + margin + reach * 0.6, root],
  ]);
  ctx.globalAlpha = SHADOW.alpha;
  ctx.fillStyle = palette.border;
  ctx.fill();
  block(
    ctx,
    palette,
    [left - margin, plinthTop, right + margin, root],
    unit,
    TONE.plinth,
  );
  block(ctx, palette, [left, top, right, plinthTop], unit, TONE.face);
  script(ctx, palette, stone);
  ctx.globalAlpha = 1;
};

/*
 * One bloom, seconds: the pod swells, opens (sepals part, petals grow out of
 * it and fan apart), holds while breathing, closes the same way back, then
 * the pod relaxes. Each flower runs on its own phase.
 */
const BLOOM = {
  period: 12.5,
  swell: 1.2,
  open: 3,
  hold: 5,
  close: 2.6,
  /* Seconds after an earlier petal that the next one starts. */
  stagger: 0.12,
} as const;
/* Breathing while open: scale amplitude and period in seconds. */
const BREATH = { scale: 0.03, period: 2.6 } as const;
/*
 * Bud units. The pod is a teardrop `pod` wide and `tall` high; open, petals
 * `reach` long and `width` wide fan round it, about twice the pod's width.
 */
const PETAL = {
  pod: 1.82,
  tall: 3.22,
  reach: 2.7,
  width: 1.2,
  rim: 1,
  count: 5,
} as const;
/* Ink over each petal's inner half, and stamens round the centre. */
const HEAD = { tone: 0.3, stamens: 7 } as const;
/* How far, in radians, each sepal swings out from the pod's axis when fully open. */
const SPLIT = 1.05;
/* Share of the opening the sepals part alone before petals show. */
const EMERGE = 0.12;
/* Below this, the ink rim falls under 3:1 against the ground (SC 1.4.11). */
export const FLOWER_ALPHA = 0.66;

export interface Bloom {
  /** 0 resting to 1 swollen. */
  readonly swell: number;
  /** 0 shut to 1 open; the same curve opens and closes. */
  readonly open: number;
  /** Breathing scale while open. */
  readonly breath: number;
}

const OPEN: Bloom = { swell: 1, open: 1, breath: 1 };

/* Zero slope and zero curvature at both ends, so nothing starts or stops with a jolt. */
const smoother = (x: number): number =>
  x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10);

/** `phase` 0 to 1 staggers each flower's cycle. */
export const bloomOf = (
  phase: number,
  seconds: number,
  still: boolean,
): Bloom => {
  if (still) return OPEN;
  const { period, swell, open, hold, close } = BLOOM;
  const t = (((seconds + phase * period) % period) + period) % period;
  const shut = swell + open + hold;
  const o = smoother((t - swell) / open) - smoother((t - shut) / close);
  return {
    swell:
      smoother(t / swell) -
      smoother((t - shut - close) / (period - shut - close)),
    open: o,
    breath: 1 + BREATH.scale * o * Math.sin((t * TAU) / BREATH.period),
  };
};

/*
 * A pod at a stem's tip, turned by `angle`. Opening, its two halves swing
 * apart as sepals from the base while the petals grow out of the split, first
 * pointing up together, then fanning round the centre; closing runs back.
 */
export const drawBloom = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  [x, y]: Point,
  bud: number,
  angle: number,
  { swell, open, breath }: Bloom,
  alpha: number,
): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = bud * PETAL.pod * (0.85 + 0.15 * swell);
  const h = bud * PETAL.tall * (0.85 + 0.15 * swell);
  const base = h * 0.35;
  const sepals = new Path2D();
  const part = SPLIT * smoother(open / 0.7);
  for (const side of [-1, 1]) {
    const c = Math.cos(side * part);
    const s = Math.sin(side * part);
    const at = (px: number, py: number): Point => [
      px * c - (py - base) * s,
      base + px * s + (py - base) * c,
    ];
    sepals.moveTo(...at(0, -h));
    sepals.quadraticCurveTo(...at(side * w, -h * 0.1), ...at(0, base));
    sepals.quadraticCurveTo(...at(side * w * 0.15, -h * 0.4), ...at(0, -h));
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.bud;
  ctx.fill(sepals);
  if (open > 0) {
    /* The flower's centre sits inside the pod, so its petals come out of the split. */
    const hub = -h * 0.15;
    const step = BLOOM.stagger / BLOOM.open;
    const petals = new Path2D();
    const inner = new Path2D();
    for (let k = 0; k < PETAL.count; k += 1) {
      /* Each petal's own progress, a little behind the one before. */
      const f = smoother(
        (open - EMERGE - k * step) / (1 - EMERGE - (PETAL.count - 1) * step),
      );
      if (f <= 0) continue;
      /* From pointing up, bunched, to its place in the ring round the top. */
      const up = -Math.PI / 2 + (k - 2) * 0.16;
      const a = up + (k - 2) * (TAU / PETAL.count - 0.16) * f;
      const len = bud * PETAL.reach * f * breath;
      const wid = bud * PETAL.width * (0.35 + 0.65 * f);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const at = (u: number, v: number): Point => [
        u * c - v * s,
        hub + u * s + v * c,
      ];
      const shape = (g: number, path: Path2D): void => {
        path.moveTo(...at(0, 0));
        path.quadraticCurveTo(
          ...at(len * 0.3 * g, -wid * g),
          ...at(len * 0.88 * g, -wid * 0.62 * g),
        );
        path.quadraticCurveTo(
          ...at(len * g, -wid * 0.25 * g),
          ...at(len * 0.93 * g, 0),
        );
        path.quadraticCurveTo(
          ...at(len * g, wid * 0.25 * g),
          ...at(len * 0.88 * g, wid * 0.62 * g),
        );
        path.quadraticCurveTo(...at(len * 0.3 * g, wid * g), ...at(0, 0));
      };
      shape(1, petals);
      shape(0.5, inner);
    }
    /* Stamens come out last, as the flower finishes opening. */
    const eyes = new Path2D();
    const dot = (px: number, py: number, r: number): void => {
      if (r <= 0) return;
      eyes.moveTo(px + r, hub + py);
      eyes.arc(px, hub + py, r, 0, TAU);
    };
    dot(0, 0, bud * 0.24 * smoother((open - EMERGE) / 0.4));
    const ring = bud * 0.7 * smoother((open - 0.5) / 0.5);
    if (ring > 0)
      for (let k = 0; k < HEAD.stamens; k += 1) {
        const a = (k * TAU) / HEAD.stamens;
        dot(Math.cos(a) * ring, Math.sin(a) * ring, bud * 0.18);
      }
    const flower = Math.max(alpha, FLOWER_ALPHA);
    ctx.globalAlpha = flower;
    ctx.fillStyle = palette.flower;
    ctx.fill(petals);
    ctx.globalAlpha = flower * HEAD.tone;
    ctx.fillStyle = palette.bud;
    ctx.fill(inner);
    ctx.globalAlpha = flower;
    ctx.strokeStyle = palette.bud;
    ctx.lineWidth = PETAL.rim;
    ctx.lineJoin = 'round';
    ctx.stroke(petals);
    ctx.fill(eyes);
  }
  ctx.restore();
};
