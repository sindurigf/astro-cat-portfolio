/** The /credits card that links LICENSE-photos, which names the sample photos' photographer. */
export const PHOTO_CREDITS_PATH = '/credits/#photos';

/**
 * Keyed by the name as written after "Photo: "; an unlisted name stays plain
 * text. Link each to the photographer's own site where there is one. No import:
 * src/plugins/post-figure.mjs loads this file in Node.
 */
export const PHOTOGRAPHERS = {
  'Licence and credit': PHOTO_CREDITS_PATH,
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
  licence: string;
  licenceHref: string;
  /** What was changed, as the licence asks, e.g. "cropped and resized". */
  changes: string;
}

/**
 * Photos used under a Creative Commons licence, keyed by file name without its
 * extension: the caption and /credits link the source and licence and say what changed.
 */
export const LICENSED_PHOTOS: Readonly<Record<string, LicensedPhoto>> = {};

/** Where the site's name comes from, credited on /credits. */
export const NAME_INSPIRATION = {
  name: 'Sam Example',
  href: 'https://example.net/',
  site: 'example.net',
} as const;

export const THANKS = [
  {
    name: 'Riley Example',
    href: 'https://example.org/riley/',
    reason: 'For the idea of the cats on the About page.',
  },
  {
    name: 'Clou D. Clover',
    href: 'https://onepiece.fandom.com/wiki/Clou_D._Clover',
    reason:
      'Director of the Library of Ohara, who let a child read in the Tree of Knowledge.',
  },
  {
    name: 'Nico Olvia',
    href: 'https://onepiece.fandom.com/wiki/Nico_Olvia',
    reason:
      'My mother, an archaeologist who went looking for the Poneglyphs before I could.',
  },
  {
    name: 'Jaguar D. Saul',
    href: 'https://onepiece.fandom.com/wiki/Jaguar_D._Saul',
    reason: 'For protecting me on Ohara, when nobody else would.',
  },
] as const;

/** Thanked in each About cat's card for the idea, by first name; the link is their Credits entry. */
const catThanks = THANKS.find((person) => person.name === 'Riley Example');
if (!catThanks) throw new Error('No THANKS entry for "Riley Example".');
export const CAT_INSPIRATION = {
  name: catThanks.name.split(' ')[0] ?? catThanks.name,
  href: catThanks.href,
} as const;
