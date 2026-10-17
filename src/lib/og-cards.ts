/*
 * Per-page sharing cards: drawn by scripts/make-og.mjs from the built pages,
 * read by BaseLayout. No Astro imports, so the Node script can load this file.
 */

/** Under public/, so the build copies the cards as they are. */
export const OG_CARD_DIR = 'images/og';
export const OG_CARD_MANIFEST = `${OG_CARD_DIR}/cards.json`;

/** Routes that keep the site card, `og-default.png`, instead of a card of their own. */
export const SITE_CARD_ROUTES: readonly string[] = ['/'];

/** A photo under src/assets/ and its alt text, for a card whose page shows it elsewhere or not at all. */
export interface OgPhotoChoice {
  photo: string;
  alt: string;
}

/**
 * Routes whose card does not show the page's first photo: `null` keeps the
 * logo cat, an `OgPhotoChoice` names another photo. Keyed like `ogRoute`.
 */
export const OG_PHOTO_CHOICES: Readonly<Record<string, OgPhotoChoice | null>> =
  {
    /* /brand and its subpages share the logo card; /brand/photos shows sample photos, not its subject. */
    '/brand/photos': null,
  };

export interface OgCard {
  title: string;
  /** The built photo URL, hash included, so a new photo shows as stale; null for the logo cat. */
  photo: string | null;
  alt: string;
}

export type OgCardManifest = Record<string, OgCard>;

export interface FirstPhoto {
  src: string;
  alt: string;
}

const MAIN = /<main\b[\s\S]*?<\/main>/;
const IMG = /<img\b[^>]*>/g;
/* The logo cat and its one-color roundel form are the logo, never a page's photo. */
const LOGO_ART = /\/(?:logo-cat|mark-dark)\./;

/** The entities Astro writes into attributes, decoded. */
export const decodeEntities = (text: string): string =>
  text
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

const attribute = (tag: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** The largest `srcset` candidate, else `src`: the card is drawn from the sharpest copy. */
const largest = (tag: string): string | null => {
  const candidates = (attribute(tag, 'srcset') ?? '')
    .split(',')
    .map((entry) => entry.trim().split(/\s+/))
    .filter(([url, width]) => url && width?.endsWith('w'))
    .map(([url, width]) => ({ url: url!, width: parseInt(width!, 10) }))
    .sort((a, b) => b.width - a.width);
  return candidates[0]?.url ?? attribute(tag, 'src');
};

/** The first photo in a built page's `<main>`: an `<img>` with alt text that is not logo art. */
export const firstPhoto = (html: string): FirstPhoto | null => {
  const main = MAIN.exec(html)?.[0] ?? '';
  for (const [tag] of main.matchAll(IMG)) {
    const alt = attribute(tag, 'alt');
    const src = largest(tag);
    if (!alt || !src || LOGO_ART.test(src)) continue;
    return { src, alt: decodeEntities(alt) };
  }
  return null;
};

/** The photo a route's card shows: the choice's file, else the page's first photo, else null. */
export const cardPhoto = (route: string, html: string): FirstPhoto | null => {
  if (Object.hasOwn(OG_PHOTO_CHOICES, route)) {
    const choice = OG_PHOTO_CHOICES[route];
    return choice ? { src: choice.photo, alt: choice.alt } : null;
  }
  return firstPhoto(html);
};

/** `/blog/tag/archaeology` → `images/og/blog--tag--archaeology.jpg`. */
export const ogCardPath = (route: string): string =>
  `${OG_CARD_DIR}/${route.replace(/^\/|\/$/g, '').replaceAll('/', '--')}.jpg`;

/** Route as the manifest keys it: no trailing slash, `/` for the homepage. */
export const ogRoute = (pathname: string): string =>
  pathname === '/' ? '/' : pathname.replace(/\/(?:index\.html)?$/, '');
