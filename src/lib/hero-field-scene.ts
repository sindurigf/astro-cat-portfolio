/*
 * Canvas-only simulation, deterministic per seed and box. CSS pixels; every
 * size derives from the projection, so the scene tuned against a 1440x780 comp
 * scales as one. A root lands at `horizon + projection / z`; no horizon line.
 */

/** Read from `--color-*` at runtime: check-tokens.mjs forbids raw hex here. */
export interface HeroPalette {
  /** `--color-gold-border`. */
  readonly border: string;
  /** `--color-gold-muted`. */
  readonly subtle: string;
  /** `--color-gold-bud`. */
  readonly bud: string;
  /** `--color-hero-ground`. Must be opaque: the poneglyph's faces fill with it. */
  readonly background: string;
  /*
   * Edges keep their hue: canvas gradients interpolate unpremultiplied, so
   * `transparent` would grey them.
   */
  /** `--color-hero-veil`. */
  readonly veil: string;
  /** `--color-hero-veil-edge`. */
  readonly veilEdge: string;
  /** `--color-hero-floor`. */
  readonly floor: string;
  /** `--color-hero-floor-edge`. */
  readonly floorEdge: string;
  /** `--color-hero-flower`: petals. */
  readonly flower: string;
}

export interface HeroField {
  /** CSS pixels. Call on first paint and on resize. */
  layout(width: number, height: number): void;
  /** CSS pixels; scales with the projection. */
  nearBlur(): number;
  /** Reduced motion: the poneglyph's flowers held open. */
  hold(still: boolean): void;
  /** Once per animation frame, not per layer. */
  step(seconds: number, delta: number): void;
  back(ctx: CanvasRenderingContext2D, seconds: number): void;
  mid(ctx: CanvasRenderingContext2D, seconds: number): void;
  near(ctx: CanvasRenderingContext2D, seconds: number): void;
}

export const REFERENCE_HEIGHT = 780;
export const REFERENCE_WIDTH = 1440;
export const REFERENCE_ASPECT = REFERENCE_WIDTH / REFERENCE_HEIGHT;

const HORIZON_RATIO = 398 / REFERENCE_HEIGHT;

const GROUND_RATIO = 930 / REFERENCE_HEIGHT;

export const GROUND_SPAN = GROUND_RATIO - HORIZON_RATIO;

/** Focal length times eye height at the reference box. */
export const REFERENCE_PROJECTION = GROUND_SPAN * REFERENCE_HEIGHT;

/*
 * Depth rooted on the bottom edge. The horizon derives from it, not reverse,
 * so a portrait frame keeps full ground and the spare height becomes sky.
 */
export const BOTTOM_DEPTH = GROUND_SPAN / (1 - HORIZON_RATIO);

/*
 * Floor on the aspect factor scaling the projection for narrow frames: lower
 * leaves a phone's sky empty, higher fills the screen with the field. Also the
 * nearest stem depth, since `z = projection / span`.
 */
export const FIELD_OF_VIEW_FLOOR = 0.68;

export const FRONT_DEPTH = 1.55;

/* Tuned with --color-hero-veil and --color-hero-floor in global.css. */
export const NEAR_BLUR = 1.4;

/* Deep enough that stems stand in front, so the poneglyph stands in the field. */
export const PONEGLYPH_DEPTH = 2.45;

export interface Stem {
  readonly z: number;
  /** `1 / z`. Drives opacity only, so fading does not change with the frame. */
  readonly scale: number;
  /** Relative to the reference box; equals `scale` at the comp's aspect. */
  readonly size: number;
  readonly x: number;
  readonly root: number;
  /** Apparent height, CSS pixels. */
  readonly height: number;
  readonly tone: number;
  readonly phase: number;
  readonly veil: number;
  /** Sideways offset at the tip, CSS pixels. */
  lean: number;
  leanRate: number;
  /** 0 to 1 through the bloom cycle; only stems at the poneglyph's foot flower. */
  readonly bloom?: number;
}

/*
 * Counts at the reference width; `spread` is clump spread in reference units.
 * `PONEGLYPH` straddles the poneglyph's depth, so it stands among stems.
 * `NEAR.near` is set in `layout` from the aspect factor.
 */
