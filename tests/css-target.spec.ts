import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { NODE } from './tags';

/**
 * The built CSS carries the prefixes `CSS_TARGET` (Safari 16.4) requires.
 * Playwright's WebKit needs none, so no browser test would notice.
 */
const CSS_DIR = join(DIST_DIR, '_astro');

/** esbuild's target name for each browser ARCHITECTURE.md names. */
const ESBUILD_NAMES: Record<string, string> = {
  Chrome: 'chrome',
  Edge: 'edge',
  Firefox: 'firefox',
  Safari: 'safari',
  'iOS Safari': 'ios',
};

/** The browser list opening ARCHITECTURE.md > Browser support, as esbuild targets. */
const statedBrowsers = (): string[] => {
  const doc = readFileSync('ARCHITECTURE.md', 'utf8');
  const line = /^## Browser support\n\n([^(]+)\(/m.exec(doc)?.[1] ?? '';
  return line.split(',').map((entry) => {
    const text = entry.replace(/\s+/g, ' ').trim();
    const [, name = '', version] = /^(.+) ([\d.]+)$/.exec(text) ?? [];
    const target = ESBUILD_NAMES[name];
    if (!target || !version) {
      throw new Error(
        `ARCHITECTURE.md lists "${text}", which maps to no esbuild target.`,
      );
    }
    return `${target}${version}`;
  });
};

/**
 * Only pairs where 16.4 predates the unprefixed version. Matched with the value:
 * `-webkit-hyphens:none` also appears in a Tailwind `@supports` probe.
 */
const PAIRS = [
  /* Unprefixed `hyphens` is Safari 17. Headings and `.prose table` use it. */
  { bare: 'hyphens:auto', prefixed: '-webkit-hyphens:auto' },
  /* Unprefixed `text-decoration` shorthand with a style is Safari 18. */
  {
    bare: 'text-decoration:underline dotted',
    prefixed: '-webkit-text-decoration:underline dotted',
  },
] as const;

const stylesheets = (): { name: string; css: string }[] =>
  readdirSync(CSS_DIR)
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({
      name,
      css: readFileSync(join(CSS_DIR, name), 'utf8'),
    }));

const occurrences = (css: string, needle: string): number =>
  css.split(needle).length - 1;

/* A prefixed declaration contains the bare one, so subtract. */
const bareCount = (css: string, pair: (typeof PAIRS)[number]): number =>
  occurrences(css, pair.bare) - occurrences(css, pair.prefixed);

test.describe('the pinned CSS target', NODE, () => {
  test('every stylesheet was built', () => {
    expect(
      stylesheets().length,
      `no .css in ${CSS_DIR}, so every assertion below would pass vacuously.`,
    ).toBeGreaterThan(0);
  });

  for (const pair of PAIRS) {
    test(`${pair.bare} keeps its ${pair.prefixed} twin`, () => {
      const unpaired: string[] = [];

      for (const { name, css } of stylesheets()) {
        const bare = bareCount(css, pair);
        const prefixed = occurrences(css, pair.prefixed);

        if (bare !== prefixed) {
          unpaired.push(`${name}: ${bare} bare, ${prefixed} prefixed`);
        }
      }

      expect(
        unpaired,
        `${pair.prefixed} does not pair with ${pair.bare}; the build stopped honoring CSS_TARGET.`,
      ).toEqual([]);
    });
  }

  /* Raising the floor is an edit to astro.config.mjs and ARCHITECTURE.md together. */
  test('the floor is the one ARCHITECTURE.md states', () => {
    const config = readFileSync('astro.config.mjs', 'utf8');
    const listed = /const CSS_TARGET = \[([\s\S]*?)\]/.exec(config)?.[1] ?? '';
    const targets = [...listed.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();

    expect(
      targets,
      'CSS_TARGET drifted from ARCHITECTURE.md > Browser support.',
    ).toEqual(statedBrowsers().sort());
  });
});
