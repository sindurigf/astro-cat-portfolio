/*
 * Poses and moves for the About cats. A move is a timeline of poses plus
 * modifiers; x runs forward in the direction the cat faces when it starts, and
 * `face: -1` means turned round. about-cats.ts places moves on a track.
 */
import type {
  CatId,
  Pair,
  Pose,
  PropKind,
  PropState,
} from './about-cats-types';
import { WALK_SPEED } from './about-cats-frames';

export type { Pose };

const BASE: Pose = {
  x: 0,
  y: 0,
  face: 1,
  ba: 0,
  by: 26,
  bt: 20,
  sq: 1,
  haunch: 0,
  fN: [12, 26],
  fF: [8, 26],
  hN: [-12, 26],
  hF: [-8, 26],
  hr: 0,
  eyes: 1,
  rot: 0,
  zz: 0,
};

export const clonePose = (p: Pose): Pose => ({
  ...p,
  fN: [...p.fN],
  fF: [...p.fF],
  hN: [...p.hN],
  hF: [...p.hF],
});

const derive = (from: Pose, over: Partial<Pose>): Pose => ({
  ...clonePose(from),
  ...over,
});

const SIT = derive(BASE, {
  ba: 62,
  by: 25,
  haunch: 13,
  fN: [9, 25],
  fF: [6, 25],
  hN: [-1, 25],
  hF: [1, 25],
});
const LOAF = derive(BASE, {
  by: 11,
  bt: 21,
  haunch: 5,
  fN: [12, 11],
  fF: [9, 11],
  hN: [-9, 11],
  hF: [-6, 11],
});

const POSES = {
  /* Sat back low on the haunches, leaning in, to reach for something overhead: a cat rears with its hind feet flat, not standing tall. */
  low: derive(BASE, {
    ba: 56,
    by: 23,
    haunch: 13,
    fN: [13, -8],
    fF: [10, -4],
    hN: [5, 23],
    hF: [8, 23],
    hr: -15,
  }),
  stand: BASE,
  sit: SIT,
  loaf: LOAF,
  /* Curled up: back rounded, chin down on the paws, tail wrapped to the chest. */
  sleep: derive(LOAF, {
    ba: -4,
    bt: 24,
    sq: 0.86,
    hr: 30,
    eyes: 0,
    zz: 1,
  }),
  rear: derive(BASE, {
    ba: 72,
    by: 27,
    haunch: 10,
    fN: [11, -4],
    fF: [8, 0],
    hN: [0, 27],
    hF: [2, 27],
    hr: -15,
  }),
  stretch: derive(BASE, {
    ba: -20,
    by: 21,
    fN: [27, 21],
    fF: [23, 21],
    hN: [-11, 21],
    hF: [-8, 21],
    hr: -8,
    eyes: 0,
  }),
  belly: derive(BASE, {
    rot: 180,
    by: 12,
    /* Paws well clear of the belly, so they read as up in the air. */
    fN: [12, 24],
    fF: [6, 26],
    hN: [-12, 24],
    hF: [-6, 26],
    hr: 180,
  }),
  crouch: derive(BASE, {
    ba: -5,
    by: 16,
    bt: 19,
    fN: [16, 16],
    fF: [13, 16],
    hN: [-9, 16],
    hF: [-6, 16],
  }),
  air: derive(BASE, {
    ba: 10,
    by: 30,
    sq: 1.08,
    fN: [22, 6],
    fF: [19, 9],
    hN: [-22, 10],
    hF: [-19, 12],
  }),
  /* Straight up after a fly: body upright, front paws high. */
  leap: derive(BASE, {
    ba: 62,
    by: 24,
    haunch: 6,
    fN: [24, -20],
    fF: [21, -15],
    hN: [0, 24],
    hF: [2, 26],
    hr: -24,
  }),
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

export const pose = (name: PoseName, over: Partial<Pose> = {}): Pose =>
  derive(POSES[name], over);

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

const PAWS = ['fN', 'fF', 'hN', 'hF'] as const;

/** A paw moving along the ground between two poses lifts this much per px it travels, so it steps rather than slides. */
const SHIFT_LIFT = 0.5;
const SHIFT_LIFT_MAX = 4;
const onGround = (p: Pose, paw: Pair): boolean =>
  p.rot === 0 && Math.abs(paw[1] - p.by) < 0.5;
const pairDown = (a: Pose, b: Pose, front: boolean): boolean =>
  PAWS.slice(front ? 0 : 2, front ? 2 : 4).every(
    (k) => onGround(a, a[k]) && onGround(b, b[k]),
  );

export const mixPose = (a: Pose, b: Pose, k: number): Pose => {
  const out = clonePose(b);
  const frontDown = pairDown(a, b, true);
  const hindDown = pairDown(a, b, false);
  for (const key of Object.keys(b) as (keyof Pose)[]) {
    const va = a[key];
    const vb = b[key];
    if (Array.isArray(va) && Array.isArray(vb)) {
      (out[key] as Pair) = [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k)];
      const otherDown = key[0] === 'f' ? hindDown : frontDown;
      if (onGround(a, va) && onGround(b, vb) && otherDown) {
        /* Front paws step in the first half, hind paws in the second: two stay down. */
        const half = Math.min(
          1,
          Math.max(0, key[0] === 'f' ? 2 * k : 2 * k - 1),
        );
        (out[key] as Pair)[0] = lerp(va[0], vb[0], half);
        (out[key] as Pair)[1] -=
          Math.sin(Math.PI * half) *
          Math.min(SHIFT_LIFT_MAX, SHIFT_LIFT * Math.abs(vb[0] - va[0]));
      }
    } else if (typeof va === 'number' && typeof vb === 'number') {
      (out[key] as number) = lerp(va, vb, k);
    }
  }
  return out;
};

const EASE = {
  linear: (k: number) => k,
  inOut: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  out: (k: number) => 1 - (1 - k) ** 3,
  in: (k: number) => k ** 3,
  back: (k: number) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2,
  /* All at once halfway: a flat sticker cannot turn, so it flips mid-hop. */
  snap: (k: number) => (k < 0.5 ? 0 : 1),
} as const;

export type Ease = keyof typeof EASE;

export interface Step {
  ms: number;
  pose: Pose;
  ease: Ease;
}

