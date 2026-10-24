/* Pure. Picks the Canva AI frame that draws a cat's pose, and how tall each frame is drawn. */
import type { CatId, Pose } from './about-cats-types';

export const FRAMES = [
  'sit',
  'stand',
  'walk',
  'walk2',
  'walk3',
  'walk4',
  'walk5',
  'walk6',
  'walk7',
  'walk8',
  'rise',
  'crouchdown',
  'crouch',
  'takeoff',
  'leap',
  'landing',
  'stretchhalf',
  'stretch',
  'loafsink',
  'loaf',
  'lieside',
  'sleep',
  'roll',
  'belly',
  'pawrise',
  'swat',
  'headturn',
  'look',
] as const;

export type Frame = (typeof FRAMES)[number];

/** The walk cycle, one stride. */
export const WALK: readonly Frame[] = [
  'walk',
  'walk2',
  'walk3',
  'walk4',
  'walk5',
  'walk6',
  'walk7',
  'walk8',
];

/** The walk frame `step` strides in; steps count up from 0. */
export const walkFrame = (step: number): Frame =>
  WALK[step % WALK.length] ?? 'walk';

/** A sitting cat's drawn height in px; Hela is the smallest of the three. */
export const SIT_HEIGHT: Record<CatId, number> = {
  minerva: 80,
  rudra: 80,
  hela: 60,
};

/**
 * Each frame's drawn size as a share of the cat's sitting height: upright
 * frames by height, lying and walking frames by length, so the cat's body
 * keeps one size whatever its tail does.
 */
const SIZE: Record<Frame, ['h' | 'w', number]> = {
  sit: ['h', 1],
  stand: ['w', 1.01],
  walk: ['w', 1.01],
  walk2: ['w', 1.01],
  walk3: ['w', 1.01],
  walk4: ['w', 1.01],
  walk5: ['w', 1.01],
  walk6: ['w', 1.01],
  walk7: ['w', 1.01],
  walk8: ['w', 1.01],
  rise: ['w', 0.94],
  crouchdown: ['w', 1.12],
  crouch: ['w', 1.12],
  takeoff: ['w', 1.12],
  leap: ['w', 1.27],
  landing: ['w', 1.05],
  stretchhalf: ['w', 1.09],
  stretch: ['w', 1.05],
  loafsink: ['w', 0.94],
  loaf: ['w', 0.83],
  lieside: ['w', 1.24],
  sleep: ['w', 0.79],
  roll: ['w', 1.05],
  belly: ['w', 1.05],
  pawrise: ['h', 1.08],
  swat: ['h', 1.22],
  headturn: ['h', 1],
  look: ['h', 1],
};

/** Per cat, how much larger a frame is drawn than SIZE says: each drawing is framed a little differently. Rudra stands taller than the others when he stretches up. */
const ADJUST: Record<CatId, Partial<Record<Frame, number>>> = {
  minerva: { pawrise: 0.9, swat: 0.9, loaf: 0.85 },
  rudra: { pawrise: 1.16, swat: 1.23, loaf: 0.8, belly: 0.85 },
  hela: {
    walk: 1.1,
    walk2: 1.1,
    walk3: 1.1,
    walk4: 1.1,
    walk5: 1.1,
    walk6: 1.1,
    walk7: 1.1,
    walk8: 1.1,
    belly: 0.8,
  },
};

/** Drawn height in px of a frame whose source is `w` by `h`. */
export const frameHeight = (
  cat: CatId,
  frame: Frame,
  w: number,
  h: number,
): number => {
  const [by, share] = SIZE[frame];
  const size = SIT_HEIGHT[cat] * share * (ADJUST[cat][frame] ?? 1);
  return by === 'h' ? size : (size * h) / w;
};

/** The named poses in about-cats-moves.ts and the frame each is drawn as. */
export const POSE_FRAME = {
  stand: 'stand',
  sit: 'sit',
  loaf: 'loaf',
  sleep: 'sleep',
  rear: 'pawrise',
  low: 'pawrise',
  leap: 'swat',
  stretch: 'stretch',
  belly: 'belly',
  crouch: 'crouch',
  air: 'leap',
} as const satisfies Record<string, Frame>;

export type NamedPose = keyof typeof POSE_FRAME;

/** The in-between frame drawn halfway from one named pose to another, either way. */
const BETWEEN: [NamedPose, NamedPose, Frame][] = [
  ['stand', 'sit', 'rise'],
  ['stand', 'crouch', 'crouchdown'],
  ['crouch', 'air', 'takeoff'],
  ['air', 'stand', 'landing'],
  ['stand', 'stretch', 'stretchhalf'],
  ['sit', 'loaf', 'loafsink'],
  ['stand', 'loaf', 'loafsink'],
  ['sit', 'rear', 'pawrise'],
  ['sit', 'low', 'pawrise'],
  ['stand', 'rear', 'pawrise'],
  ['rear', 'leap', 'swat'],
];

