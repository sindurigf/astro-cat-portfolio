/**
 * Keyed by the name as written after "Photo: "; an unlisted name stays plain
 * text. Link each to the photographer's own site where there is one.
 */
export const PHOTOGRAPHERS = {
  'Alex Example': 'https://example.org/',
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

export const THANKS = [
  {
    name: 'Robin Example',
    href: 'https://example.org/robin/',
    reason:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua!',
  },
  {
    name: 'Kim Example',
    href: 'https://example.org/kim/',
    reason:
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. Nisi ut aliquip ex ea commodo consequat!',
  },
  {
    name: 'Jordan Example',
    href: 'https://example.org/jordan/',
    reason:
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore. Eu fugiat nulla pariatur excepteur sint occaecat.',
  },
  {
    name: 'Casey Example',
    href: 'https://example.org/casey/',
    reason:
      'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium totam rem aperiam.',
  },
] as const;
