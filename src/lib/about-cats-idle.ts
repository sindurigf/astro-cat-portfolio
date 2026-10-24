/*
 * What a resting cat does between moves: breathes and glances aside. Offsets
 * only; the pose they sit on is the cat's own. The sprite frames draw the
 * breath as a scale and a glance as a head-turn frame.
 */

/** A sitting cat breathes about 24 times a minute. */
const BREATH_MS = 2500;
/** Chest thickness gained at the top of a breath, in px. */
export const BREATH_DEPTH = 3.2;
const GLANCE_EVERY_MS = [2500, 6000] as const;
const GLANCE_MS = 700;
/** Largest head turn in degrees; the head returns to center about half the time. */
const GLANCE_DEG = 28;
const GLANCE_CENTER_CHANCE = 0.5;
/** A turn is to either side with equal chance, and at least this share of the largest. */
const GLANCE_SIDE_CHANCE = 0.5;
const GLANCE_MIN_SHARE = 0.5;

export interface IdleState {
  breathPhase: number;
  nextGlance: number;
  glanceFrom: number;
  glanceTo: number;
  glanceAt: number;
}

export interface IdleOffsets {
  bt: number;
  hr: number;
}

type Range = readonly [number, number];

/** A timer not yet started: the first tick schedules it, so cats never glance together. */
const UNSET = -1;

export const createIdle = (): IdleState => ({
  breathPhase: Math.random() * BREATH_MS,
  nextGlance: UNSET,
  glanceFrom: 0,
  glanceTo: 0,
  glanceAt: -Infinity,
});

/** Back to a cat that has just sat down: no glance runs, and its timer starts again at the next tick. */
export const rearmIdle = (state: IdleState): void => {
  state.nextGlance = UNSET;
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

/** Starts the next glance when its time has come. `roll` gives numbers from 0 to 1. */
export const tickIdle = (
  state: IdleState,
  now: number,
  roll: () => number = Math.random,
): void => {
  if (state.nextGlance === UNSET)
    state.nextGlance = now + within(GLANCE_EVERY_MS, roll());
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
};

export const idleOffsets = (state: IdleState, now: number): IdleOffsets => ({
  bt:
    BREATH_DEPTH *
    Math.sin((2 * Math.PI * (now + state.breathPhase)) / BREATH_MS),
  hr: glanceNow(state, now),
});

/** Slow while only the breath moves, quicker for a glance. */
const CALM_FRAME_MS = 100;
const BUSY_FRAME_MS = 50;

export const idleFrameMs = (
  state: IdleState,
  now: number,
  busy = false,
): number =>
  busy ||
  (state.glanceFrom !== state.glanceTo && now - state.glanceAt < GLANCE_MS)
    ? BUSY_FRAME_MS
    : CALM_FRAME_MS;
