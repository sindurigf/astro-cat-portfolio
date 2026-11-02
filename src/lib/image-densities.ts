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

/* Every post card crops its cover to this frame, whatever the cover's own shape. */
export const CARD_COVER_RATIO = { width: 4, height: 3 } as const;

/*
 * A post card cover's drawn width. Stacked cards by column count at `lg`
 * (homepage Featured Posts, the /blog list); a wide card holds it in its
 * right half from `md`. tests/image-size.spec.ts fails when one drifts.
 */
const CARD_NARROW =
  '(min-width: 40rem) calc(100vw - 144px), calc(100vw - 96px)';

export const CARD_COVER_SIZES = {
  2: `(min-width: 83rem) 546px, (min-width: 64rem) calc(50vw - 118px), ${CARD_NARROW}`,
  3: `(min-width: 83rem) 333px, (min-width: 64rem) calc(33.33vw - 109px), ${CARD_NARROW}`,
  wide: '(min-width: 48rem) min(calc(50vw - 5.5rem), 36rem), (min-width: 40rem) calc(100vw - 9rem), calc(100vw - 6rem)',
} as const;

/*
 * The post card on /brand, in the brand page's own columns: its content
 * column splits at 51rem and again past the menu at 1143px.
 */
export const BRAND_CARD_COVER_SIZES =
  '(min-width: 83rem) 332px, (min-width: 1143px) calc(50vw - 331px), (min-width: 64rem) calc(96.62vw - 480px), (min-width: 51rem) calc(50vw - 168px), (min-width: 40rem) calc(100vw - 192px), calc(100vw - 144px)';
