import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { builtHtml, builtPages } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/**
 * SC 3.1.4 Abbreviations, by G102: on functional pages each abbreviation's
 * first use in `<main>` carries its expansion or a definition in the same
 * sentence. Posts, About and Career are the owner's copy and are not listed.
 */
const FIRST_USES: readonly {
  route: string;
  abbreviation: string;
  expansion: string;
}[] = [
  {
    route: '/accessibility',
    abbreviation: 'WCAG',
    expansion: 'Web Content Accessibility Guidelines',
  },
  {
    route: '/accessibility',
    abbreviation: 'AA',
    expansion: 'the middle of three levels',
  },
  { route: '/accessibility', abbreviation: 'AAA', expansion: 'the highest' },
  {
    route: '/accessibility',
    abbreviation: 'W3C',
    expansion: 'World Wide Web Consortium',
  },
  {
    route: '/accessibility',
    abbreviation: 'PDF',
    expansion: 'Portable Document Format',
  },
  {
    route: '/brand',
    abbreviation: 'WCAG',
    expansion: 'Web Content Accessibility Guidelines',
  },
  {
    route: '/brand',
    abbreviation: 'AA',
    expansion: 'the middle of three levels',
  },
  { route: '/brand', abbreviation: 'AAA', expansion: 'the highest' },
  {
    route: '/brand',
    abbreviation: 'CSS',
    expansion: 'Cascading Style Sheets',
  },
  {
    route: '/brand',
    abbreviation: 'CC BY',
    expansion: 'Creative Commons Attribution',
  },
  {
    route: '/brand',
    abbreviation: 'CC0',
    expansion: 'Creative Commons Zero',
  },
  {
    route: '/credits',
    abbreviation: 'SEO',
    expansion: 'search engine optimisation',
  },
  { route: '/privacy', abbreviation: 'IP', expansion: 'internet address' },
  { route: '/privacy', abbreviation: 'ID', expansion: 'identifier' },
  {
    route: '/privacy',
    abbreviation: 'IPv6',
    expansion: 'Internet Protocol version 6',
  },
  {
    route: '/privacy',
    abbreviation: 'IPv4',
    expansion: 'Internet Protocol version 4',
  },
  {
    route: '/privacy',
    abbreviation: 'SHA-256',
    expansion: 'Secure Hash Algorithm',
  },
];

/** Functional pages: their copy is written by whoever builds the UI (AGENTS.md "Copy"). */
const FUNCTIONAL_ROUTES = [
  '/accessibility',
  '/brand',
  '/credits',
  '/privacy',
  '/contact',
  '/contact/sent',
  '/404',
] as const;

/** Names that are written in capitals, not abbreviations a reader must expand. */
const NAMES = [
  'Tailwind CSS',
  'Cloudflare D1',
  'R2-D2',
  'Episode IV',
  'SIL Open Font License',
  'MIT',
  'ACCESSIBILITY.md',
  'LICENSE-photos',
];

const ABBREVIATION = /\bCC BY\b|\bIPv[46]\b|\b[A-Z][A-Z0-9]+(?:-\d+)?\b/g;
const HEX_COLOUR = /^[0-9A-F]{6}$/;

const ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  quot: '"',
  lt: '<',
  gt: '>',
};

/** `<main>` text of built HTML in source case, so CSS upper-casing is not read as an abbreviation. */
const mainText = (html: string): string =>
  (/<main\b[\s\S]*?<\/main>/.exec(html)?.[0] ?? '')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, body: string) =>
      body.startsWith('#x')
        ? String.fromCodePoint(parseInt(body.slice(2), 16))
        : body.startsWith('#')
          ? String.fromCodePoint(Number(body.slice(1)))
          : (ENTITIES[body] ?? entity),
    );

/** Abbreviations replaced by the word itself wherever they would appear. */
const SPELLED_OUT: readonly { pattern: RegExp; word: string }[] = [
  { pattern: /\d+\s+min read/, word: 'minute' },
];

/** The sentence holding the first visible use in `<main>`, or null when there is none. */
const firstUseSentence = (
  page: Page,
  abbreviation: string,
): Promise<string | null> =>
  page.evaluate((abbr) => {
    const escaped = abbr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const use = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`);
    const main = document.querySelector('main');
    if (!main) throw new Error('the page has no <main>.');

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !use.test(node.textContent ?? '')) continue;
      if (!parent.checkVisibility({ visibilityProperty: true })) continue;

      let block: Element = parent;
      while (
        block !== main &&
        block.parentElement &&
        getComputedStyle(block).display === 'inline'
      ) {
        block = block.parentElement;
      }

      const text = (block.textContent ?? '').replace(/\s+/g, ' ').trim();
      const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(])/);
      return sentences.find((sentence) => use.test(sentence)) ?? text;
    }
    return null;
  }, abbreviation);

test.describe('abbreviations are expanded at first use (SC 3.1.4)', () => {
  const routes = [...new Set(FIRST_USES.map((entry) => entry.route))];

  for (const route of routes) {
    test(`${route} expands each abbreviation where it first appears`, async ({
      page,
    }) => {
      await gotoSettled(page, route);

      for (const { abbreviation, expansion } of FIRST_USES.filter(
        (entry) => entry.route === route,
      )) {
        const sentence = await firstUseSentence(page, abbreviation);
        expect(
          sentence,
          `${abbreviation} no longer appears in ${route}'s <main>; remove its entry.`,
        ).not.toBeNull();
        expect(
          sentence!.toLowerCase(),
          `${route} first uses ${abbreviation} without "${expansion}" in the same sentence: ${sentence}`,
        ).toContain(expansion.toLowerCase());
      }
    });
  }
});

test('no built page abbreviates what it can spell out', NODE, () => {
  const offenders = builtPages().flatMap(({ route, file }) => {
    const html = readFileSync(file, 'utf8');
    return SPELLED_OUT.filter(({ pattern }) => pattern.test(html)).map(
      ({ pattern, word }) => `${route}: ${pattern.source}, write "${word}"`,
    );
  });
  expect(offenders, 'abbreviations left in the build').toEqual([]);
});

test('functional pages use no abbreviation outside FIRST_USES', NODE, () => {
  const pages = builtHtml();
  const unlisted = FUNCTIONAL_ROUTES.flatMap((route) => {
    const html = pages.get(route);
    if (html === undefined) return [`${route} was not built`];
    const listed = new Set(
      FIRST_USES.filter((entry) => entry.route === route).map(
        (entry) => entry.abbreviation,
      ),
    );
    const text = NAMES.reduce(
      (rest, name) => rest.replaceAll(name, ' '),
      mainText(html),
    );
    return [...new Set(text.match(ABBREVIATION) ?? [])]
      .filter((token) => !HEX_COLOUR.test(token) && !listed.has(token))
      .map((token) => `${route}: ${token}`);
  });
  expect(
    unlisted,
    'expand each at its first use and list it in FIRST_USES, or add a name to NAMES',
  ).toEqual([]);
});