interface Mod {
  from: number;
  to: number;
  apply: (p: Pose, elapsed: number, progress: number) => void;
}

export interface Move {
  steps: Step[];
  mods: Mod[];
  prop?: PropKind;
  /** Prop position relative to the cat's starting point, forward positive. */
  propAt?: ((t: number) => PropState) | undefined;
  /** px the cat ends higher than it starts, a climb; it plays on the lower floor. */
  rise?: number;
}

const step = (
  ms: number,
  name: PoseName,
  over: Partial<Pose> = {},
  ease: Ease = 'inOut',
): Step => ({ ms, pose: pose(name, over), ease });

const between = (from: number, to: number, apply: Mod['apply']): Mod => ({
  from,
  to,
  apply,
});

/** Travel in px per full stride; a paw on the ground moves back exactly as fast as the body goes forward. */
const STRIDE = 26;
const STEP_LIFT = 4;
/** The share of a stride a paw is down for. */
const STANCE = 0.5;
/** ms over which a walk's steps start and stop, so the paws never jump to place. */
const GAIT_BLEND_MS = 180;

type Paw = (typeof PAWS)[number];
/** Each paw's place in a stride, as a share of it: a walk moves them one at a time, a bound in pairs. */
const WALK_LEGS: readonly (readonly [Paw, number])[] = [
  ['fN', 0],
  ['hF', 0.25],
  ['fF', 0.5],
  ['hN', 0.75],
];
/*
 * A gait fades in and out. A paw is down for the `stance` share of a stride of `length` px, going back as fast
 * as the body goes forward, then swings ahead; `rest` moves the body by the gait's weight and place in the stride.
 */
const gait = (
  from: number,
  to: number,
  legs: typeof WALK_LEGS,
  stance: number,
  length: number,
  lift: number,
  rest?: (p: Pose, weight: number, cycle: number) => void,
): Mod =>
  between(from, to, (p, s) => {
    const weight = Math.min(
      1,
      s / GAIT_BLEND_MS,
      (to - from - s) / GAIT_BLEND_MS,
    );
    const cycle = (p.x * Math.sign(p.face)) / length;
    for (const [leg, offset] of legs) {
      const u = (((cycle + offset) % 1) + 1) % 1;
      const k = Math.max(0, (u - stance) / (1 - stance));
      p[leg][0] +=
        ((weight * length * stance) / 2) *
        (u < stance ? 1 - (2 * u) / stance : 2 * k * k * (3 - 2 * k) - 1);
      p[leg][1] -= weight * lift * Math.sin(Math.PI * k);
    }
    rest?.(p, weight, cycle);
  });

const walking = (from: number, to: number, strength = 1): Mod =>
  gait(from, to, WALK_LEGS, STANCE, STRIDE * strength, STEP_LIFT * strength);
/** A chasing cat bounds: front paws land together, then hind paws, the back flexing between. px per stride, px of lift and hop, degrees of rock. */
const BOUND_STRIDE = 44;
const BOUND_LIFT = 6;
const BOUND_HOP = 3;
const BOUND_ROCK = 7;
/** Each pair is down for a quarter of the stride and lands this many px out from its standing place, so the four legs never gather to a point. */
const BOUND_STANCE = 0.25;
const BOUND_SPREAD = 5;
const BOUND_LEGS: typeof WALK_LEGS = [
  ['fN', 0],
  ['fF', 0.08],
  ['hN', 0.5],
  ['hF', 0.58],
];
const bounding = (from: number, to: number): Mod =>
  gait(
    from,
    to,
    BOUND_LEGS,
    BOUND_STANCE,
    BOUND_STRIDE,
    BOUND_LIFT,
    (p, weight, cycle) => {
      for (const k of PAWS)
        p[k][0] += weight * (k[0] === 'f' ? BOUND_SPREAD : -BOUND_SPREAD);
      const phase = 2 * Math.PI * cycle;
      p.y += weight * BOUND_HOP * Math.abs(Math.sin(phase));
      p.ba += weight * BOUND_ROCK * Math.sin(phase);
    },
  );
/** Hind paws tread in turn, lifting, while the rump sways over them. */
const TREAD_LIFT = 3;
/** px the rump sways side to side before a pounce. */
const WIGGLE_SWAY = 1.2;
const wiggle = (from: number, to: number): Mod =>
  between(from, to, (p, s) => {
    const w = Math.sin(s / 45);
    p.x += WIGGLE_SWAY * w;
    for (const k of PAWS) p[k][0] -= WIGGLE_SWAY * w;
    p.hN[1] -= TREAD_LIFT * Math.max(0, w);
    p.hF[1] -= TREAD_LIFT * Math.max(0, -w);
    p.by -= 1;
  });
/** Degrees the head lags a jump by, up as it takes off and down as it lands. */
const HEAD_LAG = 14;
/** A jump's rise and fall; it ends with its landing step, so the paws touch down as the arc does. */
const arc = (from: number, to: number, height: number): Mod =>
  between(from, to, (p, _s, k) => {
    p.y += Math.sin(Math.PI * k) * height;
    p.hr -= HEAD_LAG * Math.cos(Math.PI * k);
  });
/** Degrees a leaping body pitches per px of arc height: nose up as it takes off, level at the top, nose down to land. */
const LEAP_PITCH_PER_PX = 0.35;
/** The share of the leap, at its end, over which the body comes level: nose down at touchdown, the elbows would dip under the ground. */
const LEAP_LEVELS_OUT = 0.15;
/** px the front paws reach down and forward for the landing, and the hind paws push back at take-off. */
const LANDING_REACH = 12;
const PUSH_OFF = 8;
/** A pounce's arc: the body pitches with it, the hind legs push off and the front paws reach to land first. */
const leap = (from: number, to: number, height: number): Mod => {
  const rise = arc(from, to, height);
  return between(from, to, (p, s, k) => {
    rise.apply(p, s, k);
    p.ba +=
      LEAP_PITCH_PER_PX *
      height *
      Math.cos(Math.PI * k) *
      Math.min(1, (1 - k) / LEAP_LEVELS_OUT);
    const land = LANDING_REACH * Math.max(0, 2 * k - 1);
    const push = PUSH_OFF * Math.max(0, 1 - 3 * k);
    for (const paw of PAWS) {
      const front = paw[0] === 'f';
      p[paw][0] += front ? land / 2 : -push;
      p[paw][1] = Math.min(p[paw][1] + (front ? land : push), p.by + p.y);
    }
  });
};
/* Slow breaths, ending on an exhale so the pose rests where it started; two leave room for a slow device's frames within 5 s. */
const BREATH_MS = 1000;
const BREATHS = 2;
/** Body thickness in px the chest gains at the top of a breath. */
const BREATH_DEPTH = 1.4;
const breathing = (from: number, breaths: number): Mod =>
  between(from, from + BREATH_MS * breaths, (p, s) => {
    p.bt += BREATH_DEPTH * Math.sin((2 * Math.PI * s) / BREATH_MS);
  });
