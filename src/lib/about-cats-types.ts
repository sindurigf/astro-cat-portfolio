/*
 * Types shared by the About cats' rig, moves and colony, here so the rig and
 * the moves need not import each other.
 */
export type CatId = 'pepper' | 'mochi' | 'biscuit';

export type Pair = [number, number];

export interface Pose {
  x: number;
  y: number;
  face: number;
  /** Body angle in degrees, front up. */
  ba: number;
  /** Body center's height above the ground. */
  by: number;
  /** Body thickness. */
  bt: number;
  /** Squash (below 1) and stretch (above 1). */
  sq: number;
  haunch: number;
  /** Paw targets from the body center: near and far front, near and far hind. */
  fN: Pair;
  fF: Pair;
  hN: Pair;
  hF: Pair;
  /** Front and hind leg length, as a share of the drawn length: a sitting cat's front legs are long and straight. */
  fl: number;
  hl: number;
  hx: number;
  hy: number;
  hr: number;
  /** Tail base angle, curl per segment, and tip twitch amplitude. */
  ta: number;
  tc: number;
  tw: number;
  eyes: number;
  ears: number;
  rot: number;
  mouth: number;
  zz: number;
}

export type PropKind = 'toy' | 'cup' | 'post' | 'fly' | 'yarn';

export interface PropState {
  kind: PropKind;
  x: number;
  y: number;
  r: number;
  o: number;
}
