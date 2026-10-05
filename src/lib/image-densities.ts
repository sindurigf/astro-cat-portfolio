/** Images and the hero canvases: nothing visible is gained past 2x. */
export const MAX_PIXEL_RATIO = 2;

export const DENSITIES = [1, MAX_PIXEL_RATIO];

/*
 * For fluid images. Steps stay within 1.5x, the oversize limit in
 * tests/image-size.spec.ts.
 */
export const WIDTHS = [320, 480, 640, 960, 1280, 1536];

/* Markdown images: a post figure is drawn up to 1231px wide, so 2x needs 2400. */
export const MARKDOWN_WIDTHS = [...WIDTHS, 1920, 2400];

/*
 * A hero photo's drawn width in a `.gold-column` slab: PageHero and a post
 * cover. Arms turn where the column passes the rail (1396px) and its `vw`
 * inset caps (1829px). tests/image-size.spec.ts fails on drift.
 */
export const HERO_PHOTO_SIZES =
  '(min-width: 1829px) calc(20.93vw + 174px), (min-width: 1396px) calc(17.9vw + 230px), (min-width: 83rem) 480px, (min-width: 64rem) calc(39vw - 37px), min(calc(100vw - 6rem), 24rem)';