/** The "z" rises once per breath, then rests above the head, not back at the start. */
const dozing = (from: number, breaths: number): Mod =>
  between(from, from + BREATH_MS * breaths, (p, s) => {
    p.zz = s >= BREATH_MS * breaths ? 1 : (s % BREATH_MS) / BREATH_MS;
  });

type RoutePoint = readonly [t: number, x: number, y: number];
type Route = readonly [RoutePoint, ...RoutePoint[]];

/* Arcs in px; with them the tallest move stays under --spacing-cat-band (tests/about-cats.spec.ts). */
const POUNCE_HEIGHT = 56;
/** A stalk's steps are full strides taken slowly, so each paw is seen to lift and set down. */
const STALK_STRIDE = 1;
const STALK_STEPS = 5;
const STALK_STEP_PX = 30;
const STALK_CROUCH_MS = 400;
const STALK_STEP_MS = 700;
/** Between steps the cat freezes with the near front paw held up, as a stalking cat does. */
const STALK_PAW_UP: Pair = [20, 9];
const STALK_PAW_MS = 170;
const STALK_FREEZE_MS = 620;
const STALK_REACH = 50;
const POUNCE_REACH = 76;
/** The pounce crouches, then wiggles until it springs. */
const POUNCE_CROUCH_MS = 400;
const POUNCE_WAIT_MS = 1300;
/* A pounce's phases in ms: gather, air, land, rock back, hold the catch, sit up. */
const GATHER_MS = 140;
const AIR_MS = 400;
const LAND_MS = 150;
const ROCK_MS = 280;
const HOLD_MS = 500;
const SIT_UP_MS = 700;
/** px the gather steps back, and the landing slides on past the air step. */
const GATHER_BACK = 2;
const LANDING_SLIDE = 8;
/** The pounce from a crouch at `x`, starting at `start` ms: its leap spans the air and the landing, so the paws touch down as the arc ends. */
const pounceFrom = (
  start: number,
  x: number,
  reach: number,
): { steps: Step[]; mods: Mod[] } => {
  const landed = x + reach + LANDING_SLIDE;
  const leapFrom = start + GATHER_MS;
  return {
    steps: [
      step(GATHER_MS, 'crouch', { x: x - GATHER_BACK, sq: 0.9 }, 'in'),
      step(AIR_MS, 'air', { x: x + reach }, 'linear'),
      step(LAND_MS, 'crouch', { x: landed, sq: 0.84, ba: -10 }, 'out'),
      step(ROCK_MS, 'crouch', { x: landed, hr: 8 }, 'back'),
      step(HOLD_MS, 'crouch', { x: landed, hr: 8 }),
      step(SIT_UP_MS, 'sit', { x: landed }),
    ],
    mods: [leap(leapFrom, leapFrom + AIR_MS + LAND_MS, POUNCE_HEIGHT)],
  };
};
const LEAP_HEIGHT = 40;
/** The scratching post stands this far ahead of the cat, clear of its chest. */
const POST_GAP = 34;
const YARN_BOUND_HEIGHT = 38;
const FLY_HOP_HEIGHT = 40;
/* The fly's route, [ms, x, y] ahead of the cat: it lands, is missed, circles, and escapes. */
const FLY_PATH: Route = [
  [0, 60, -82],
  [600, 95, -88],
  [1200, 70, -78],
  [1800, 125, -50],
  [2500, 150, -4],
  [4600, 150, -4],
  [4950, 168, -50],
  [5400, 150, -88],
  [6600, 142, -90],
  [7000, 185, -80],
  [7600, 220, -72],
  [8100, 238, -90],
  [8700, 262, -92],
  [9300, 330, -94],
];
const FLY_LANDS = 2500;
const FLY_ARRIVES_MS = 300;
const FLY_TAKES_OFF = 4600;
const FLY_ESCAPES = 8600;
/** Reared up where the second pounce lands, both paws swipe at the fly overhead. */
const FLY_SWIPE = step(
  160,
  'low',
  { x: 108, fN: [28, -28], fF: [25, -23] },
  'out',
);
/** A swat starts with the paw raised high, curled at the wrist, and comes down onto its target. */
const WINDUP_MS = 180;
/** Raised ahead of the face, the head drawn back: a gap keeps the paw a shape of its own on a black coat. */
const SWAT_RAISED: Pair = [36, -17];
const REAR_RAISED: Pair = [33, -24];
const SWAT_MS = 160;
/** A sitting swat `leadMs` after the last, the head tipped back `hr` degrees and the paw landing at height `y`. */
const sitSwat = (leadMs: number, hr: number, y: number): Step[] => [
  step(leadMs - WINDUP_MS, 'sit', { hr: -15 }),
  step(WINDUP_MS, 'sit', { hr, fN: SWAT_RAISED }, 'out'),
  step(SWAT_MS, 'sit', { hr, fN: [34, y] }, 'in'),
];
/** Reared up, both paws swipe down. */
const rearSwat = (leadMs: number): Step[] => [
  step(leadMs - WINDUP_MS, 'low'),
  step(WINDUP_MS, 'low', { fN: REAR_RAISED, fF: [18, -14] }, 'out'),
  step(SWAT_MS, 'low', { fN: [34, -7], fF: [30, -4] }, 'in'),
];
/** ms at which each swat hits the feather toy. */
const TOY_HITS = [860, 1520, 2680, 3100, 3760];
/** A hit feather's swing in degrees `since` ms after it: `size` at first, dying away over `fade` ms, `beat` ms per radian. */
const swung = (
  since: number,
  size: number,
  fade: number,
  beat: number,
): number =>
  since > 0 ? size * Math.exp(-since / fade) * Math.sin(since / beat) : 0;
