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
  edge: number,
  h: number,
  paws: Partial<Record<Paw, Pair>> = {},
  over: Partial<Pose> = {},
): Pose => {
  const p = pose(name, { ...over, x, by: y, sx: edge - x, sh: h });
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

/* Up: look, crouch and size it up, spring from the hind legs, land front paws then hind paws on the top. */
const up = (h: number): Move => {
  const e = CLIMB_START.up;
  const s = (
    name: PoseName,
    x: number,
    y: number,
    paws: Partial<Record<Paw, Pair>>,
    over: Partial<Pose> = {},
  ) => at(name, x, y, e, h, paws, over);
  return {
    rise: h,
    mods: [sizeUp(600, 1200)],
    steps: [
      key(300, s('stand', 0, 26, {}, { hr: -22 })),
      key(300, s('crouch', -2, 16, {}, { hr: -26, ba: 8, ears: 0 })),
      key(600, s('crouch', -2, 16, {}, { hr: -26, ba: 8, ears: 0 })),
      key(
        150,
        s(
          'stand',
          e - 14,
          34,
          {
            fN: [e + 2, 30],
            fF: [e - 2, 26],
            hN: [e - 30, 0],
            hF: [e - 27, 0],
          },
          { ba: 35, sq: 0.9, hl: 1.4, hr: -14 },
        ),
        'in',
      ),
      key(
        200,
        s(
          'stand',
          e + 4,
          h + 22,
          {
            fN: [e + 18, h + 4],
            fF: [e + 14, h + 6],
            hN: [e - 6, h + 6],
            hF: [e - 3, h + 8],
          },
          { ba: 12, sq: 0.92, hr: -6 },
        ),
        'out',
      ),
      key(
        110,
        s(
          'stand',
          e + 14,
          h + 20,
          {
            fN: [e + 24, h],
            fF: [e + 20, h],
            hN: [e + 2, h + 5],
            hF: [e + 5, h + 6],
          },
          { ba: -6 },
        ),
        'in',
      ),
      key(
        120,
        s(
          'stand',
          e + 20,
          h + 22,
          { fN: [e + 30, h], fF: [e + 27, h], hN: [e + 6, h], hF: [e + 9, h] },
          { sq: 0.9 },
        ),
        'out',
      ),
      key(300, s('stand', e + CLIMB_CLEAR, h + 26, {})),
      key(500, s('sit', e + CLIMB_CLEAR, h + 25, {})),
    ],
  };
};

/* Down: peer over, stretch both front paws down the face, hold, let go with the hind legs; front paws land first, then hind. */
const down = (h: number): Move => {
  const e = CLIMB_START.down;
  const s = (
    name: PoseName,
    x: number,
    y: number,
    paws: Partial<Record<Paw, Pair>>,
    over: Partial<Pose> = {},
  ) => at(name, x, y, e, -h, paws, over);
  const top: Partial<Record<Paw, Pair>> = { hN: [e - 14, h], hF: [e - 11, h] };
  const reach = {
    fN: [e + 10, h * 0.25] as Pair,
    fF: [e + 7, h * 0.3] as Pair,
  };
  return {
    rise: -h,
    mods: [],
    steps: [
      key(300, s('stand', 0, h + 26, {}, { hr: 22, hx: 9, hy: -8 })),
      key(
        400,
        s(
          'crouch',
          e - 14,
          h + 16,
          { fN: [e - 1, h], fF: [e - 4, h] },
          { hr: 30 },
        ),
      ),
      key(
        450,
        s(
          'stand',
          e - 2,
          h + 2,
          { ...reach, ...top },
          { ba: -50, sq: 0.85, fl: 1.6, hr: 12, hx: 10, hy: -6 },
        ),
        'out',
      ),
      key(
        250,
        s(
          'stand',
          e - 2,
          h + 1,
          { ...reach, ...top },
          { ba: -50, sq: 0.85, fl: 1.6, hr: 12, hx: 10, hy: -6 },
        ),
      ),
      key(
        180,
        s(
          'stand',
          e + 10,
          h - 6,
          {
            fN: [e + 20, 4],
            fF: [e + 16, 6],
            hN: [e - 4, h + 2],
            hF: [e - 1, h + 4],
          },
          { ba: -35, sq: 0.9, fl: 1.4, hx: 10, hy: -8 },
        ),
        'in',
      ),
      key(
        120,
        s(
          'crouch',
          e + 20,
          22,
          {
            fN: [e + 30, 0],
            fF: [e + 26, 0],
            hN: [e + 8, 14],
            hF: [e + 11, 16],
          },
          { ba: -20, sq: 0.86 },
        ),
        'out',
      ),
      key(
        140,
        s(
          'crouch',
          e + 26,
          22,
          {
            fN: [e + 36, 0],
            fF: [e + 33, 0],
            hN: [e + 14, 0],
            hF: [e + 17, 0],
          },
          { sq: 0.88 },
        ),
        'out',
      ),
      key(300, s('stand', e + CLIMB_CLEAR, 26, {})),
      key(500, s('sit', e + CLIMB_CLEAR, 25, {})),
    ],
  };
};

export const climbMove = (rising: boolean, h: number): Move =>
  rising ? up(h) : down(h);
