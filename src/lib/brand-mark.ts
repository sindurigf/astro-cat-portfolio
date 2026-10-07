/**
 * The logo: an eared tile drawn as a calico cat with happy eyes. One source
 * for the header and About tiles, the footer head, the favicons and the app
 * icons (scripts/make-icons.mjs). Units are a 64-unit square; the tile body
 * spans 4 to 60, so a tile `n` px wide draws the square at `n * 64 / 56`.
 */

/** A color token name without `--color-`, turned into paint by the caller. */
export type Paint = (token: string) => string;

export const MARK_SIZE = 64;
/** The tile body's width in mark units: 4 to 60. */
export const MARK_BODY = 56;
/** The 4px edge of a 48px tile, in mark units. */
export const MARK_EDGE = 4.67;
/** The 8px shadow of a 48px tile, in mark units. */
export const MARK_SHADOW_OFFSET = 9.33;

export const MARK_HEAD =
  'M4 46L4 13Q4 4 12 8L23 15Q26 17 30 17H34Q38 17 41 15L52 8Q60 4 60 13V46Q60 60 46 60H18Q4 60 4 46Z';
const EAR_LEFT = 'M10 15.5V12.5Q10 10.5 12 11.6L19 16Q14 18 10 20Z';
const EAR_RIGHT = 'M54 15.5V12.5Q54 10.5 52 11.6L45 16Q50 18 54 20Z';
const PATCH_ORANGE = 'M0 0H31Q34 14 28 24Q20 31 0 31Z';
const PATCH_BLACK = 'M49 16Q58 14 64 20V40Q55 43 50 36Q46 26 49 16Z';
const HAPPY_EYES = 'M17.5 37L22 32L26.5 37M37.5 37L42 32L46.5 37';
const SMALL_EYES = 'M14 40L21 31L28 40M36 40L43 31L50 40';
const NOSE =
  'M28.5 43.5H35.5Q37 43.5 36 45L33.2 48Q32 49.2 30.8 48L28 45Q27 43.5 28.5 43.5Z';
const WHISKERS = 'M16 45.5L8.5 44M16 50L9 51M48 45.5L55.5 44M48 50L55 51';

const EYE_WIDTH = 3.6;
const SMALL_EYE_WIDTH = 6.5;
const WHISKER_WIDTH = 1.7;
/** Ink outside the blue edge on small icons: the edge is 2.93:1 on a light tab strip. */
const RIM_WIDTH = 3;

interface MarkOptions {
  /** The orange patch and bold eyes only: the 16 to 48px tab icons. */
  small?: boolean;
  /** An ink rim outside the blue edge, for icons on unknown grounds. */
  rim?: boolean;
  /** A unique suffix for the clip path id, one per mark on a page. */
  id: string;
}

/** The mark's inner SVG markup, in a 0 0 64 64 viewBox. */
export const markMarkup = (
  paint: Paint,
  { small = false, rim: withRim = small, id }: MarkOptions,
): string => {
  const clip = `cat-mark-clip-${id}`;
  const rim = withRim
    ? `<path d="${MARK_HEAD}" fill="none" stroke="${paint('gold-text')}" stroke-width="${MARK_EDGE + 2 * RIM_WIDTH}" stroke-linejoin="round"/>`
    : '';
  const ears = small
    ? ''
    : `<path d="${EAR_LEFT}" fill="${paint('cat-cardboard')}"/><path d="${EAR_RIGHT}" fill="${paint('cat-mochi-far')}"/>`;
  /* At tab size the black patch runs into the right eye. */
  const blackPatch = small
    ? ''
    : `<path d="${PATCH_BLACK}" fill="${paint('cat-mochi-black')}"/>`;
  const face = small
    ? `<path d="${SMALL_EYES}" fill="none" stroke="${paint('gold-text')}" stroke-width="${SMALL_EYE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${HAPPY_EYES}" fill="none" stroke="${paint('gold-text')}" stroke-width="${EYE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${NOSE}" fill="${paint('mark')}"/>` +
      `<path d="${WHISKERS}" fill="none" stroke="${paint('gold-text')}" stroke-width="${WHISKER_WIDTH}" stroke-linecap="round"/>`;
  return (
    `<defs><clipPath id="${clip}"><path d="${MARK_HEAD}"/></clipPath></defs>` +
    rim +
    `<path d="${MARK_HEAD}" fill="${paint('cat-mochi')}"/>` +
    `<g clip-path="url(#${clip})"><path d="${PATCH_ORANGE}" fill="${paint('cat-mochi-orange')}"/>${blackPatch}</g>` +
    ears +
    face +
    `<path d="${MARK_HEAD}" fill="none" stroke="${paint('tile-edge')}" stroke-width="${MARK_EDGE}" stroke-linejoin="round"/>`
  );
};

/** The head alone, filled: a hard shadow or a one-color mark. */
export const markSilhouette = (fill: string): string =>
  `<path d="${MARK_HEAD}" fill="${fill}"/>`;

/** The one-color mark: the head in `ink` with the happy eyes and nose cut out. */
export const markOneColor = (ink: string, id: string): string => {
  const mask = `cat-mark-cut-${id}`;
  return (
    `<defs><mask id="${mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="${MARK_SIZE}" height="${MARK_SIZE}">` +
    `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" fill="white"/>` +
    `<path d="${HAPPY_EYES}" fill="none" stroke="black" stroke-width="${EYE_WIDTH + 1}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${NOSE}" fill="black"/></mask></defs>` +
    `<path d="${MARK_HEAD}" fill="${ink}" mask="url(#${mask})"/>`
  );
};

/** Paint from the CSS tokens, for markup the site renders. */
export const tokenPaint: Paint = (token) => `var(--color-${token})`;