/*
 * A bat at something on the ground: the cat leans in with its head down, lifts
 * the paw curled, hooks it down onto the target and snaps it back.
 */
const BAT_LEAN: Partial<Pose> = { ba: 46, hr: 24 };
const BAT_RAISED: Pair = [22, 8];
const BAT_STRIKE_MS = 90;
/** The paw stays on what it hit and pushes it on this far, so the hit is seen. */
const BAT_PUSH_MS = 90;
const BAT_PUSH = 4;
/** ms from the hit until the paw is back up. */
const BAT_AFTER_MS = BAT_PUSH_MS + 130;
/** ms from a bat's start to the paw's hit. */
const BAT_HIT_MS = WINDUP_MS + BAT_STRIKE_MS;
const bat = (hit: Pair, over: Partial<Pose> = {}): Step[] => {
  const lean = (ms: number, fN: Pair, ease: Ease): Step =>
    step(ms, 'sit', { ...over, ...BAT_LEAN, fN }, ease);
  return [
    lean(WINDUP_MS, BAT_RAISED, 'out'),
    lean(BAT_STRIKE_MS, hit, 'in'),
    lean(BAT_PUSH_MS, [hit[0] + BAT_PUSH, hit[1]], 'linear'),
    lean(BAT_AFTER_MS - BAT_PUSH_MS, BAT_RAISED, 'out'),
  ];
};
/** The feather hangs this far ahead, clear of the chest, where a long swat reaches it. */
const TOY_AHEAD = 36;
/** The feather swings back towards the cat by this share of its swing away, so each swat finds it. */
const TOY_BACKSWING = 0.25;
/** The cup stands clear of the head and chest; the first tap pushes it on. */
const CUP_AHEAD = 36;
/** ms at which the paw nudges the cup, then knocks it over. */
const CUP_NUDGED = 750;
const CUP_KNOCKED = 2250;
/** Where each yarn pounce lands: the front paws reach the ball's near side. */
const YARN_LAND_1 = 218;
const YARN_LAND_2 = 308;
/** ms the cat stands up on the spot before chasing on, so it rises through every frame before its paws move. */
const YARN_STAND_MS = 500;
/** ms at which each bat's paw hits the ball: the first bat, and the one after the first pounce lands. */
const YARN_BAT_1 = BAT_HIT_MS;
const YARN_POUNCE_LANDED = 4320;
const YARN_BAT_2 = YARN_POUNCE_LANDED + BAT_HIT_MS;
/** The ball hugged on the back, between the hind paws, from the cat's place. */
const YARN_HUG = 9;
const YARN_HUG_Y = -34;
/** The wand's feather hangs on the cat tree just out of a sitting cat's reach, clear of its face. */
const WAND_HIGH = -62;
const WAND_AHEAD = 32;
const WAND_LEAP_HEIGHT = 22;
/** Sat back on its haunches, a paw reaches up from the chest to the feather and pushes it on. */
const WAND_REACH: Partial<Pose> = {
  hr: -26,
  fN: [22, -6],
  fF: [17, 2],
};
const WAND_HIT: Pair = [32, -28];
const wandSwat = (paw: 'fN' | 'fF', backMs: number): Step[] => [
  step(WINDUP_MS, 'low', { ...WAND_REACH, [paw]: WAND_HIT }, 'out'),
  step(
    BAT_PUSH_MS,
    'low',
    { ...WAND_REACH, [paw]: [WAND_HIT[0] + BAT_PUSH, WAND_HIT[1]] },
    'linear',
  ),
  step(backMs - BAT_PUSH_MS, 'low', WAND_REACH),
];
/** Caught at the top of the leap, the feather comes down ahead of the face and is pinned under a paw. */
const WAND_PULL: Route = [
  [2880, WAND_AHEAD, WAND_HIGH],
  [3100, 52, WAND_HIGH + 30],
  [3380, 40, -5],
];

/** A point along a timed route, straight between its points. */
const along = ([first, ...rest]: Route, t: number): [number, number] => {
  let [t0, x0, y0] = first;
  for (const [t1, x1, y1] of rest) {
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
    [t0, x0, y0] = [t1, x1, y1];
  }
  return [x0, y0];
};

/*
 * Rolling onto the back: low, then over all at once with a small flop. Easing
 * the 180° roll would stand the cat on its head halfway.
 */
const FLOP_HOP = 4;
/** Body height before the roll; upright poses keep their paws on the ground there. */
const FLOP_LOW = 9;
const groundedAt = (name: PoseName, by: number): Partial<Pose> =>
  POSES[name].rot !== 0
    ? {}
    : Object.fromEntries(PAWS.map((k) => [k, [POSES[name][k][0], by]]));
const flopTo = (from: PoseName, to: PoseName, x = 0): Step[] => [
  step(
    200,
    from,
    { x, by: FLOP_LOW, sq: 0.92, ...groundedAt(from, FLOP_LOW) },
    'in',
  ),
  step(200, to, { x, sq: 0.92 }, 'snap'),
  step(300, to, { x }, 'out'),
];

/** A prop's opacity `t` ms in: it fades in over `inMs`, and out over the `outMs` before `end`. */
const fade = (t: number, inMs: number, end: number, outMs: number): number =>
  Math.min(1, t / inMs, Math.max(0, (end - t) / outMs));