/** Whether `frame` is drawn in passing between `from` and another pose. */
export const bridges = (from: Frame, frame: Frame): boolean =>
  BETWEEN.some(
    ([a, b, between]) =>
      between === frame && (POSE_FRAME[a] === from || POSE_FRAME[b] === from),
  );

export const betweenFrame = (a: NamedPose, b: NamedPose): Frame | null =>
  BETWEEN.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2] ??
  null;

/** px or degrees of each pose value that count as one unit of difference. */
const UNIT = {
  ba: 10,
  by: 4,
  haunch: 4,
  paw: 8,
  bt: 4,
  /* Open or shut eyes, and the Zz, outweigh small shifts of the body. */
  eyes: 0.5,
  zz: 1 / 3,
};

/** How far apart two poses look: body angle and height, haunch, front paw, thickness, eyes, sleep. */
export const poseDistance = (p: Pose, q: Pose): number =>
  Math.abs(p.ba - q.ba) / UNIT.ba +
  Math.abs(p.by - q.by) / UNIT.by +
  Math.abs(p.haunch - q.haunch) / UNIT.haunch +
  Math.abs(p.fN[1] - q.fN[1]) / UNIT.paw +
  Math.abs(p.fN[0] - q.fN[0]) / UNIT.paw +
  Math.abs(p.bt - q.bt) / UNIT.bt +
  Math.abs(p.eyes - q.eyes) / UNIT.eyes +
  Math.abs(p.zz - q.zz) / UNIT.zz;

/** Share of the way between the nearest pose and the next past which the in-between frame shows. */
const BETWEEN_FROM = 0.3;
/** Roll angle in degrees past which a cat is on its side, and past which it is on its back. */
const ON_SIDE = 25;
const ON_BACK = 135;
/** Head turn in degrees that reads as a glance, and as a look back. */
const GLANCE = 5;
export const LOOK_BACK = 20;
/** px off the ground that reads as a jump, and as the top of one. */
const AIRBORNE = 3;
const HIGH = 14;
/** px the body travels in one stride, the drawn step length of the walk cycle. */
export const WALK_STRIDE_PX = 52;

/** px the body travels per walk frame, so a planted paw stays put. */
export const WALK_FRAME_PX = WALK_STRIDE_PX / WALK.length;

export interface Motion {
  /** px travelled along the ground since the cat started walking. */
  travelled: number;
  moving: boolean;
  /** Height above the ground now and on the last frame. */
  lift: number;
  lastLift: number;
}

/** The frame that draws `p`, given the named poses to compare it with. */
export const frameFor = (
  p: Pose,
  named: Readonly<Record<NamedPose, Pose>>,
  motion: Motion,
): Frame => {
  const roll = Math.abs(((p.rot % 360) + 360) % 360);
  const turned = roll > 180 ? 360 - roll : roll;
  if (turned > ON_BACK) return 'belly';
  if (turned > ON_SIDE)
    return turned > (ON_SIDE + ON_BACK) / 2 ? 'roll' : 'lieside';

  const ranked = (Object.keys(named) as NamedPose[])
    .map((name) => ({ name, d: poseDistance(p, named[name]) }))
    .sort((a, b) => a.d - b.d);
  const [near, second] = ranked;
  if (!near) return 'sit';
  const next = second ?? near;

  /* A low hop from sitting, such as a turn on the spot, keeps the sitting frame: jump frames would flash a leap. */
  const sitHop = near.name === 'sit' && motion.lift <= HIGH;
  if (motion.lift > AIRBORNE && !sitHop) {
    if (motion.lift > HIGH) return 'leap';
    return motion.lift >= motion.lastLift ? 'takeoff' : 'landing';
  }

  const share = near.d / (near.d + next.d || 1);
  const between =
    share > BETWEEN_FROM ? betweenFrame(near.name, next.name) : null;

  if (motion.moving && (near.name === 'stand' || near.name === 'crouch'))
    return near.name === 'crouch'
      ? 'crouch'
      : walkFrame(Math.floor(motion.travelled / WALK_FRAME_PX));

  if (between) return between;
  if (near.name === 'sit' && Math.abs(p.hr) > LOOK_BACK) return 'look';
  if (near.name === 'sit' && Math.abs(p.hr) > GLANCE) return 'headturn';
  return POSE_FRAME[near.name];
};
