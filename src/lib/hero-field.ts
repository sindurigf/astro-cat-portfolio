/*
 * Mutable per-box state and drawing. Constants and the projection model are in
 * hero-field-scene.ts; HeroField.vue owns the canvases and the frame loop.
 */
import {
  BANDS,
  BLOOM_PERIOD,
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
  FLOWER_ODDS,
  NARROW_ASPECT,
  NEAR_BAND_LEFT,
  NEAR_BAND_WIDTH,
  PETAL,
  STEM_CURVE,
  STRAY_ODDS,
  SWAY,
  TABLET_DEPTH,
  WIND_FORCE,
  WIND_WAVE,
  breezeWave,
  FIELD_OF_VIEW_FLOOR,
  FIELD_SEED,
  FRONT_DEPTH,
  GROUND_SPAN,
  LEAN_LIMIT_RATIO,
  NEAR_BLUR,
  NEAR_VEIL,
  REFERENCE_ASPECT,
  REFERENCE_HEIGHT,
  REFERENCE_PROJECTION,
  REFERENCE_WIDTH,
  RUINS,
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
import { buildRuins, drawRuin } from './hero-field-ruins';
import type { Ruin } from './hero-field-ruins';
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
}

type Band = (typeof BANDS)[keyof typeof BANDS];

interface FieldState {
  scene: Scene;
  stems: Stem[];
  ruins: Ruin[];
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
  };
};

/* About three quarters of stems cluster on clump centres; the rest scatter. */
const clumpPlacer = (
  scene: Scene,
  rng: () => number,
  density: number,
  margin: number,
  anchors: readonly number[],
): ((spread: number) => number) => {
  const { boxWidth, world } = scene;
  /* Weeds gather at the foot of every ruin as well as in open ground. */
  const clumps: number[] = [...anchors];
  const clumpCount = Math.max(4, Math.round(CLUMP_COUNT * density));
  for (let i = 0; i < clumpCount; i += 1) {
    clumps.push(-margin + rng() * (boxWidth + margin * 2));
  }
  return (spread) => {
    if (rng() < STRAY_ODDS) return -margin + rng() * (boxWidth + margin * 2);
    const centre = clumps[Math.floor(rng() * clumps.length)] ?? boxWidth / 2;
    /* Difference of two uniforms: triangular, densest at the centre. */
    return centre + (rng() - rng()) * spread * world;
  };
};

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
    flower: rng() < FLOWER_ODDS,
  };
};

/* Density is per scene width, not pixels: a stepped-back camera shows more. */
const buildStems = (scene: Scene, anchors: readonly number[]): Stem[] => {
  const { world, view } = scene;
  const density = scene.boxWidth / world / REFERENCE_WIDTH;
  const rng = random(FIELD_SEED);
  const clumped = clumpPlacer(
    scene,
    rng,
    density,
    CLUMP_SPREAD * world,
    anchors,
  );
  const built: Stem[] = [];

  const band = (spec: Band, veil: number, acrossFullWidth: boolean): void => {
    const count = Math.max(2, Math.round(spec.count * density));
    for (let i = 0; i < count; i += 1) {
      /* Log-uniform in distance; uniform piles stems up at the horizon. */
      const near = spec.near || view;
      const z = near * Math.pow(spec.far / near, rng());
      const x = acrossFullWidth
        ? clumped(spec.spread)
        : NEAR_BAND_LEFT * world + rng() * NEAR_BAND_WIDTH * world;
      const height = spec.height[0] + rng() * spec.height[1];
      built.push(makeStem(scene, rng, z, x, height, veil));
    }
  };

  band(BANDS.FAR, 1, true);
  band(BANDS.GRASS, 1, true);
  band(BANDS.MIDDLE, 1, true);
  band(BANDS.TABLET, 1, true);
  /* Near stems stay at the left edge, veiled, so they never blur over type. */
  band(BANDS.NEAR, NEAR_VEIL, false);

  return built.sort((a, b) => b.z - a.z);
};

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

/* Opens and closes on its own phase; half the cycle fully open. */
const bloomOf = (stem: Stem, seconds: number): number =>
  Math.min(
    1,
    Math.max(
      0,
      0.5 + Math.sin((seconds / BLOOM_PERIOD) * Math.PI * 2 + stem.phase) * 1.4,
    ),
  );