export const MOVES = {
  look: (): Move => ({
    steps: [
      step(900, 'sit', { hr: -22 }),
      step(1100, 'sit', { hr: 18 }),
      step(800, 'sit'),
    ],
    mods: [],
  }),
  /* Step, freeze with a front paw held up, step again; then the pounce. */
  stalk: (): Move => {
    const steps = [step(STALK_CROUCH_MS, 'crouch')];
    const mods: Mod[] = [];
    let t = STALK_CROUCH_MS;
    for (let i = 1; i <= STALK_STEPS; i += 1) {
      const x = STALK_STEP_PX * i;
      steps.push(
        step(STALK_STEP_MS, 'crouch', { x }, 'linear'),
        step(STALK_PAW_MS, 'crouch', { x, fN: STALK_PAW_UP }, 'out'),
        step(STALK_FREEZE_MS, 'crouch', { x, fN: STALK_PAW_UP }),
        step(STALK_PAW_MS, 'crouch', { x }, 'in'),
      );
      mods.push(walking(t, t + STALK_STEP_MS, STALK_STRIDE));
      t += STALK_STEP_MS + 2 * STALK_PAW_MS + STALK_FREEZE_MS;
    }
    const jump = pounceFrom(t, STALK_STEP_PX * STALK_STEPS, STALK_REACH);
    return { steps: [...steps, ...jump.steps], mods: [...mods, ...jump.mods] };
  },
  /* Wiggle, leap, land front paws first, hold the catch pinned, then sit up. */
  pounce: (): Move => {
    const jump = pounceFrom(POUNCE_WAIT_MS, 0, POUNCE_REACH);
    return {
      steps: [
        step(POUNCE_CROUCH_MS, 'crouch', { hr: 6 }),
        step(POUNCE_WAIT_MS - POUNCE_CROUCH_MS, 'crouch', { hr: 6 }),
        ...jump.steps,
      ],
      mods: [wiggle(POUNCE_CROUCH_MS, POUNCE_WAIT_MS), ...jump.mods],
    };
  },
  stretch: (): Move => ({
    steps: [
      step(500, 'stand'),
      step(700, 'stretch'),
      step(900, 'stretch'),
      step(500, 'stand'),
      step(500, 'sit', { hr: -25, eyes: 0 }),
      step(700, 'sit', { hr: -25, eyes: 0 }),
      step(400, 'sit'),
    ],
    mods: [],
  }),
  /* Bats at the feather toy on its string: swats, sat back for a double swipe, and a last swat. */
  toy: (): Move => {
    const steps = [
      ...sitSwat(700, -18, -3),
      ...sitSwat(500, -20, -5),
      step(600, 'sit', { hr: -12 }),
      ...rearSwat(400),
      ...rearSwat(260),
      ...sitSwat(500, -18, -3),
      step(500, 'sit'),
      step(600, 'sit'),
    ];
    const end = stepsDuration(steps);
    return {
      steps,
      mods: [],
      prop: 'toy',
      propAt: (t) => {
        const swing = TOY_HITS.reduce(
          (sum, at) => sum + swung(t - at, 30, 600, 120),
          0,
        );
        return {
          kind: 'toy',
          x: TOY_AHEAD,
          y: -30 + 4 * Math.sin(t / 700),
          r: swing < 0 ? swing * TOY_BACKSWING : swing,
          o: fade(t, 300, end, 400),
        };
      },
    };
  },
  knock: (): Move => ({
    steps: [
      step(CUP_NUDGED - BAT_HIT_MS, 'sit', { hr: 12 }),
      ...bat([30, 14]),
      step(1200 - CUP_NUDGED - BAT_AFTER_MS, 'sit'),
      step(CUP_KNOCKED - BAT_HIT_MS - 1200, 'sit', { hr: -8 }),
      ...bat([30 + BAT_PUSH, 13]),
      step(3250 - CUP_KNOCKED - BAT_AFTER_MS, 'sit', { hr: 25 }),
      step(400, 'sit'),
    ],
    mods: [],
    prop: 'cup',
    propAt: (t) => {
      let x =
        CUP_AHEAD +
        BAT_PUSH * Math.min(1, Math.max(0, (t - CUP_NUDGED) / BAT_PUSH_MS));
      let y = 0;
      let r = 0;
      if (t > CUP_KNOCKED) {
        const k = Math.min(1, (t - CUP_KNOCKED) / 700);
        x += 22 * Math.min(1, k * 3);
        y = k > 0.33 ? ((k - 0.33) * 3) ** 2 * 40 : 0;
        r = k * 140;
      }
      return { kind: 'cup', x, y, r, o: Math.min(1, t / 300, y > 30 ? 0 : 1) };
    },
  }),
  belly: (): Move => ({
    steps: [
      step(500, 'loaf'),
      ...flopTo('loaf', 'belly'),
      step(1600, 'belly'),
      ...flopTo('belly', 'loaf'),
      step(400, 'loaf'),
      step(500, 'sit'),
    ],
    mods: [arc(700, 900, FLOP_HOP), arc(3000, 3200, FLOP_HOP)],
  }),
  /*
   * The fly lands; the cat stalks it and pounces, misses, swats at it overhead,
   * follows it along the band in hops, leaps for it, and it gets away.
   */
  fly: (): Move => ({
    steps: [
      step(1200, 'sit'),
      step(300, 'crouch'),
      step(120, 'crouch', { sq: 0.88 }, 'in'),
      step(350, 'air', { x: 50 }, 'linear'),
      step(150, 'crouch', { x: 60, sq: 0.86 }, 'out'),
      step(700, 'crouch', { x: 60, hr: 6 }),
      step(1000, 'crouch', { x: 72 }, 'linear'),
      step(600, 'crouch', { x: 72 }),
      step(140, 'crouch', { x: 72, sq: 0.9 }, 'in'),
      step(350, 'air', { x: 100 }, 'linear'),
      step(150, 'crouch', { x: 108, sq: 0.84 }, 'out'),
      step(600, 'sit', { x: 108, hr: -22 }),
      step(400, 'low', { x: 108 }),
      FLY_SWIPE,
      step(260, 'low', { x: 108 }),
      FLY_SWIPE,
      step(300, 'crouch', { x: 108 }),
      step(120, 'crouch', { x: 108, sq: 0.88 }, 'in'),
      step(350, 'air', { x: 150 }, 'linear'),
      step(150, 'crouch', { x: 160, sq: 0.86 }, 'out'),
      step(350, 'crouch', { x: 160, hr: -18 }),
      step(160, 'crouch', { x: 160, sq: 0.86 }, 'in'),
      step(260, 'leap', { x: 190 }, 'out'),
      step(260, 'leap', { x: 200 }, 'in'),
      step(150, 'crouch', { x: 210, sq: 0.84 }, 'out'),
      step(500, 'sit', { x: 210, hr: -20 }),
      step(600, 'sit', { x: 210 }),
    ],
    mods: [
      between(0, 1200, (p, s) => {
        p.hr = -18 + 14 * Math.sin(s / 260);
      }),
      wiggle(1200, 1500),
      arc(1620, 2120, FLY_HOP_HEIGHT),
      walking(2820, 3820, 0.6),
      wiggle(3820, 4420),
      arc(4560, 5060, POUNCE_HEIGHT),
      wiggle(6640, 6940),
      arc(7060, 7560, FLY_HOP_HEIGHT),
      wiggle(7560, 7910),
      arc(8070, 8740, LEAP_HEIGHT),
    ],
    prop: 'fly',
    propAt: (t) => {
      const [x, y] = along(FLY_PATH, t);
      const buzz = t < FLY_LANDS || t > FLY_TAKES_OFF ? 1 : 0;
      const away = Math.min(1, Math.max(0, (t - FLY_ESCAPES) / 700));
      return {
        kind: 'fly',
        x: x + buzz * 10 * Math.sin(t / 260),
        y: y + buzz * 8 * Math.sin(t / 170),
        r: 0,
        o: Math.min(t / FLY_ARRIVES_MS, 1 - away),
      };
    },
  }),
  post: (): Move => ({
    /* A long scratch up a tall post, paws high, then a look at the work. */
    steps: [
      step(600, 'rear', { fN: [21, -24], fF: [19, -14], hr: 0 }),
      step(3000, 'rear', { fN: [21, -24], fF: [19, -14], hr: 0 }),
      step(600, 'sit', { hr: -14 }),
      step(500, 'sit'),
    ],
    mods: [
      between(600, 3600, (p, s) => {
        p.fN[1] += 6 * Math.sin(s / 90);
        p.fF[1] -= 6 * Math.sin(s / 90);
      }),
    ],
    prop: 'post',
    propAt: (t) => ({
      kind: 'post',
      x: POST_GAP,
      y: 0,
      r: 0,
      o: fade(t, 300, 4700, 300),
    }),
  }),
  /* Bats the ball, bounds after it, pounces with its paws on it, bats it on, then rolls over hugging it. */
  yarn: (): Move => ({
    steps: [
      ...bat([30, 14]),
      step(300 - BAT_PUSH_MS, 'sit'),
      step(300, 'stand'),
      step(2400, 'stand', { x: 150 }),
      step(300, 'crouch', { x: 150 }),
      step(140, 'crouch', { x: 150, sq: 0.88 }, 'in'),
      step(300, 'air', { x: 198 }, 'linear'),
      step(180, 'crouch', { x: YARN_LAND_1, sq: 0.84 }, 'out'),
      ...bat([30, 14], { x: YARN_LAND_1 }),
      step(150 - BAT_PUSH_MS, 'sit', { x: YARN_LAND_1 }),
      step(YARN_STAND_MS, 'stand', { x: YARN_LAND_1 }),
      step(1500 - YARN_STAND_MS, 'stand', { x: 280 }),
      step(250, 'crouch', { x: 280 }),
      step(140, 'crouch', { x: 280, sq: 0.88 }, 'in'),
      step(280, 'air', { x: 298 }, 'linear'),
      step(180, 'crouch', { x: YARN_LAND_2, sq: 0.84 }, 'out'),
      ...flopTo('crouch', 'belly', YARN_LAND_2),
      step(1500, 'belly', { x: YARN_LAND_2 }),
      ...flopTo('belly', 'loaf', YARN_LAND_2),
      step(500, 'sit', { x: YARN_LAND_2 }),
    ],
    mods: [
      bounding(1000, 3400),
      wiggle(3400, 3700),
      arc(3840, 4320, YARN_BOUND_HEIGHT),
      bounding(4870 + YARN_STAND_MS, 6370),
      wiggle(6370, 6620),
      arc(6760, 7220, YARN_BOUND_HEIGHT),
    ],
    prop: 'yarn',
    /* Rolls ahead; a pounce lands paws first and squirts it on; batted again; then hugged in the hind paws. */
    propAt: (t) => {
      const ease = (k: number) => 1 - (1 - k) ** 2;
      const span = (a: number, b: number) =>
        Math.min(1, Math.max(0, (t - a) / (b - a)));
      const roll =
        28 +
        ease(span(YARN_BAT_1, 3850)) * 212 +
        ease(span(4200, 4450)) * 6 +
        ease(span(YARN_BAT_2, 6900)) * 84 +
        ease(span(7100, 7350)) * 10 +
        ease(span(9420, 9820)) * 12;
      /* Up over the rolled body first, then back to the hind paws; the reverse on letting go. */
      const lift = span(7520, 7620) - span(9470, 9620);
      const draw = span(7620, 7720) - span(9420, 9470);
      const kick = t > 7920 && t < 9420 ? Math.sin((t - 7920) / 60) : 0;
      return {
        kind: 'yarn',
        x: roll + draw * (YARN_LAND_2 + YARN_HUG - roll) + 3 * kick,
        y: -6 + lift * (YARN_HUG_Y + 6) + 2 * kick,
        r:
          span(YARN_BAT_1, 3850) * 900 +
          span(4200, 4450) * 80 +
          span(YARN_BAT_2, 6900) * 500,
        o: fade(t, 200, 10620, 300),
      };
    },
  }),
  /* Rudra and the wand on the cat tree, from his photo: sat back reaching up, swats, and one leap that brings it down. */
  wand: (): Move => ({
    steps: [
      step(700, 'sit', { hr: -26 }),
      step(500, 'low', WAND_REACH),
      ...wandSwat('fN', 260),
      ...wandSwat('fF', 300),
      step(300, 'crouch', { hr: -20 }),
      step(160, 'crouch', { sq: 0.86, hr: -24 }, 'in'),
      step(300, 'leap', { fN: [33, -20], fF: [28, -13] }, 'out'),
      step(300, 'leap', { fN: [24, -8], fF: [20, -4] }, 'in'),
      step(200, 'crouch', { sq: 0.84 }, 'out'),
      step(900, 'crouch', { fN: [32, 16], hr: 6 }),
      step(600, 'sit'),
    ],
    mods: [arc(2580, 3380, WAND_LEAP_HEIGHT)],
    prop: 'toy',
    propAt: (t) => {
      const pulled = t > WAND_PULL[0][0];
      const [px, py] = along(WAND_PULL, t);
      return {
        kind: 'toy',
        x: pulled ? px : WAND_AHEAD,
        y: pulled ? py : WAND_HIGH + 3 * Math.sin(t / 600),
        r: Math.max(
          -8,
          swung(t - 1380, 24, 500, 110) + swung(t - 1820, 24, 500, 110),
        ),
        o: fade(t, 300, 5280, 400),
      };
    },
  }),
  /* A cat that turns first takes a breath fewer, so turning and lying down stay well within 5 s. */
  sleep: (turning = false): Move => {
    const breaths = turning ? BREATHS - 1 : BREATHS;
    return {
      steps: [
        step(600, 'loaf'),
        step(800, 'sleep'),
        step(BREATH_MS * breaths, 'sleep'),
      ],
      mods: [breathing(1400, breaths), dozing(1400, breaths)],
    };
  },
  wake: (): Move => ({
    steps: [step(500, 'loaf', { hr: -12 }), step(500, 'sit')],
    mods: [],
  }),
} satisfies Record<string, () => Move>;

