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
/* The figure's `max-w-sm` less both `border-4` edges of its frame. */
const HERO_PHOTO_CAP = 'calc(24rem - 8px)';

export const HERO_PHOTO_SIZES = `(min-width: 1829px) calc(20.93vw + 178px), (min-width: 1396px) calc(17.9vw + 234px), (min-width: 83rem) 484px, (min-width: 64rem) calc(39vw - 34px), min(calc(100vw - 5.5rem), ${HERO_PHOTO_CAP})`;

/*
 * A post card thumbnail: the `w-32` frame less both `border-4` edges, in rem
 * so a larger root font size fetches a larger file. Steps stay within 1.5x.
 */
export const THUMBNAIL_PX = 120;
export const THUMBNAIL_SIZES = 'calc(8rem - 8px)';
export const THUMBNAIL_WIDTHS = [THUMBNAIL_PX, 180, 240, 360, 480];

/*
 * The newest post's cover on a homepage Featured Posts card, by column count
 * at `lg`. tests/image-size.spec.ts checks the count the build has.
 */
const FEATURED_CARD_NARROW =
  '(min-width: 40rem) calc(100vw - 144px), calc(100vw - 96px)';

export const FEATURED_COVER_SIZES = {
  2: `(min-width: 83rem) 546px, (min-width: 64rem) calc(50vw - 118px), ${FEATURED_CARD_NARROW}`,
  3: `(min-width: 83rem) 333px, (min-width: 64rem) calc(33.33vw - 109px), ${FEATURED_CARD_NARROW}`,
} as const;
