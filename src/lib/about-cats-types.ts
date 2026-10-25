/*
 * Types shared by the About cats' rig, moves and colony, here so the rig and
 * the moves need not import each other.
 */
export type CatId = 'minerva' | 'hela' | 'rudra';

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
  hr: number;
  eyes: number;
  rot: number;
  zz: number;
}

/** A stretch of the band's floor and how far below the band's bottom it lies, in px. */
export interface Ledge {
  x0: number;
  x1: number;
  drop: number;
}

export type PropKind = 'toy' | 'cup' | 'post' | 'fly' | 'yarn';

export interface PropState {
  kind: PropKind;
  x: number;
  y: number;
  r: number;
  o: number;
}