export type MoveName = keyof typeof MOVES;

/** Small play moves run this much slower than drawn, so each one can be watched. */
const SLOW_PLAY = 1.5;
const SLOW_MOVES: ReadonlySet<MoveName> = new Set(['toy', 'knock']);

/** A move at `factor` of its speed, modifiers and prop included. */
const slower = (move: Move, factor: number): Move => {
  const propAt = move.propAt;
  return {
    ...move,
    steps: move.steps.map((s) => ({ ...s, ms: s.ms * factor })),
    mods: move.mods.map((mod) => ({
      from: mod.from * factor,
      to: mod.to * factor,
      apply: (p, s, k) => mod.apply(p, s / factor, k),
    })),
    propAt: propAt && ((t) => propAt(t / factor)),
  };
};

/** Squash and stretch, exaggerated: a squash goes this much deeper, a stretch this much longer. */
const SQUASH_GAIN = 1.8;
const STRETCH_GAIN = 2;
const bolder = (move: Move): Move => ({
  ...move,
  steps: move.steps.map((s) => ({
    ...s,
    pose: {
      ...clonePose(s.pose),
      sq:
        s.pose.sq < 1
          ? 1 - (1 - s.pose.sq) * SQUASH_GAIN
          : 1 + (s.pose.sq - 1) * STRETCH_GAIN,
    },
  })),
});

