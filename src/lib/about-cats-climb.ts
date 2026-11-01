/*
 * Climbing the step between two bricks of a raised wall. Coordinates are the
 * lower floor's: x forward from the start, y up, the step's edge at CLIMB_START.
 */
import {
  pose,
  type Move,
  type PoseName,
  type Step,
  type Ease,
} from './about-cats-moves';
import type { Pair, Pose } from './about-cats-types';

type Paw = 'fN' | 'fF' | 'hN' | 'hF';
const PAWS: readonly Paw[] = ['fN', 'fF', 'hN', 'hF'];

/** Where a climb starts, in px from the step's edge: a front paw short of the face below, or of the edge above. */
export const CLIMB_START = { up: 36, down: 24 } as const;
/** px a cat's center keeps from a step's edge on either brick: every climb ends there. */
export const CLIMB_CLEAR = 36;

/** A pose with its body center at (x, y) and the given paws at [x, height]; other paws stand `pose.by` below the center. */
const at = (
  name: PoseName,
  x: number,
  y: number,
  paws: Partial<Record<Paw, Pair>> = {},
  over: Partial<Pose> = {},
): Pose => {
  const p = pose(name, { ...over, x, by: y });
  for (const k of PAWS) {
    const w = paws[k];
    if (w) p[k] = [w[0] - x, y - w[1]];
  }
  return p;
};

const key = (ms: number, p: Pose, ease: Ease = 'inOut'): Step => ({
  ms,
  pose: p,
  ease,
});

/** The head bobs as the cat sizes up a jump, eyes on where it will land. */
const sizeUp = (from: number, to: number): Move['mods'][number] => ({
  from,
  to,
  apply: (p, s) => {
    p.hr += 5 * Math.sin(s / 110);
  },
});

/* Up: look, crouch and size it up, spring from the hind legs, land front paws then hind paws on the top, one drawing per stage. */
const up = (h: number): Move => {
  const e = CLIMB_START.up;
  return {
    rise: h,
    mods: [sizeUp(600, 1200)],
    steps: [
      key(300, at('stand', 0, 26, {}, { hr: -22 })),
      key(300, at('crouch', -2, 16, {}, { hr: -26, ba: 8 })),
      key(600, at('crouch', -2, 16, {}, { hr: -26, ba: 8 })),
      key(
        150,
        at(
          'stand',
          e - 14,
          34,
          {
            fN: [e + 2, 30],
            fF: [e - 2, 26],
            hN: [e - 30, 0],
            hF: [e - 27, 0],
          },
          { ba: 35, hr: -14, draw: 'takeoff' },
        ),
        'in',
      ),
      key(
        200,
        at(
          'stand',
          e + 4,
          h + 22,
          {
            fN: [e + 18, h + 4],
            fF: [e + 14, h + 6],
            hN: [e - 6, h + 6],
            hF: [e - 3, h + 8],
          },
          { ba: 12, hr: -6, draw: 'leap' },
        ),
        'out',
      ),
      key(
        110,
        at(
          'stand',
          e + 14,
          h + 20,
          {
            fN: [e + 24, h],
            fF: [e + 20, h],
            hN: [e + 2, h + 5],
            hF: [e + 5, h + 6],
          },
          { ba: -6, draw: 'landing' },
        ),
        'in',
      ),
      key(
        120,
        at(
          'stand',
          e + 20,
          h + 22,
          { fN: [e + 30, h], fF: [e + 27, h], hN: [e + 6, h], hF: [e + 9, h] },
          { draw: 'crouch' },
        ),
        'out',
      ),
      key(300, at('stand', e + CLIMB_CLEAR, h + 26, {})),
      key(500, at('sit', e + CLIMB_CLEAR, h + 25, {})),
    ],
  };
};

/* Down: peer over the edge, push off, and hop down onto the floor clear of the brick, landing front paws first. */
const down = (h: number): Move => {
  const e = CLIMB_START.down;
  const edge: Partial<Record<Paw, Pair>> = { fN: [e - 1, h], fF: [e - 4, h] };
  const onTop: Partial<Record<Paw, Pair>> = {
    fN: [e + 6, h],
    fF: [e + 3, h],
    hN: [e - 18, h],
    hF: [e - 15, h],
  };
  const land = e + CLIMB_CLEAR;
  const onFloor: Partial<Record<Paw, Pair>> = {
    fN: [land + 10, 0],
    fF: [land + 7, 0],
    hN: [land - 14, 0],
    hF: [land - 11, 0],
  };
  return {
    rise: -h,
    mods: [],
    steps: [
      key(300, at('stand', 0, h + 26, {}, { hr: 22 })),
      key(400, at('crouch', e - 14, h + 16, edge, { hr: 30 })),
      key(300, at('crouch', e - 14, h + 16, edge, { hr: 30 })),
      key(200, at('stand', e - 6, h + 22, onTop, { draw: 'takeoff' })),
      key(200, at('stand', land - 6, 24, onFloor, { draw: 'leap' }), 'in'),
      key(60, at('stand', land - 4, 22, onFloor, { draw: 'landing' }), 'out'),
      key(140, at('crouch', land, 16, {}), 'out'),
      key(300, at('stand', land, 26, {})),
      key(500, at('sit', land, 25, {})),
    ],
  };
};

export const climbMove = (rising: boolean, h: number): Move =>
  rising ? up(h) : down(h);
