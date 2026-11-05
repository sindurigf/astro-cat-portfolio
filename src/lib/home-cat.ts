/*
 * Pure. The homepage cat is one About cat drawn from its own sheet: a few of
 * its frames stand for the poses the meadow and the fall use. The drawings
 * face left; the cat moves as one piece and swaps frames.
 */
import type { Frame } from './about-cats-frames';
import type { CatId } from './about-cats-types';

/* Its white coat reads on the dark page and on gold alike. */
export const HOME_CAT: CatId = 'hela';

export type CatPose = 'sit' | 'look' | 'crouch' | 'leap' | 'landing';

/* home.css draws each pose from this frame; tests/home-cat.spec.ts keeps them in step. */
export const POSE_FRAMES: Readonly<Record<CatPose, Frame>> = {
  sit: 'sitside',
  look: 'headturn',
  crouch: 'crouch',
  leap: 'leap',
  landing: 'landing',
};
