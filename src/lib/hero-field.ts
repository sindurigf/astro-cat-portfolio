/*
 * Mutable per-box state and drawing. Constants and the projection model are in
 * hero-field-scene.ts; HeroField.vue owns the canvases and the frame loop.
 */
import {
  BANDS,
  NEAR_BAND_LEFT,
  NEAR_BAND_WIDTH,
  NEAR_BAND_SHARE,
  NEAR_VEIL,
  BLOOM_PERIOD,
  BOTTOM_DEPTH,
  BUD_ALPHA,
  BUD_MIN_HEIGHT,
  BUD_NOD,
  BUD_SIZE,
  BUD_START,
  BUD_TIERS,
  BUD_TONE,
  FLOWER_ODDS,
  STEM_CURVE,
  SWAY,
  MID_DEPTH,
  WIND_FORCE,
  WIND_WAVE,
  breezeWave,
  FIELD_OF_VIEW_FLOOR,
  FIELD_SEED,
  FRONT_DEPTH,
  GROUND_SPAN,
  LEAN_LIMIT_RATIO,
  NEAR_BLUR,
  REFERENCE_ASPECT,
  REFERENCE_HEIGHT,
  REFERENCE_PROJECTION,
  REFERENCE_WIDTH,
  NARROW_ZOOM,
  SPARSE,
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
import { paving, drawPetals, drawRuin, pieceRuin } from './hero-field-ruins';
import { scenePieces } from './hero-field-courtyard';
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

interface FieldState {
  scene: Scene;
  stems: Stem[];
  ruins: Ruin[];
}

const groundAt = (scene: Scene, z: number): number =>
  scene.horizon + scene.projection / z;

const sceneFor = (width: number, height: number, zoom = 1): Scene => {
  const boxWidth = Math.max(1, width);
  const boxHeight = Math.max(1, height);
  const aspect = Math.min(1, boxWidth / boxHeight / REFERENCE_ASPECT);
  const view = Math.max(FIELD_OF_VIEW_FLOOR, aspect);
  const projection =
    GROUND_SPAN * boxHeight * view * (boxWidth < boxHeight ? zoom : 1);
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

const makeStem = (
  scene: Scene,
  rng: () => number,
  z: number,
  x: number,
  heightRatio: number,
  veil: number,
  flowerOdds = FLOWER_ODDS,
  petal: number = WEEDS.petal,
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
    /* Neither far stems nor the blurred near layer flower: both would read as loose marks. */
    flower: rng() < flowerOdds && z < VEIL_DEPTH && z >= FRONT_DEPTH,
    curl: (rng() - 0.5) * heightRatio * (root - scene.horizon) * 0.35,
    petal,
  };
};

/* A few stems at the left edge, veiled and blurred, so they never cross the type. */
const nearStems = (scene: Scene): Stem[] => {
  /* On a portrait frame they would cross the centre; leave them out. */
  if (scene.boxWidth <= scene.boxHeight) return [];
  const { world, view } = scene;
  const rng = random(FIELD_SEED);
  const spec = BANDS.NEAR;
  return Array.from({ length: NEAR_STEMS }, () => {
    const near = spec.near || view;
    const z = near * Math.pow(spec.far / near, rng());
    const x = Math.min(
      NEAR_BAND_LEFT * world + rng() * NEAR_BAND_WIDTH * world,
      scene.boxWidth * NEAR_BAND_SHARE,
    );
    const height = spec.height[0] + rng() * spec.height[1];
    return makeStem(scene, rng, z, x, height, NEAR_VEIL);
  });
};

interface Anchor {
  readonly x: number;
  readonly z: number;
  /** Half the ruin's apparent width, CSS pixels. */
  readonly span: number;
  /** Stems at this foot, overriding the per-ruin default. */
  readonly count?: number;
}

/* Tufts at each ruin's foot at its own depth, a little far grass, clear ground between. */
const buildSparse = (scene: Scene, anchors: readonly Anchor[]): Stem[] => {
  const rng = random(FIELD_SEED);
  const built: Stem[] = [];
  const density = scene.boxWidth / scene.world / REFERENCE_WIDTH;
  for (
    let i = 0;
    i < Math.round(BANDS.FAR.count * density * SPARSE.far);
    i += 1
  ) {
    const z = BANDS.FAR.near * Math.pow(BANDS.FAR.far / BANDS.FAR.near, rng());
    built.push(
      makeStem(scene, rng, z, rng() * scene.boxWidth, 0.4 + rng() * 0.5, 1),
    );
  }
  for (const anchor of anchors) {
    const count = Math.round((anchor.count ?? WEEDS.perFoot) * WEEDS.share);
    for (let i = 0; i < count; i += 1) {
      const z = anchor.z * (SPARSE.front + rng() * SPARSE.depth);
      const side = rng() < 0.5 ? -1 : 1;
      const x = anchor.x + side * anchor.span * (0.55 + rng() * 0.6);
      const height = SPARSE.height[0] + rng() * SPARSE.height[1];
      built.push(
        makeStem(scene, rng, z, x, height, 1, WEEDS.flowers, WEEDS.petal),
      );
    }
  }
  return built;
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
/** Below this share of opening a flower draws as a closed bud. */
const BUD_CLOSED = 0.2;

const bloomOf = (stem: Stem, seconds: number): number =>
  Math.min(
    1,
    Math.max(
      0,
      0.5 + Math.sin((seconds / BLOOM_PERIOD) * Math.PI * 2 + stem.phase) * 1.4,
    ),
  );

/* About one flower in this many has a faint blush at its centre. */
const BLUSH_EVERY = 9;

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
  const size = bud * stem.petal;
  /* Shut, it is a small bud in the bud colour; it opens into tiny petals. */
  if (open < BUD_CLOSED) {
    ctx.fillStyle = palette.bud;
    ctx.beginPath();
    ctx.ellipse(
      tx,
      ty,
      Math.max(0.7, 1.4 * size),
      Math.max(1, 2.4 * size),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    return;
  }
  drawPetals(
    ctx,
    palette,
    tx,
    ty,
    size,
    (open - BUD_CLOSED) / (1 - BUD_CLOSED),
    Math.round(stem.phase * 100) % BLUSH_EVERY === 0,
  );
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

/* On the back layer: on the front it would darken the stone. */
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
      if (inLayer(ruins[next]!.z))
        drawRuin(ctx, palette, ruins[next]!, seconds);
      next += 1;
    }
    const wind =
      breeze(stem.x, stem.phase, seconds) *
      (SWAY.base + stem.size * SWAY.bySize) *
      scene.world;
    drawStem(
      ctx,
      palette,
      scene.world,
      stem,
      wind + stem.lean + stem.curl,
      seconds,
    );
  }
  for (; next < ruins.length; next += 1) {
    if (inLayer(ruins[next]!.z)) drawRuin(ctx, palette, ruins[next]!, seconds);
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
    (z) => z <= VEIL_DEPTH && z > MID_DEPTH,
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
    (z) => z <= MID_DEPTH && z >= FRONT_DEPTH,
  );
};

