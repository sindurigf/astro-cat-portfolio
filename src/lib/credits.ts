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
  /** The license asks for the title, as CC BY 2.0 §4(b) does; 4.0 licenses do not. */
  titleInCaption: boolean;
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
 * extension. A caption is `licensedCaption`; /credits gives the title, source,
 * license and changes.
 */
export const LICENSED_PHOTOS: Readonly<Record<string, LicensedPhoto>> = {};

export type CaptionPart =
  string | { readonly text: string; readonly href: string };

/**
 * The credit after "Photo: ". With `titleInCaption`: the title linked to
 * `source`, "by", the name linked to the photographer's site; else the name
 * linked to `source`. Then the short license, linked to its deed.
 */
export const licensedCaption = ({
  photographer,
  title,
  titleInCaption,
  source,
  licenseShort,
  licenseHref,
}: LicensedPhoto): readonly CaptionPart[] => [
  ...(titleInCaption
    ? [
        { text: title, href: source },
        ' by ',
        {
          text: photographer,
          href: photographerHref(photographer as Photographer),
        },
      ]
    : [{ text: photographer, href: source }]),
  ' (',
  { text: licenseShort, href: licenseHref },
  ')',
];