/** The move a cat plays: small play moves slowed down, and squash and stretch exaggerated. */
export const moveToPlay = (name: MoveName): Move =>
  bolder(
    SLOW_MOVES.has(name) ? slower(MOVES[name](), SLOW_PLAY) : MOVES[name](),
  );

/** Moves that carry the cat along its track; on a short track they are scaled to fit. */
export const TRAVEL_MOVES: ReadonlySet<MoveName> = new Set([
  'stalk',
  'fly',
  'yarn',
]);

/** Moves played at a track end, facing out, so the cup goes over the edge; see withApproach. */
export const EDGE_MOVES: ReadonlySet<MoveName> = new Set(['knock']);

/** Scales a travel move may shrink to on a short track, largest first. */
export const TRAVEL_FACTORS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4] as const;

/** A move with its sideways distances, the cat's and its prop's, scaled by `factor`. */
export const scaleTravel = (move: Move, factor: number): Move => {
  const propAt = move.propAt;
  return {
    ...move,
    steps: move.steps.map((s) => ({
      ...s,
      pose: { ...clonePose(s.pose), x: s.pose.x * factor },
    })),
    propAt:
      propAt &&
      ((t) => {
        const s = propAt(t);
        const cat = sample(move.steps, SCALE_FROM, t).x;
        const ahead = s.x - cat;
        const kept = Math.min(Math.abs(ahead), PROP_KEEP);
        const scaled = Math.max(Math.abs(ahead) * factor, kept);
        return { ...s, x: cat * factor + Math.sign(ahead) * scaled };
      }),
  };
};
/** A scaled travel move brings its prop no nearer the cat than this, in px: clear of the head. */
const PROP_KEEP = 45;
/* A travel move's steps set x absolutely, so the start pose only matters in its first step. */
const SCALE_FROM = BASE;

/* Move factories are deterministic, so each name's extent is sampled once. */
const extents = new Map<MoveName, readonly [number, number]>();

/** Every move name, to warm moveExtent's cache before any is needed. */
const MOVE_NAMES = Object.keys(MOVES) as MoveName[];

/** The extent of moveToPlay(name), computed on first use and then kept. */
export const moveExtent = (name: MoveName): readonly [number, number] => {
  const known = extents.get(name);
  if (known) return known;
  const found = extent(moveToPlay(name));
  extents.set(name, found);
  return found;
};

const scaledExtents = new Map<string, readonly [number, number]>();

/** The extent of a travel move scaled by `factor`, kept per name and factor. */
export const scaledExtent = (
  name: MoveName,
  factor: number,
): readonly [number, number] => {
  const key = `${name}@${factor}`;
  const known = scaledExtents.get(key);
  if (known) return known;
  const found = extent(scaleTravel(moveToPlay(name), factor));
  scaledExtents.set(key, found);
  return found;
};

/*
 * Relative weights per cat, so each plays a little differently. Every cat can
 * play every shared move; Rudra alone has the wand. Sleep and wake come from
 * the nap clock.
 */
export const CAT_WEIGHTS: Record<CatId, Partial<Record<MoveName, number>>> = {
  /* The queen: the calmest, but she chases too. */
  minerva: {
    look: 6,
    yarn: 5,
    fly: 5,
    stretch: 5,
    post: 4,
    knock: 4,
    stalk: 3,
    toy: 3,
    belly: 3,
    pounce: 2,
  },
  /* The conspirator: stalks and knocks the cup off, and chases yarn. */
  hela: {
    stalk: 9,
    knock: 9,
    yarn: 7,
    fly: 6,
    pounce: 4,
    look: 3,
    toy: 3,
    post: 2,
    stretch: 2,
    belly: 2,
  },
  /* The baby: chases everything, yarn and flies most. */
  rudra: {
    wand: 10,
    yarn: 11,
    fly: 10,
    toy: 7,
    stalk: 5,
    pounce: 4,
    belly: 4,
    knock: 3,
    post: 2,
    stretch: 2,
    look: 2,
  },
};

