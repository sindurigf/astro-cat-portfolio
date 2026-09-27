/*
 * Mutable per-box state and drawing. Constants and the projection model are in
 * hero-field-scene.ts; HeroField.vue owns the canvases and the frame loop.
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
  HOP_BASE_SECONDS,
  HOP_SPEED,
  NEAR_BAND_LEFT,
  NEAR_BAND_WIDTH,
  SPEED_SAMPLE_SECONDS,
  STEM_CURVE,
  STRAY_ODDS,
  SWAY,
  WIND_FORCE,
  WIND_WAVE,
  breezeWave,
  FIELD_OF_VIEW_FLOOR,
  FIELD_SEED,
  FOOT_Y,
  FRONT_DEPTH,
  GROUND_SPAN,
  MASCOT_DEPTH,
  MASCOT_UNIT,
  HOPS,
  LEAN_LIMIT_RATIO,
  NEAR_BLUR,
  NEAR_VEIL,
  REACH_AHEAD,
  REACH_BEHIND,
  REACH_DEPTH,
  REFERENCE_ASPECT,
  REFERENCE_HEIGHT,
  REFERENCE_PROJECTION,
  REFERENCE_WIDTH,
  REST_LONG,
  REST_LONG_ODDS,
  REST_MIN_HOPS,
  REST_ODDS,
  REST_SHORT,
  ROUTE_MARGIN,
  ROUTE_SEED,
  SPEED_LIMIT_RATIO,
  SIT,
  SPRING,
  STALK_WIDTH,
  STEM_ALPHA,
  VEIL,
  VEIL_DEPTH,
  FLOOR_HEIGHT,
  REACH,
  breeze,
  random,
  stemPoint,
} from './hero-field-scene';
import { drawCat, hopFrame } from './hero-field-cat';
import type {
  HeroField,
  HeroPalette,
  Route,
  RoutePoint,
  Segment,
  Stem,
} from './hero-field-scene';

interface Scene {
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly horizon: number;
  readonly projection: number;
  /** Projection relative to the comp's; every length scales by it. */
  readonly world: number;
  /** Nearest visible depth; where `BANDS.NEAR` starts. */
  readonly view: number;
  readonly mascotRoot: number;
  readonly mascotScale: number;
}

type Band = (typeof BANDS)[keyof typeof BANDS];

interface FieldState {
  scene: Scene;
  stems: Stem[];
  route: Route;
  /* One-entry memo of `routePoint`, keyed on the frame's exact time. */
  cachedAt: number;
  cached: RoutePoint;
}

const STILL: RoutePoint = { x: 0, cycle: 0, sit: 0, hop: 0 };

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
    mascotRoot: horizon + projection / MASCOT_DEPTH,
    mascotScale: (projection / MASCOT_DEPTH) * MASCOT_UNIT,
  };
};

/* About three quarters of stems cluster on clump centres; the rest scatter. */
const clumpPlacer = (
  scene: Scene,
  rng: () => number,
  density: number,
  margin: number,
): ((spread: number) => number) => {
  const { boxWidth, world } = scene;
  const clumps: number[] = [];
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
  };
};

/* Density is per scene width, not pixels: a stepped-back camera shows more. */
const buildStems = (scene: Scene): Stem[] => {
  const { world, view } = scene;
  const density = scene.boxWidth / world / REFERENCE_WIDTH;
  const rng = random(FIELD_SEED);
  const clumped = clumpPlacer(scene, rng, density, CLUMP_SPREAD * world);
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
  band(BANDS.MASCOT, 1, true);
  /* Near stems stay at the left edge, veiled, so they never blur over type. */
  band(BANDS.NEAR, NEAR_VEIL, false);

  return built.sort((a, b) => b.z - a.z);
};

const restSegment = (x: number, rng: () => number): Segment => ({
  kind: 'rest',
  duration: rng() < REST_LONG_ODDS ? REST_LONG : REST_SHORT,
  x0: x,
  x1: x,
  hop: 0,
  start: 0,
});

const hopSegment = (x: number, rng: () => number, world: number): Segment => {
  const roll = rng();
  const hop =
    HOPS.find((candidate) => roll < candidate.odds) ?? HOPS[HOPS.length - 1];
  return {
    kind: 'hop',
    duration: HOP_BASE_SECONDS + hop.distance / HOP_SPEED,
    x0: x,
    x1: x + hop.distance * world,
    hop: hop.height * world,
    start: 0,
  };
};

/* Pixels across the box; hop length scales with the projection. */
const buildRoute = ({ boxWidth, world }: Scene): Route => {
  const rng = random(ROUTE_SEED);
  const segments: Segment[] = [];
  const edge = ROUTE_MARGIN * world;
  let x = -edge;
  let sinceRest = 0;

  while (x < boxWidth + edge) {
    if (sinceRest > REST_MIN_HOPS - 1 && rng() < REST_ODDS) {
      segments.push(restSegment(x, rng));
      sinceRest = 0;
    } else {
      const segment = hopSegment(x, rng, world);
      segments.push(segment);
      x = segment.x1;
      sinceRest += 1;
    }
  }

  let total = 0;
  for (const segment of segments) {
    segment.start = total;
    total += segment.duration;
  }
  return { segments, total: Math.max(total, 0.001) };
};

