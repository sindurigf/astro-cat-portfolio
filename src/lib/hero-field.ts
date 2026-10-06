/*
 * Mutable per-box state and drawing. Constants and the projection model are in
 * hero-field-scene.ts; use-hero-field.ts owns the canvases and the frame loop.
 */
import {
  BANDS,
  BOTTOM_DEPTH,
  BUD_ALPHA,
  BUD_MIN_HEIGHT,
  BUD_NOD,
  BUD_SIZE,
  BUD_START,
  BUD_TIERS,
  BUD_TONE,
  CLUMP_COUNT,
  CLUMP_SPREAD,
  NEAR_BAND_LEFT,
  NEAR_BAND_WIDTH,
  STEM_CURVE,
  STRAY_ODDS,
  SWAY,
  WIND_FORCE,
  WIND_WAVE,
  breezeWave,
  FIELD_OF_VIEW_FLOOR,
  EXTRA_SEED,
  EXTRA_STEMS,
  FIELD_SEED,
  FRONT_DEPTH,
  GROUND_SPAN,
  PONEGLYPH_DEPTH,
  LEAN_LIMIT_RATIO,
  NEAR_BLUR,
  NEAR_VEIL,
  REFERENCE_ASPECT,
  REFERENCE_HEIGHT,
  REFERENCE_PROJECTION,
  REFERENCE_WIDTH,
  SPRING,
  STALK_WIDTH,
  STEM_ALPHA,
  VEIL,
  VEIL_DEPTH,
  FLOOR_HEIGHT,
  breeze,
  random,
  stemPoint,
} from './hero-field-scene';
import { drawPoneglyph, stoneAt } from './hero-field-poneglyph';
import {
  FLOWER_ALPHA,
  SPIRE,
  drawPea,
  floretPhase,
  openness,
} from './hero-field-spire';
import type { Stone } from './hero-field-poneglyph';
import type { HeroField, HeroPalette, Stem } from './hero-field-scene';

interface Scene {
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly horizon: number;
  readonly projection: number;
  /** Projection relative to the comp's; every length scales by it. */
  readonly world: number;
  /** Nearest visible depth; where `BANDS.NEAR` starts. */
  readonly view: number;
  readonly stone: Stone;
}

type Band = (typeof BANDS)[keyof typeof BANDS];

interface FieldState {
  scene: Scene;
  stems: Stem[];
  still: boolean;
}

const groundAt = (scene: Scene, z: number): number =>
  scene.horizon + scene.projection / z;

const sceneFor = (width: number, height: number): Scene => {
  const boxWidth = Math.max(1, width);
  const boxHeight = Math.max(1, height);
  const aspect = Math.min(1, boxWidth / boxHeight / REFERENCE_ASPECT);
  const view = Math.max(FIELD_OF_VIEW_FLOOR, aspect);
  const projection = GROUND_SPAN * boxHeight * view;
  const horizon = boxHeight - projection / BOTTOM_DEPTH;
  return {
    boxWidth,
    boxHeight,
    horizon,
    projection,
    world: projection / REFERENCE_PROJECTION,
    view,
    stone: stoneAt(
      boxWidth,
      horizon + projection / PONEGLYPH_DEPTH,
      projection / PONEGLYPH_DEPTH,
    ),
  };
};

const clumpCentres = (
  { boxWidth }: Scene,
  rng: () => number,
  density: number,
  margin: number,
): number[] =>
  Array.from(
    { length: Math.max(4, Math.round(CLUMP_COUNT * density)) },
    () => -margin + rng() * (boxWidth + margin * 2),
  );

/* About three quarters of stems cluster on clump centres; the rest scatter. */
const clumpPlacer = (
  { boxWidth, world }: Scene,
  clumps: readonly number[],
  rng: () => number,
  margin: number,
): ((spread: number) => number) => {
  return (spread) => {
    if (rng() < STRAY_ODDS) return -margin + rng() * (boxWidth + margin * 2);
    const centre = clumps[Math.floor(rng() * clumps.length)] ?? boxWidth / 2;
    /* Difference of two uniforms: triangular, densest at the centre. */
    return centre + (rng() - rng()) * spread * world;
  };
};

