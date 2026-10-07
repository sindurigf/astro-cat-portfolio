/*
 * What a resting cat does between moves: breathes, flicks an ear, glances
 * aside and twitches the tail tip. Offsets only; the pose they sit on is the
 * cat's own.
 */

/** A sitting cat breathes about 24 times a minute. */
const BREATH_MS = 2500;
/** Chest thickness gained at the top of a breath, in px. */
const BREATH_DEPTH = 3.2;
const EAR_FLICK_EVERY_MS = [3500, 8000] as const;
const EAR_FLICK_MS = 260;
/** How far the ear swings, 0 to 1. */
const EAR_FLICK_SWING = 1;
const GLANCE_EVERY_MS = [2500, 6000] as const;
const GLANCE_MS = 700;
/** Largest head turn in degrees; the head returns to center about half the time. */
const GLANCE_DEG = 28;
const GLANCE_CENTER_CHANCE = 0.5;
/** A turn is to either side with equal chance, and at least this share of the largest. */
const GLANCE_SIDE_CHANCE = 0.5;
const GLANCE_MIN_SHARE = 0.5;
const TWITCH_EVERY_MS = [4000, 10000] as const;
const TWITCH_MS = 900;
/** Tail-tip twitch amplitude while it twitches. */
const TWITCH_AMPLITUDE = 4;
/** The tail base sways this many degrees, once every SWAY_MS. */
const SWAY_DEG = 14;
const SWAY_MS = 3400;

export interface IdleState {
  breathPhase: number;
  nextEarFlick: number;
  earFlickUntil: number;
  nextGlance: number;
  glanceFrom: number;
  glanceTo: number;
  glanceAt: number;
  nextTwitch: number;
  twitchUntil: number;
}

export interface IdleOffsets {
  ta: number;
  bt: number;
  ears: number;
  hr: number;
  tw: number;
}

type Range = readonly [number, number];

/** A timer not yet started: the first tick schedules it, so cats never flick and glance together. */
const UNSET = -1;

export const createIdle = (): IdleState => ({
  breathPhase: Math.random() * BREATH_MS,
  nextEarFlick: UNSET,
  earFlickUntil: 0,
  nextGlance: UNSET,
  glanceFrom: 0,
  glanceTo: 0,
  glanceAt: -Infinity,
  nextTwitch: UNSET,
  twitchUntil: 0,
});

/** Back to a cat that has just sat down: no event runs, and the timers start again at the next tick. */
export const rearmIdle = (state: IdleState): void => {
  state.nextEarFlick = UNSET;
  state.nextGlance = UNSET;
  state.nextTwitch = UNSET;
  state.earFlickUntil = 0;
  state.twitchUntil = 0;
  state.glanceFrom = 0;
  state.glanceTo = 0;
  state.glanceAt = -Infinity;
};

const smooth = (k: number): number => k * k * (3 - 2 * k);

const glanceNow = (state: IdleState, now: number): number =>
  state.glanceFrom +
  (state.glanceTo - state.glanceFrom) *
    smooth(Math.min(1, Math.max(0, (now - state.glanceAt) / GLANCE_MS)));

const within = ([lo, hi]: Range, roll: number): number => lo + roll * (hi - lo);

/** Starts the next flick, glance or twitch when its time has come. `roll` gives numbers from 0 to 1. */
export const tickIdle = (
  state: IdleState,
  now: number,
  roll: () => number = Math.random,
): void => {
  if (state.nextEarFlick === UNSET)
    state.nextEarFlick = now + within(EAR_FLICK_EVERY_MS, roll());
  if (state.nextGlance === UNSET)
    state.nextGlance = now + within(GLANCE_EVERY_MS, roll());
  if (state.nextTwitch === UNSET)
    state.nextTwitch = now + within(TWITCH_EVERY_MS, roll());
  if (now >= state.nextEarFlick) {
    state.earFlickUntil = now + EAR_FLICK_MS;
    state.nextEarFlick = now + within(EAR_FLICK_EVERY_MS, roll());
  }
  if (now >= state.nextGlance) {
    state.glanceFrom = glanceNow(state, now);
    state.glanceTo =
      roll() < GLANCE_CENTER_CHANCE
        ? 0
        : (roll() < GLANCE_SIDE_CHANCE ? -1 : 1) *
          GLANCE_DEG *
          (GLANCE_MIN_SHARE + (1 - GLANCE_MIN_SHARE) * roll());
    state.glanceAt = now;
    state.nextGlance = now + within(GLANCE_EVERY_MS, roll());
  }
  if (now >= state.nextTwitch) {
    state.twitchUntil = now + TWITCH_MS;
    state.nextTwitch = now + within(TWITCH_EVERY_MS, roll());
  }
};

export const idleOffsets = (state: IdleState, now: number): IdleOffsets => {
  const flick = Math.max(0, (state.earFlickUntil - now) / EAR_FLICK_MS);
  return {
    ta:
      SWAY_DEG * Math.sin((2 * Math.PI * (now + state.breathPhase)) / SWAY_MS),
    bt:
      BREATH_DEPTH *
      Math.sin((2 * Math.PI * (now + state.breathPhase)) / BREATH_MS),
    ears:
      flick > 0 && flick <= 1
        ? Math.sin(Math.PI * (1 - flick)) * EAR_FLICK_SWING
        : 0,
    hr: glanceNow(state, now),
    tw: now < state.twitchUntil ? TWITCH_AMPLITUDE : 0,
  };
};

/** Slow while only the breath and sway move, quicker for a flick, glance or twitch. */
const CALM_FRAME_MS = 100;
const BUSY_FRAME_MS = 50;

export const idleFrameMs = (
  state: IdleState,
  now: number,
  busy = false,
): number =>
  busy ||
  now < state.earFlickUntil ||
  now < state.twitchUntil ||
  (state.glanceFrom !== state.glanceTo && now - state.glanceAt < GLANCE_MS)
    ? BUSY_FRAME_MS
    : CALM_FRAME_MS;
