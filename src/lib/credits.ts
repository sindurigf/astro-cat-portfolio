/** The /credits card that links LICENSE-photos, which names the sample photos' photographer. */
export const PHOTO_CREDITS_PATH = '/credits/#photos';

/**
 * Keyed by the name as written after "Photo: "; an unlisted name stays plain
 * text. Link each to the photographer's own site where there is one. No import:
 * src/plugins/post-figure.mjs loads this file in Node.
 */
// TODO(fork): List the photographers of your photos, each with a link.
export const PHOTOGRAPHERS = {
  'License and Credit': PHOTO_CREDITS_PATH,
} as const satisfies Readonly<Record<string, string>>;

export type Photographer = keyof typeof PHOTOGRAPHERS;

/* Throws too: `astro build` does not typecheck, and a stale name renders no href. */
export const photographerHref = (name: Photographer): string => {
  const href: string | undefined = PHOTOGRAPHERS[name];
  if (!href) throw new Error(`No PHOTOGRAPHERS entry for "${name}".`);
  return href;
};

export const PHOTO_CREDIT_PREFIX = 'Photo: ';

/* Keyed by the name as written after "Screenshot: "; a placeholder to replace or empty. */
// TODO(fork): List where your screenshots come from, or leave this empty.
export const SCREENSHOT_SOURCES = {
  'Example Project': 'https://example.org/',
} as const satisfies Readonly<Record<string, string>>;

export const SCREENSHOT_CREDIT_PREFIX = 'Screenshot: ';

export interface LicensedPhoto {
  photographer: string;
  /** The photo's title where it is published. */
  title: string;
  source: string;
  /** Where `source` is, e.g. Flickr or Wikimedia Commons. */
  sourceName: string;
  /** Spelled out, e.g. "Creative Commons Attribution 4.0" (SC 3.1.4). */
  license: string;
  /** What captions show, e.g. "CC BY 4.0", linked to the deed that names it in full. */
  licenseShort: string;
  licenseHref: string;
  /** What was changed, as the license asks, e.g. "cropped and resized". */
  changes: string;
}

/**
 * Photos used under a Creative Commons license, keyed by file name without its
 * extension. A caption links the photographer to `source` and adds the short
 * license; /credits gives the title, source, license and changes.
 */
export const LICENSED_PHOTOS: Readonly<Record<string, LicensedPhoto>> = {};