/* Stems over their band's height ratio; near stems keep theirs so they stay below the name. */
const STEM_HEIGHT = 1.3;

const makeStem = (
  scene: Scene,
  rng: () => number,
  z: number,
  x: number,
  heightRatio: number,
  veil: number,
): Stem => {
  const root = groundAt(scene, z);
  return {
    z,
    scale: 1 / z,
    size: (root - scene.horizon) / REFERENCE_PROJECTION,
    x,
    root,
    height: heightRatio * (root - scene.horizon),
    tone: rng(),
    phase: rng() * Math.PI * 2,
    veil,
    lean: 0,
    leanRate: 0,
  };
};

/* Density is per scene width, not pixels: a stepped-back camera shows more. */
const buildStems = (scene: Scene): Stem[] => {
  const { world, view } = scene;
  const density = scene.boxWidth / world / REFERENCE_WIDTH;
  const margin = CLUMP_SPREAD * world;
  const rng = random(FIELD_SEED);
  const clumps = clumpCentres(scene, rng, density, margin);
  const built: Stem[] = [];

  const sow = (next: () => number, share: number, nearTip = -Infinity) => {
    const clumped = clumpPlacer(scene, clumps, next, margin);
    const band = (spec: Band, veil: number, acrossFullWidth: boolean): void => {
      const count = Math.round(
        Math.max(2, Math.round(spec.count * density)) * share,
      );
      for (let i = 0; i < count; i += 1) {
        /* Log-uniform in distance; uniform piles stems up at the horizon. */
        const near = spec.near || view;
        const z = near * Math.pow(spec.far / near, next());
        const x = acrossFullWidth
          ? clumped(spec.spread)
          : NEAR_BAND_LEFT * world + next() * NEAR_BAND_WIDTH * world;
        const height =
          (spec.height[0] + next() * spec.height[1]) *
          (spec === BANDS.NEAR ? 1 : STEM_HEIGHT);
        const stem = makeStem(scene, next, z, x, height, veil);
        /* Never above `nearTip`, so a later sowing cannot reach the name. */
        const rise = Math.min(stem.height, stem.root - nearTip);
        built.push(rise < stem.height ? { ...stem, height: rise } : stem);
      }
    };

    band(BANDS.FAR, 1, true);
    band(BANDS.GRASS, 1, true);
    band(BANDS.MIDDLE, 1, true);
    band(BANDS.PONEGLYPH, 1, true);
    /* Near stems stay at the left edge, veiled, so they never blur over type. */
    band(BANDS.NEAR, NEAR_VEIL, false);
  };

  sow(rng, 1);
  const nearTip = Math.min(
    ...built
      .filter((stem) => stem.z < BANDS.NEAR.far)
      .map((stem) => stem.root - stem.height),
  );
  /* Its own seed, so the stems above keep their places. */
  sow(random(EXTRA_SEED), EXTRA_STEMS, nearTip);

  return built;
};

/* Spires: this share of the budding stems between these depths. */
const SPIRES = { share: 0.09, near: 1.6, far: 4.4 } as const;

const frac = (x: number): number => x - Math.floor(x);

/* Chosen and phased from each stem's own phase, so the same stems flower on every load. */
const withSpires = (stems: readonly Stem[], world: number): Stem[] =>
  stems.map((stem) =>
    stem.height >= BUD_MIN_HEIGHT * world &&
    stem.z > SPIRES.near &&
    stem.z < SPIRES.far &&
    frac(stem.phase * 7.31) < SPIRES.share
      ? { ...stem, spire: frac(stem.phase * 3.7) }
      : stem,
  );

const settle = (
  stem: Stem,
  force: number,
  delta: number,
  limit: number,
): void => {
  stem.leanRate +=
    (-SPRING.stiffness * stem.lean - SPRING.damping * stem.leanRate + force) *
    delta;
  stem.lean += stem.leanRate * delta;
  if (Math.abs(stem.lean) > limit) {
    stem.lean = Math.sign(stem.lean) * limit;
    stem.leanRate = 0;
  }
};

