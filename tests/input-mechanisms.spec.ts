import { globSync, readFileSync } from 'node:fs';
import { expect, test } from './test';
import { NODE } from './tags';

/**
 * SC 2.5.6 Concurrent Input Mechanisms: no input is turned off because another
 * one was detected. `@media (hover: hover)` from Tailwind's `hover:` only adds
 * hover where it exists, so it is not matched.
 */
const SOURCE = globSync('src/**/*.{css,ts,vue,astro,mjs}');

const RESTRICTIONS: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\(\s*(?:any-)?pointer\s*:/, what: 'a pointer media query' },
  {
    pattern: /\(\s*any-hover\s*:|\(\s*hover\s*:\s*none/,
    what: 'a hover media query',
  },
  { pattern: /\bpointerType\b/, what: 'a branch on pointer type' },
  { pattern: /touch-action\s*:\s*none/, what: 'touch input turned off' },
  {
    pattern: /\bontouchstart\b|matchMedia\([^)]*pointer/,
    what: 'touch detection',
  },
];

test(
  'no source restricts one input mechanism by detecting another',
  NODE,
  () => {
    expect(SOURCE.length, 'no source files found').toBeGreaterThan(0);
    const found = SOURCE.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return RESTRICTIONS.filter(({ pattern }) => pattern.test(source)).map(
        ({ what }) => `${file}: ${what}`,
      );
    });
    expect(found, 'review whether these keep every input working').toEqual([]);
  },
);
