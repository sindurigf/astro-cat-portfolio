/*
 * The poneglyph. Flat 2D: a carved front lit from the left, a shaded side and
 * top. Lengths are eye heights (`projection / z` pixels each at depth `z`).
 * Every 24 s its script lights row by row, top to bottom.
 */
import type { HeroPalette } from './hero-field-scene';

/** Centre as a share of the box, then eye heights; the side recedes up and right. */
export const PONEGLYPH = {
  x: 0.66,
  width: 1.29,
  height: 1.91,
  side: 0.255,
  rise: 0.135,
  plinth: 0.135,
  margin: 0.075,
} as const;

/* Ink over the ground per plane, and the outline's alpha; light falls from the left. */
const TONE = { face: 0.06, top: 0.02, side: 0.32, plinth: 0.14 } as const;
const OUTLINE_ALPHA = 0.85;
/* Cast to the right along the ground, eye heights, and its ink. */
const SHADOW = { reach: 0.63, alpha: 0.12 } as const;

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

/* Seconds per ripple, and each row's start, rise, hold and fall: slow ramps, far under 3 a second (SC 2.3.1). */
export const RIPPLE_CYCLE = 24;
const GLOW = {
  start: 0.6,
  row: 0.44,
  rise: 1.4,
  hold: 2.8,
  fall: 2.4,
} as const;

/* Zero slope and zero curvature at both ends, so nothing starts or stops with a jolt. */
const smoother = (x: number): number =>
  x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10);

/** 0 to 1: how lit glyph row `row` is. Never lit in the reduced-motion still. */
export const glyphLight = (
  row: number,
  seconds: number,
  still: boolean,
): number => {
  if (still) return 0;
  const t =
    (((seconds % RIPPLE_CYCLE) + RIPPLE_CYCLE) % RIPPLE_CYCLE) -
    GLOW.start -
    row * GLOW.row;
  return (
    smoother(t / GLOW.rise) - smoother((t - GLOW.rise - GLOW.hold) / GLOW.fall)
  );
};

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
  const half = (PONEGLYPH.width * unit) / 2;
  /* Pulled left on a narrow frame, so the side and plinth stay inside the box. */
  const centre = Math.min(
    PONEGLYPH.x * boxWidth,
    boxWidth - half - (PONEGLYPH.side + 2 * PONEGLYPH.margin) * unit,
  );
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
  seconds: number,
  still: boolean,
): void => {
  const face = root - PONEGLYPH.plinth * unit - top;
  const cell = ((right - left) * SCRIPT.fill) / SCRIPT.columns;
  const rows = Math.floor((face * SCRIPT.fill) / cell);
  const x0 = (left + right) / 2 - (cell * SCRIPT.columns) / 2;
  const y0 = top + (face - rows * cell) / 2;
  const marks = new Path2D();
  const lines: Path2D[] = [];
  for (let r = 0; r < rows; r += 1) {
    const line = new Path2D();
    lines.push(line);
    for (let c = 0; c < SCRIPT.columns; c += 1) {
      const glyph = GLYPHS[(r * 7 + c * 3 + ((r * c) % 5)) % GLYPHS.length]!;
      const cx = x0 + (c + 0.5) * cell;
      const cy = y0 + (r + 0.5) * cell;
      for (let k = 0; k < glyph.length; k += 2) {
        const x = cx + glyph[k]! * cell * SCRIPT.glyph;
        const y = cy - glyph[k + 1]! * cell * SCRIPT.glyph;
        if (k) {
          marks.lineTo(x, y);
          line.lineTo(x, y);
        } else {
          marks.moveTo(x, y);
          line.moveTo(x, y);
        }
      }
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
  /*
   * A lit row thickens into a full-ink rim (6.60:1 on the dark face, 16.43:1
   * on the light, SC 1.4.11) with the glow colour inside it.
   */
  lines.forEach((line, r) => {
    const light = glyphLight(r, seconds, still);
    if (light <= 0) return;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = LINE.groove * unit * (1 + 2.6 * light);
    ctx.stroke(line);
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = LINE.groove * unit * 1.5 * light;
    ctx.stroke(line);
  });
};

export const drawPoneglyph = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  stone: Stone,
  seconds: number,
  still: boolean,
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
  /* A soft contact shadow, so the base sits on the ground rather than over it. */
  const cx = (left + right) / 2 + PONEGLYPH.side * unit * 0.5;
  const rx = (right - left) / 2 + margin + PONEGLYPH.side * unit;
  ctx.save();
  ctx.translate(cx, root - PONEGLYPH.rise * unit * 0.3);
  ctx.scale(1, 0.16);
  /* Stacked translucent discs, ink only: a gradient to the ground would veil stems behind. */
  ctx.fillStyle = palette.border;
  ctx.globalAlpha = 0.05;
  for (let k = 0; k < 6; k += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, rx * (1.25 - k * 0.13), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  block(
    ctx,
    palette,
    [left - margin, plinthTop, right + margin, root],
    unit,
    TONE.plinth,
  );
  block(ctx, palette, [left, top, right, plinthTop], unit, TONE.face);
  script(ctx, palette, stone, seconds, still);
  ctx.globalAlpha = 1;
};