const routePoint = (route: Route, seconds: number): RoutePoint => {
  const local = ((seconds % route.total) + route.total) % route.total;
  for (const segment of route.segments) {
    if (local >= segment.start + segment.duration) continue;
    const f = (local - segment.start) / segment.duration;
    if (segment.kind === 'rest') {
      return {
        x: segment.x0,
        cycle: 0,
        hop: 0,
        sit: Math.max(
          0,
          Math.min(1, Math.sin(Math.min(1, f * SIT.rate) * Math.PI) * SIT.gain),
        ),
      };
    }
    return {
      x: segment.x0 + (segment.x1 - segment.x0) * f,
      cycle: f,
      sit: 0,
      hop: segment.hop,
    };
  }
  return STILL;
};

const mascotForce = (
  stem: Stem,
  mascotX: number,
  speed: number,
  world: number,
): number => {
  const depth = Math.abs(stem.z - MASCOT_DEPTH) / MASCOT_DEPTH;
  if (depth >= REACH_DEPTH) return 0;
  const reach = (REACH.base + stem.size * REACH.bySize) * world;
  const gap = stem.x - mascotX;
  if (Math.abs(gap) >= reach) return 0;
  const proximity = 1 - Math.abs(gap) / reach;
  const side = gap * speed < 0 ? REACH_BEHIND : REACH_AHEAD;
  return (
    proximity *
    proximity *
    (1 - depth / REACH_DEPTH) *
    speed *
    SPRING.impulse *
    side
  );
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
  drawHead(ctx, stem, lean, bud);
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

/* On the back layer: on the front it would darken the mascot. */
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

/*
 * Shrinks, fades and blurs as the mascot rises; the alpha floor keeps a contact
 * point at the top of a hop.
 */
const SHADOW_SHRINK = 0.45;
const SHADOW_ALPHA_FLOOR = 0.08;
const SHADOW_ALPHA_RANGE = 0.14;
const SHADOW_BLUR = 3.2;

const drawMascotShadow = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  scene: Scene,
  x: number,
  air: number,
): void => {
  const shrink = 1 - air * SHADOW_SHRINK;
  ctx.globalAlpha = SHADOW_ALPHA_FLOOR + SHADOW_ALPHA_RANGE * (1 - air);
  ctx.filter = `blur(${(air * SHADOW_BLUR * scene.mascotScale).toFixed(2)}px)`;
  ctx.fillStyle = palette.border;
  ctx.beginPath();
  ctx.ellipse(
    x,
    scene.mascotRoot + 2,
    30 * scene.mascotScale * shrink,
    4.2 * scene.mascotScale * shrink,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
};

const routeAt = (state: FieldState, seconds: number): RoutePoint => {
  if (seconds !== state.cachedAt) {
    state.cachedAt = seconds;
    state.cached = routePoint(state.route, seconds);
  }
  return state.cached;
};

const paintWhere = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  { scene, stems }: FieldState,
  seconds: number,
  inLayer: (z: number) => boolean,
): void => {
  for (const stem of stems) {
    if (!inLayer(stem.z)) continue;
    const wind =
      breeze(stem.x, stem.phase, seconds) *
      (SWAY.base + stem.size * SWAY.bySize) *
      scene.world;
    drawStem(ctx, palette, scene.world, stem, wind + stem.lean, seconds);
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
  state: FieldState,
  seconds: number,
  delta: number,
): void => {
  const { scene, stems, route } = state;
  const here = routeAt(state, seconds);
  /* By difference, so a rest reads as zero; the guard drops the edge wrap. */
  let speed =
    (here.x - routePoint(route, seconds - SPEED_SAMPLE_SECONDS).x) /
    SPEED_SAMPLE_SECONDS;
  if (Math.abs(speed) > SPEED_LIMIT_RATIO * scene.projection) speed = 0;
  const limit = LEAN_LIMIT_RATIO * scene.projection;

  for (const stem of stems) {
    settle(
      stem,
      mascotForce(stem, here.x, speed, scene.world) +
        windForce(stem, seconds, scene.world),
      delta,
      limit,
    );
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
    (z) => z <= VEIL_DEPTH && z >= MASCOT_DEPTH,
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
  const here = routeAt(state, seconds);
  const frame = hopFrame(here.cycle, here.sit, seconds);
  const { mascotRoot, mascotScale } = state.scene;

  drawMascotShadow(ctx, palette, state.scene, here.x, frame.air);
  drawCat(
    ctx,
    here.x,
    mascotRoot - FOOT_Y * mascotScale - frame.air * here.hop * mascotScale,
    mascotScale,
    frame,
    palette,
  );

  paintWhere(
    ctx,
    palette,
    state,
    seconds,
    (z) => z < MASCOT_DEPTH && z >= FRONT_DEPTH,
  );
};

export const createHeroField = (palette: HeroPalette): HeroField => {
  const state: FieldState = {
    /* A draw before the first layout must not divide by zero. */
    scene: sceneFor(REFERENCE_WIDTH, REFERENCE_HEIGHT),
    stems: [],
    route: { segments: [], total: 1 },
    cachedAt: Number.NaN,
    cached: STILL,
  };

  return {
    layout(width: number, height: number): void {
      state.scene = sceneFor(width, height);
      state.stems = buildStems(state.scene);
      state.route = buildRoute(state.scene);
      state.cachedAt = Number.NaN;
    },
    step: (seconds, delta) => stepSprings(state, seconds, delta),
    back: (ctx, seconds) => drawBack(ctx, palette, state, seconds),
    mid: (ctx, seconds) => drawMid(ctx, palette, state, seconds),
    nearBlur: () => NEAR_BLUR * state.scene.world,
    near: (ctx, seconds) =>
      paintWhere(ctx, palette, state, seconds, (z) => z < FRONT_DEPTH),
  };
};
