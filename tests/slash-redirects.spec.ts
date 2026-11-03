import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './test';
import { fixture, type Files } from './check-fixture';
import {
  MAX_STATIC_REDIRECTS,
  slashRedirectLines,
  slashRedirects,
} from '../scripts/slash-redirects.mjs';
import { NODE } from './tags';

const REDIRECTS = '_redirects';
const quietLogger = { info: () => {} };

const buildDone = (root: string) =>
  slashRedirects().hooks['astro:build:done']({
    dir: pathToFileURL(`${root}/`),
    logger: quietLogger,
  });

const existingRules = (count: number): string =>
  Array.from({ length: count }, (_, i) => `/old-${i} /new-${i} 301`).join('\n');

/* One page besides the home page, so the hook adds one redirect. */
const PAGE_REDIRECTS = 1;

const site = (ruleCount: number): Files => ({
  [REDIRECTS]: `# Hand-written rules.\n\n${existingRules(ruleCount)}\n\n# End.\n`,
  'index.html': '',
  'about/index.html': '',
});

test.describe('slash redirects', NODE, () => {
  test('maps a page to a 301 from its unslashed path and skips the home page', () => {
    expect(slashRedirectLines(['about/index.html', 'index.html'])).toEqual([
      '/about /about/ 301',
    ]);
  });

  test('appends one redirect per page and keeps the hand-written rules', () => {
    const root = fixture(site(1));
    buildDone(root);
    const redirects = readFileSync(join(root, REDIRECTS), 'utf8');
    expect(redirects).toContain(existingRules(1));
    expect(redirects).toContain('/about /about/ 301');
  });

  test('allows exactly the Workers limit, not counting comments or blank lines', () => {
    const root = fixture(site(MAX_STATIC_REDIRECTS - PAGE_REDIRECTS));
    expect(() => buildDone(root)).not.toThrow();
  });

  test('throws when the redirects would pass the Workers limit', () => {
    const root = fixture(site(MAX_STATIC_REDIRECTS - PAGE_REDIRECTS + 1));
    expect(() => buildDone(root)).toThrow(String(MAX_STATIC_REDIRECTS));
  });
});
