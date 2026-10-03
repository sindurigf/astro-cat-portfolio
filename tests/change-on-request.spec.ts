import { globSync, readFileSync } from 'node:fs';
import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';

/**
 * SC 3.2.5 Change on Request: context changes only when the user asks. SC 2.2.4
 * Interruptions: nothing interrupts but the result of the user's own action.
 * The presenter view is development-only and never built, so it is not read.
 */
const PUBLISHED_SOURCE = globSync('src/**/*.{ts,vue,astro,mjs}').filter(
  (file) => !file.startsWith('src/presenter/'),
);

const IN_BUILT_HTML: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /<(?:a|form|area|base)\b[^>]*\starget=/i,
    why: 'opens a new window (SC 3.2.5)',
  },
  {
    pattern: /<meta\b[^>]*http-equiv=["']?refresh/i,
    why: 'refreshes or redirects by itself (SC 3.2.5, 2.2.4)',
  },
  {
    pattern: /role=["']alert["']/i,
    why: 'interrupts with an alert (SC 2.2.4)',
  },
  {
    pattern: /aria-live=["']assertive["']/i,
    why: 'interrupts with an assertive live region (SC 2.2.4)',
  },
];

const IN_SOURCE: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bwindow\.open\s*\(/, why: 'opens a new window (SC 3.2.5)' },
  {
    pattern:
      /\blocation(?:\.href)?\s*=[^=]|\blocation\.(?:assign|replace)\s*\(/,
    why: 'navigates by script (SC 3.2.5)',
  },
  {
    pattern:
      /['"]assertive['"]|setAttribute\(\s*['"]role['"]\s*,\s*['"]alert['"]/,
    why: 'interrupts by script (SC 2.2.4)',
  },
];

test.describe('change on request and interruptions', NODE, () => {
  test('no built page changes context or interrupts by itself', () => {
    const pages = builtHtml();
    expect(pages.size, 'no built pages to check').toBeGreaterThan(0);
    const found = [...pages].flatMap(([route, html]) =>
      IN_BUILT_HTML.filter(({ pattern }) => pattern.test(html)).map(
        ({ why }) => `${route} ${why}`,
      ),
    );
    expect(found).toEqual([]);
  });

  test('no published script changes context or interrupts by itself', () => {
    expect(PUBLISHED_SOURCE.length, 'no source files found').toBeGreaterThan(0);
    const found = PUBLISHED_SOURCE.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return IN_SOURCE.filter(({ pattern }) => pattern.test(source)).map(
        ({ why }) => `${file} ${why}`,
      );
    });
    expect(found).toEqual([]);
  });
});
