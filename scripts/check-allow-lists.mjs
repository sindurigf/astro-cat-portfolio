/* Allow-lists the check scripts and their self-tests share. */

/* False positives, each with its reason; an entry that no longer matches fails. */
export const TOKEN_EXCEPTIONS = [
  {
    file: 'src/lib/brand.ts',
    text: 'light-[a-z-]',
    reason: 'a regex character class naming light-mode tokens, not a class',
  },
];

/*
 * Classes that exist only for a test or script to select. An entry that no
 * longer matches fails.
 */
export const CLASS_HOOKS = new Map();

/*
 * Each entry names what reads the original. An entry that no longer matches
 * fails.
 */
export const SERVED_AS_IS = new Map([
  ...['minerva', 'rudra', 'hela'].map((cat) => [
    `about-cats-${cat}.avif`,
    'the About cats draw their frames from it with SVG <image>; it is an AVIF atlas already.',
  ]),
  [
    'box-cat-logo.svg',
    'Header.astro and 404.astro import it with `?url`: one file with its picture inside, cached once for every page.',
  ],
  [
    'box-cat-roundel.svg',
    'Roundel.astro imports it with `?url`: one file with its picture inside, cached once for every page.',
  ],
  [
    'box-cat-footer.svg',
    'Footer.astro imports it with `?url`: one file with its picture inside, cached once for every page.',
  ],
  [
    'logo-cat.svg',
    'CatMark.astro imports it with `?url`: a vector file, cached once for every page.',
  ],
  [
    'social-icons.svg',
    'the footer imports it with `?url` and every page links it as a <use> sprite.',
  ],
]);

/*
 * Each entry names why the text stays as written. An entry that no longer
 * matches fails.
 */
export const TITLE_CASE_ALLOWED = [];