/*
 * A turn on the spot before a move that heads the other way: a small hop that
 * flips at its top, as a flat sticker cannot rotate. Squeezing the width
 * through zero reads as a thin sliver, not a cat.
 */
const TURN_RISE_MS = 160;
const TURN_FLIP_MS = 140;
const TURN_LAND_MS = 200;
const TURN_MS = TURN_RISE_MS + TURN_FLIP_MS + TURN_LAND_MS;
const TURN_HOP = 10;

export const withTurn = (move: Move, from: Pose): Move => {
  const propAt = move.propAt;
  const gather = { ...clonePose(from), sq: 0.94 };
  return {
    ...move,
    steps: [
      { ms: TURN_RISE_MS, pose: gather, ease: 'out' },
      { ms: TURN_FLIP_MS, pose: { ...gather, face: 1 }, ease: 'snap' },
      { ms: TURN_LAND_MS, pose: { ...clonePose(from), face: 1 }, ease: 'out' },
      ...move.steps,
    ],
    mods: [
      arc(TURN_RISE_MS - 60, TURN_RISE_MS + TURN_FLIP_MS + 60, TURN_HOP),
      ...move.mods.map((mod) => ({
        ...mod,
        from: mod.from + TURN_MS,
        to: mod.to + TURN_MS,
      })),
    ],
    propAt: propAt && ((t) => propAt(Math.max(0, t - TURN_MS))),
  };
};

/** px per second of a crouched creep, slower than a trot. */
const CREEP_SPEED = 45;
const CREEP_MIN_MS = 300;
const CREEP_READY_MS = 250;
const SETTLE_BACK_MS = 400;
/** Farther than this, a cat trots to the spot first and creeps only the last of it. */
const CREEP_REACH = 60;
/** A trot at the walk drawings' own pace, so they never skip. It stands up first, quickly at the start, so every rising frame shows before the paws move. */
const TROT_SPEED = WALK_SPEED;
const TROT_READY_MS = 800;

/** Trots, then creeps, `distance` ahead first, so an edge move starts at the track end from anywhere on it. */
/*
 * Also shuffles `settleBack` px back once the move is done, so a cat that crept
 * past its track's end finishes on it again.
 */
export const withApproach = (
  move: Move,
  distance: number,
  settleBack = 0,
): Move => {
  const trot = Math.max(0, distance - CREEP_REACH);
  const trotMs = trot > 0 ? (trot / TROT_SPEED) * 1000 : 0;
  const trotLead = trot > 0 ? TROT_READY_MS + trotMs : 0;
  const creep = Math.max(
    CREEP_MIN_MS,
    ((distance - trot) / CREEP_SPEED) * 1000,
  );
  const last = move.steps.at(-1)?.pose.x ?? 0;
  const lead = trotLead + CREEP_READY_MS + creep;
  const propAt = move.propAt;
  return {
    ...move,
    steps: [
      ...(trot > 0
        ? [
            step(TROT_READY_MS, 'stand', {}, 'out'),
            step(trotMs, 'stand', { x: trot }, 'linear'),
          ]
        : []),
      step(CREEP_READY_MS, 'crouch', { x: trot }),
      step(creep, 'crouch', { x: distance }),
      ...move.steps.map((s) => ({
        ...s,
        pose: { ...clonePose(s.pose), x: s.pose.x + distance },
      })),
      ...(settleBack > 0
        ? [step(SETTLE_BACK_MS, 'sit', { x: distance + last - settleBack })]
        : []),
    ],
    mods: [
      ...(trot > 0 ? [walking(TROT_READY_MS, trotLead)] : []),
      walking(trotLead + CREEP_READY_MS, lead, 0.6),
      ...move.mods.map((mod) => ({
        ...mod,
        from: mod.from + lead,
        to: mod.to + lead,
      })),
    ],
    propAt:
      propAt &&
      ((t) => {
        const s = propAt(Math.max(0, t - lead));
        return { ...s, x: s.x + distance, o: t < lead ? 0 : s.o };
      }),
  };
};

/** One 60fps frame, the step of extent's sampling. */
const EXTENT_STEP_MS = 1000 / 60;

/** A prop's half-width past its center, and the opacity below which it no longer counts. */
const PROP_REACH = 10;
const PROP_SEEN = 0.05;

/** A move's path back and forward from its start, its prop's included, for track checks: sampled from the drawn path, so eases and modifiers count. */
const extent = (move: Move): [number, number] => {
  const start = pose('sit');
  const length = duration(move);
  let back = 0;
  let forward = 0;
  for (let t = 0; t <= length + EXTENT_STEP_MS; t += EXTENT_STEP_MS) {
    const at = Math.min(t, length);
    const x = poseAt(move, start, at).x;
    back = Math.min(back, x);
    forward = Math.max(forward, x);
    const prop = move.propAt?.(at);
    if (prop && prop.o > PROP_SEEN) {
      back = Math.min(back, prop.x - PROP_REACH);
      forward = Math.max(forward, prop.x + PROP_REACH);
    }
  }
  return [back, forward];
};

const sample = (steps: Step[], start: Pose, t: number): Pose => {
  let from = start;
  let at = 0;
  for (const s of steps) {
    if (t <= at + s.ms)
      return mixPose(from, s.pose, EASE[s.ease]((t - at) / s.ms));
    at += s.ms;
    from = s.pose;
  }
  return clonePose(from);
};

/** A move's pose `t` ms in, from `start`, with its modifiers applied. */
export const poseAt = (move: Move, start: Pose, t: number): Pose => {
  const p = sample(move.steps, start, t);
  for (const mod of move.mods) {
    if (t >= mod.from && t <= mod.to)
      mod.apply(p, t - mod.from, (t - mod.from) / (mod.to - mod.from || 1));
  }
  return p;
};

const stepsDuration = (steps: Step[]): number =>
  steps.reduce((sum, s) => sum + s.ms, 0);

export const duration = (move: Move): number => stepsDuration(move.steps);

/** Every extent a colony may ask for, one call each, to warm in idle time before the first move needs them. */
export const EXTENT_WARMUPS: readonly (() => unknown)[] = [
  ...MOVE_NAMES.map((name) => () => moveExtent(name)),
  ...[...TRAVEL_MOVES].flatMap((name) =>
    TRAVEL_FACTORS.map((factor) => () => scaledExtent(name, factor)),
  ),
];