/* Stems per ruin foot and a multiplier on every foot; flowering share and petal size. */
const WEEDS = { perFoot: 4, share: 1.3, flowers: 0.75, petal: 0.5 } as const;
const NEAR_STEMS = 2;

export const createHeroField = (palette: HeroPalette): HeroField => {
  const state: FieldState = {
    /* A draw before the first layout must not divide by zero. */
    scene: sceneFor(REFERENCE_WIDTH, REFERENCE_HEIGHT),
    stems: [],
    ruins: [],
  };

  return {
    layout(width: number, height: number): void {
      state.scene = sceneFor(width, height, NARROW_ZOOM);
      const { boxWidth, horizon, projection } = state.scene;
      const box = {
        boxWidth,
        horizon,
        projection,
        referenceProjection: REFERENCE_PROJECTION,
      };
      state.ruins = [
        ...scenePieces({ cx: boxWidth / 2, horizon, projection }).map((piece) =>
          pieceRuin(piece, box),
        ),
        paving(box),
      ].sort((a, b) => b.z - a.z);
      const feet = state.ruins.flatMap((ruin) =>
        ruin.feet.map(([x, z, span, count]) => ({ x, z, span, count })),
      );
      state.stems = [
        ...nearStems(state.scene),
        ...buildSparse(state.scene, feet),
      ].sort((a, b) => b.z - a.z);
    },
    step: (seconds, delta) => stepSprings(state, seconds, delta),
    back: (ctx, seconds) => drawBack(ctx, palette, state, seconds),
    mid: (ctx, seconds) => drawMid(ctx, palette, state, seconds),
    nearBlur: () => NEAR_BLUR * state.scene.world,
    near: (ctx, seconds) =>
      paintWhere(ctx, palette, state, seconds, (z) => z < FRONT_DEPTH),
  };
};
