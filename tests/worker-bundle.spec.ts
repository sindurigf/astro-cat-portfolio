import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { GLOBAL_CSS, cssColorToken } from './source';
import { NODE } from './tags';

/**
 * Everything BaseLayout imports ships in the Worker and is parsed at cold start;
 * a `?raw` stylesheet import changes nothing visible, so this reads the server build.
 */
const SERVER_DIR = 'dist/server';

// Three markers from different stylesheets in src/styles/, none of them prose or a class name.
const STYLESHEET_MARKERS = [
  '@theme static',
  '@custom-variant',
  'prefers-reduced-motion',
];

const serverFiles = (dir = SERVER_DIR): string[] => {
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.js')) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
};

test.describe('the Worker bundle', NODE, () => {
  test('carries no stylesheet text', () => {
    const carrying: string[] = [];
    const files = serverFiles();
    expect(
      files.length,
      'the build has no Worker bundle to read',
    ).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const marker of STYLESHEET_MARKERS) {
        if (source.includes(marker)) {
          carrying.push(`${file} contains "${marker}"`);
        }
      }
    }

    expect(
      carrying,
      `${GLOBAL_CSS} is in the Worker bundle; resolve values at build time as \`__THEME_COLOR__\` is.`,
    ).toEqual([]);
  });

  // An unapplied `define` leaves an identifier that throws on the on-demand route's first request.
  test('carries the theme colour as a literal, not an identifier', () => {
    const sources = serverFiles().map((file) => readFileSync(file, 'utf8'));
    const background = cssColorToken('--color-background');

    expect(
      sources.some((source) => source.includes(`"${background}"`)),
      `No server chunk carries ${background} from vite.define.`,
    ).toBe(true);

    expect(
      sources.filter((source) => source.includes('__THEME_COLOR__')),
      'A server chunk still names __THEME_COLOR__, so vite.define did not reach it.',
    ).toEqual([]);
  });
});