const budTone = (palette: HeroPalette, tone: number): string => {
  if (tone > BUD_TONE.bud) return palette.bud;
  if (tone > BUD_TONE.subtle) return palette.subtle;
  return palette.border;
};

const budLayout = (tall: number): { count: number; spacing: number } =>
  BUD_TIERS.find(({ above }) => tall > above) ?? { count: 0, spacing: 0 };

const drawStalk = (
  ctx: CanvasRenderingContext2D,
  stem: Stem,
  lean: number,
): void => {
  ctx.lineCap = 'round';
  ctx.lineWidth = STALK_WIDTH.min + stem.size * STALK_WIDTH.bySize;
  ctx.beginPath();
  ctx.moveTo(stem.x, stem.root);
  ctx.bezierCurveTo(
    stem.x + lean * STEM_CURVE.lean1,
    stem.root - stem.height * STEM_CURVE.rise1,
    stem.x + lean * STEM_CURVE.lean2,
    stem.root - stem.height * STEM_CURVE.rise2,
    stem.x + lean,
    stem.root - stem.height,
  );
  ctx.stroke();
};

/* Buds fill, never just stroke, or stalks show through them as wire loops. */
const drawBuds = (
  ctx: CanvasRenderingContext2D,
  stem: Stem,
  lean: number,
  bud: number,
  seconds: number,
  world: number,
): void => {
  const { count, spacing } = budLayout(stem.height / world);
  const nod =
    Math.sin(breezeWave(stem.x, stem.phase, seconds) - BUD_NOD.lag) *
    BUD_NOD.amplitude;

  for (let i = 0; i < count; i += 1) {
    const [bx, by] = stemPoint(
      stem.x,
      stem.root,
      stem.height,
      lean,
      BUD_START + i * spacing,
    );
    const side = i % 2 ? 1 : -1;
    ctx.save();
    ctx.translate(bx + side * 3 * bud, by);
    ctx.rotate(side * 0.3 + nod);
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.4 * bud, 4.2 * bud, 0, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
  }
};

const drawHead = (
  ctx: CanvasRenderingContext2D,
  stem: Stem,
  lean: number,
  bud: number,
): void => {
  const [tx, ty] = stemPoint(stem.x, stem.root, stem.height, lean, 1);
  ctx.beginPath();
  ctx.ellipse(
    tx,
    ty - 4 * bud,
    Math.max(0.75, 2.7 * bud),
    Math.max(1.3, 5.2 * bud),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
};

/* A floret's unit per unit of stem size: a pea-flower about the size of a bud pair. */
const FLORET = 8;

/* Detail steps down with distance, with a minimum drawn size at each step. */
const drawStem = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  world: number,
  stem: Stem,
  lean: number,
  seconds: number,
  still: boolean,
): void => {
  const alpha =
    (STEM_ALPHA.base + Math.sqrt(stem.scale) * STEM_ALPHA.byScale) * stem.veil;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = palette.border;
  drawStalk(ctx, stem, lean);

  if (stem.height < BUD_MIN_HEIGHT * world) return;

  const bud = Math.max(BUD_SIZE.min, stem.size * BUD_SIZE.bySize);
  ctx.globalAlpha = Math.min(BUD_ALPHA.max, alpha + BUD_ALPHA.lift);
  /* Buds and head fill from strokeStyle. */
  ctx.strokeStyle = budTone(palette, stem.tone);
  if (stem.spire === undefined) {
    drawBuds(ctx, stem, lean, bud, seconds, world);
    drawHead(ctx, stem, lean, bud);
    return;
  }
  const nod =
    Math.sin(breezeWave(stem.x, stem.phase, seconds) - BUD_NOD.lag) *
    BUD_NOD.amplitude;
  const open = Math.max(ctx.globalAlpha, FLOWER_ALPHA);
  for (let k = 0; k < SPIRE.florets; k += 1) {
    const f = SPIRE.from + ((SPIRE.to - SPIRE.from) * k) / (SPIRE.florets - 1);
    drawPea(
      ctx,
      palette,
      stemPoint(stem.x, stem.root, stem.height, lean, f),
      stem.size * FLORET,
      k % 2 ? 1 : -1,
      nod * 0.5,
      openness(floretPhase(stem.spire, k), seconds, still),
      open,
    );
  }
};