export const BANDS = {
  FAR: { count: 69, near: 4.2, far: 62, height: [0.6, 0.75], spread: 150 },
  GRASS: { count: 198, near: 9, far: 62, height: [0.2, 0.52], spread: 105 },
  MIDDLE: { count: 45, near: 2.6, far: 4.2, height: [0.58, 0.72], spread: 190 },
  PONEGLYPH: {
    count: 63,
    near: 1.7,
    far: 2.9,
    height: [0.34, 0.6],
    spread: 190,
  },
  NEAR: { count: 8, near: 0, far: 1.7, height: [0.78, 0.6], spread: 0 },
} as const;

/** Clump centres at the reference width. */
export const CLUMP_COUNT = 16;
/** Share of stems placed anywhere, not in a clump. */
export const STRAY_ODDS = 0.26;
/** Reference units. */
export const CLUMP_SPREAD = 140;
/** The near band covers the left of the field only; reference units. */
export const NEAR_BAND_LEFT = -140;
export const NEAR_BAND_WIDTH = 245;

export const NEAR_VEIL = 0.72;

/* Underdamped, so a gust leans a stem past the breeze's sway and it overshoots. */
export const SPRING = { stiffness: 42, damping: 5 } as const;

/** Caps lean on a pathological dt. */
export const LEAN_LIMIT_RATIO = 110 / REFERENCE_PROJECTION;

/* Fixed, so the field is identical on every load and screenshot. */
export const FIELD_SEED = 4211;

/** Numerical Recipes' LCG. */
export const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

/** Explicit cubic, `f` root to tip: buds need points a path cannot give. */
/** Bezier control points: lean and rise fractions, shared by drawing and buds. */
export const STEM_CURVE = {
  lean1: 0.18,
  rise1: 0.45,
  lean2: 0.62,
  rise2: 0.8,
} as const;

export const stemPoint = (
  x: number,
  root: number,
  height: number,
  lean: number,
  f: number,
): readonly [number, number] => {
  const m = 1 - f;
  const x1 = x + lean * STEM_CURVE.lean1;
  const y1 = root - height * STEM_CURVE.rise1;
  const x2 = x + lean * STEM_CURVE.lean2;
  const y2 = root - height * STEM_CURVE.rise2;
  return [
    m * m * m * x +
      3 * m * m * f * x1 +
      3 * m * f * f * x2 +
      f * f * f * (x + lean),
    m * m * m * root +
      3 * m * m * f * y1 +
      3 * m * f * f * y2 +
      f * f * f * (root - height),
  ];
};

/** The breeze's main wave; buds nod on it a little behind their stem. */
export const breezeWave = (x: number, phase: number, seconds: number): number =>
  x * 0.0028 + phase + seconds * 0.7;

/** Two sines at different rates, so the wind never visibly repeats. */
export const breeze = (x: number, phase: number, seconds: number): number =>
  Math.sin(breezeWave(x, phase, seconds)) +
  Math.sin(x * 0.0009 - seconds * 0.3) * 0.7;

/** Buds lag the stem's sway by `lag` radians so they do not look welded on. */
export const BUD_NOD = { lag: 0.5, amplitude: 0.16 } as const;

/** Breeze sway in reference units: a base plus a share by stem size. */
export const SWAY = { base: 3, bySize: 30 } as const;

/* Large enough to see at rest, small enough to stay a breeze. */
export const WIND_FORCE = 30;
export const WIND_WAVE = {
  rate: 0.0016,
  phaseShare: 0.7,
  speed: 0.55,
  floor: 0.35,
} as const;

/** Stem tone above which a bud takes the bud, then the muted colour. */
export const BUD_TONE = { bud: 0.78, subtle: 0.5 } as const;

/** By stem height in reference units, tallest first; shorter stems get none. */
export const BUD_TIERS = [
  { above: 200, count: 5, spacing: 0.11 },
  { above: 92, count: 3, spacing: 0.16 },
  { above: 42, count: 2, spacing: 0.19 },
] as const;

export const STALK_WIDTH = { min: 0.55, bySize: 3.1 } as const;
export const STEM_ALPHA = { base: 0.09, byScale: 0.5 } as const;
export const BUD_ALPHA = { lift: 0.16, max: 0.82 } as const;
/** Where the first bud sits, as a share of the stem from its root. */
export const BUD_START = 0.55;
export const BUD_SIZE = { min: 0.36, bySize: 2.3 } as const;

/* Horizon grass: too small for buds. Reference units. */
export const BUD_MIN_HEIGHT = 13;

/** Reference units above the horizon and deep; `peak` is its densest stop. */
export const VEIL = { above: 64, depth: 260, peak: 0.34 } as const;
export const FLOOR_HEIGHT = 230;

/** Stems deeper than this are painted behind the veil. */
export const VEIL_DEPTH = 7;
