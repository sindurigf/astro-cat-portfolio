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

/** Where the site's name comes from, credited on /credits. */
export const NAME_INSPIRATION = {
  name: 'Sam Example',
  href: 'https://example.net/',
  site: 'example.net',
} as const;

/** The sample persona's source, credited on /credits and in README.md. */
export const SAMPLE_PERSONA =
  'Sample persona based on Nico Robin from One Piece by Eiichiro Oda (Shueisha). A fan tribute used as a placeholder; not affiliated with or endorsed by Eiichiro Oda, Shueisha or Toei Animation.';

export const THANKS = [
  {
    name: 'Riley Example',
    href: 'https://example.org/riley/',
    reason:
      'For the idea of the cats on the About page, and for never once asking me to tidy the library.',
  },
  {
    name: 'Kim Example',
    href: 'https://example.org/kim/',
    reason:
      'For teaching me to read a tide table, and for waiting while I read every plaque in every harbour.',
  },
  {
    name: 'Jordan Example',
    href: 'https://example.org/jordan/',
    reason:
      'For checking my translations, and for telling me kindly when I was wrong.',
  },
  {
    name: 'Casey Example',
    href: 'https://example.org/casey/',
    reason:
      'For photographs of the carvings I could not reach, and for the climb up to them.',
  },
] as const;

/** Thanked in each About cat's card for the idea, by first name; the link is their Credits entry. */
const catThanks = THANKS.find((person) => person.name === 'Riley Example');
if (!catThanks) throw new Error('No THANKS entry for "Riley Example".');
export const CAT_INSPIRATION = {
  name: catThanks.name.split(' ')[0] ?? catThanks.name,
  href: catThanks.href,
} as const;