const drawFlower = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  stem: Stem,
  lean: number,
  bud: number,
  seconds: number,
): void => {
  const [tx, ty] = stemPoint(stem.x, stem.root, stem.height, lean, 1);
  const open = bloomOf(stem, seconds);
  const grow = PETAL.closed + (1 - PETAL.closed) * open;
  const spread = PETAL.spread * bud * grow;
  const radius = Math.max(0.8, PETAL.radius * bud * grow);
  ctx.fillStyle = palette.flower;
  ctx.beginPath();
  for (let i = 0; i < PETAL.count; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / PETAL.count;
    const px = tx + Math.cos(angle) * spread;
    const py = ty + Math.sin(angle) * spread;
    ctx.moveTo(px + radius, py);
    ctx.arc(px, py, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(tx, ty, Math.max(0.6, radius * 0.75), 0, Math.PI * 2);
  ctx.fill();
};

/* Detail steps down with distance, with a minimum drawn size at each step. */
const drawStem = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  world: number,
  stem: Stem,
  lean: number,
  seconds: number,
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
  drawBuds(ctx, stem, lean, bud, seconds, world);
  if (stem.flower) drawFlower(ctx, palette, stem, lean, bud, seconds);
  else drawHead(ctx, stem, lean, bud);
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

/* On the back layer: on the front it would darken the tablet. */
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

/* Stems and ruins both run far to near, so each ruin lands between the right stems. */
const paintWhere = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  { scene, stems, ruins }: FieldState,
  seconds: number,
  inLayer: (z: number) => boolean,
): void => {
  let next = 0;
  for (const stem of stems) {
    if (!inLayer(stem.z)) continue;
    while (next < ruins.length && ruins[next]!.z >= stem.z) {
      if (inLayer(ruins[next]!.z)) drawRuin(ctx, palette, ruins[next]!);
      next += 1;
    }
    const wind =
      breeze(stem.x, stem.phase, seconds) *
      (SWAY.base + stem.size * SWAY.bySize) *
      scene.world;
    drawStem(ctx, palette, scene.world, stem, wind + stem.lean, seconds);
  }
  for (; next < ruins.length; next += 1) {
    if (inLayer(ruins[next]!.z)) drawRuin(ctx, palette, ruins[next]!);
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
  for (const stem of stems) {
    settle(stem, windForce(stem, seconds, scene.world), delta, limit);
  }
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
    (z) => z <= VEIL_DEPTH && z > TABLET_DEPTH,
  );
  drawFloor(ctx, palette, state.scene);
  ctx.globalAlpha = 1;
};

const drawMid = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  state: FieldState,
  seconds: number,
): void => {
  paintWhere(
    ctx,
    palette,
    state,
    seconds,
    (z) => z <= TABLET_DEPTH && z >= FRONT_DEPTH,
  );
};

export const createHeroField = (palette: HeroPalette): HeroField => {
  const state: FieldState = {
    /* A draw before the first layout must not divide by zero. */
    scene: sceneFor(REFERENCE_WIDTH, REFERENCE_HEIGHT),
    stems: [],
    ruins: [],
  };

  return {
    layout(width: number, height: number): void {
      state.scene = sceneFor(width, height);
      const { boxWidth, horizon, projection } = state.scene;
      state.ruins = buildRuins(
        {
          boxWidth,
          horizon,
          projection,
          referenceProjection: REFERENCE_PROJECTION,
        },
        width / height < NARROW_ASPECT,
      );
      state.stems = buildStems(
        state.scene,
        RUINS.map((ruin) => ruin.x * boxWidth),
      );
    },
    step: (seconds, delta) => stepSprings(state, seconds, delta),
    back: (ctx, seconds) => drawBack(ctx, palette, state, seconds),
    mid: (ctx, seconds) => drawMid(ctx, palette, state, seconds),
    nearBlur: () => NEAR_BLUR * state.scene.world,
    near: (ctx, seconds) =>
      paintWhere(ctx, palette, state, seconds, (z) => z < FRONT_DEPTH),
  };
};
