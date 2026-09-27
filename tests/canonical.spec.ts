import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtHtml, DIST_DIR } from './routes';
import { configuredSite } from './source';
import { NODE } from './tags';
import { CONTACT_FORM_ON } from '../src/lib/contact';

const CONTACT_FORM_OFF = 'contact.form is none in src/site.config.ts';

/* Only the error page names no canonical: a canonical 404 claims the URL is a page. */
const NO_CANONICAL = new Set(['/404']);

test('every page names itself, and only itself, as canonical', NODE, () => {
  const site = configuredSite().replace(/\/$/, '');
  const wrong: string[] = [];
  let checked = 0;
  for (const [route, html] of builtHtml()) {
    const found = [
      ...html.matchAll(/<link\s[^>]*rel="canonical"[^>]*href="([^"]+)"/g),
    ].map((m) => m[1]);
    checked += 1;
    if (NO_CANONICAL.has(route)) {
      if (found.length > 0) wrong.push(`${route} names a canonical`);
      continue;
    }
    const own = `${site}${route === '/' ? '' : route}/`;
    if (found.length !== 1 || found[0] !== own) {
      wrong.push(`${route}: ${JSON.stringify(found)}, expected ${own}`);
    }
    const ogUrl = /<meta\s[^>]*property="og:url"[^>]*content="([^"]+)"/.exec(
      html,
    )?.[1];
    if (ogUrl !== own) wrong.push(`${route}: og:url ${ogUrl}, expected ${own}`);
  }
  expect(checked, 'no built pages').toBeGreaterThan(0);
  expect(wrong).toEqual([]);
});

test('every redirect in public/_redirects lands on a built file', NODE, () => {
  const targets = readFileSync('public/_redirects', 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)[1]!);
  expect(targets.length, 'no redirects read').toBeGreaterThan(0);
  expect(targets.filter((path) => !existsSync(join(DIST_DIR, path)))).toEqual(
    [],
  );
});

/* SC 1.3.5: axe checks an autocomplete value only when one is present. */
test('the contact form names its personal fields for autofill', NODE, () => {
  test.skip(!CONTACT_FORM_ON, CONTACT_FORM_OFF);
  const form = builtHtml().get('/contact') ?? '';
  for (const [field, token] of [
    ['name', 'name'],
    ['email', 'email'],
  ]) {
    expect(
      new RegExp(
        `<input\\b[^>]*name="${field}"[^>]*autocomplete="${token}"|<input\\b[^>]*autocomplete="${token}"[^>]*name="${field}"`,
      ).test(form),
      `the ${field} field has lost autocomplete="${token}"`,
    ).toBe(true);
  }
});