/* Painted between far and near stems so it veils only the distance. */
const drawVeil = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  scene: Scene,
): void => {
  const top = scene.horizon - VEIL.above * scene.world;
  const depth = VEIL.depth * scene.world;
  const gradient = ctx.createLinearGradient(0, top, 0, top + depth);
  gradient.addColorStop(0, palette.veilEdge);
  gradient.addColorStop(VEIL.peak, palette.veil);
  gradient.addColorStop(1, palette.veilEdge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, scene.boxWidth, depth);
};

/* On the back layer: on the front it would darken the poneglyph. */
const drawFloor = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  scene: Scene,
): void => {
  const { boxWidth, boxHeight } = scene;
  const top = boxHeight - FLOOR_HEIGHT * scene.world;
  const gradient = ctx.createLinearGradient(0, top, 0, boxHeight);
  gradient.addColorStop(0, palette.floorEdge);
  gradient.addColorStop(1, palette.floor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, boxWidth, boxHeight - top);
};

const paintWhere = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  { scene, stems, still }: FieldState,
  seconds: number,
  inLayer: (z: number) => boolean,
): void => {
  for (const stem of stems) {
    if (!inLayer(stem.z)) continue;
    const wind =
      breeze(stem.x, stem.phase, seconds) *
      (SWAY.base + stem.size * SWAY.bySize) *
      scene.world;
    drawStem(ctx, palette, scene.world, stem, wind + stem.lean, seconds, still);
  }
  ctx.globalAlpha = 1;
};

const windForce = (stem: Stem, seconds: number, world: number): number =>
  Math.sin(
    stem.x * WIND_WAVE.rate +
      stem.phase * WIND_WAVE.phaseShare +
      seconds * WIND_WAVE.speed,
  ) *
  WIND_FORCE *
  (WIND_WAVE.floor + stem.size) *
  world;

const stepSprings = (
  { scene, stems }: FieldState,
  seconds: number,
  delta: number,
): void => {
  const limit = LEAN_LIMIT_RATIO * scene.projection;
  for (const stem of stems)
    settle(stem, windForce(stem, seconds, scene.world), delta, limit);
};

const drawBack = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  state: FieldState,
  seconds: number,
): void => {
  paintWhere(ctx, palette, state, seconds, (z) => z > VEIL_DEPTH);
  drawVeil(ctx, palette, state.scene);
  paintWhere(
    ctx,
    palette,
    state,
    seconds,
    (z) => z <= VEIL_DEPTH && z >= PONEGLYPH_DEPTH,
  );
  drawFloor(ctx, palette, state.scene);
  ctx.globalAlpha = 1;
};

/* The poneglyph, then every stem in front of it down to the near plane. */
const drawMid = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  state: FieldState,
  seconds: number,
): void => {
  drawPoneglyph(ctx, palette, state.scene.stone);
  paintWhere(
    ctx,
    palette,
    state,
    seconds,
    (z) => z < PONEGLYPH_DEPTH && z >= FRONT_DEPTH,
  );
};

export const createHeroField = (palette: HeroPalette): HeroField => {
  const state: FieldState = {
    /* A draw before the first layout must not divide by zero. */
    scene: sceneFor(REFERENCE_WIDTH, REFERENCE_HEIGHT),
    stems: [],
    still: false,
  };

  return {
    layout(width: number, height: number): void {
      state.scene = sceneFor(width, height);
      state.stems = withSpires(buildStems(state.scene), state.scene.world).sort(
        (a, b) => b.z - a.z,
      );
    },
    hold: (still) => {
      state.still = still;
    },
    step: (seconds, delta) => stepSprings(state, seconds, delta),
    back: (ctx, seconds) => drawBack(ctx, palette, state, seconds),
    mid: (ctx, seconds) => drawMid(ctx, palette, state, seconds),
    nearBlur: () => NEAR_BLUR * state.scene.world,
    near: (ctx, seconds) =>
      paintWhere(ctx, palette, state, seconds, (z) => z < FRONT_DEPTH),
  };
};
