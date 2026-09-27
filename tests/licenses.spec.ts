import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { licenceText, packageDirOf } from '../scripts/licenses.mjs';
import { NODE } from './tags';

/**
 * The build fails on a missing licence; this guards the collector going quiet
 * when an Astro or Vite release renames an environment or chunk field.
 * SHIPPED names one package per source the collector reads.
 */

const LICENCES = join(DIST_DIR, 'licenses.txt');

const SHIPPED = [
  '@vue/runtime-core', // a client chunk
  '@fontsource-variable/lexend', // a prerender asset
  'tailwindcss', // a banner in the shipped CSS
  'astro', // the island script inlined into a page
  '/vendor/umami.js', // public/vendor/
];

test.describe('/licenses.txt', () => {
  test('is served as plain text', NODE, async ({ request }) => {
    const response = await request.get('/licenses.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^text\/plain/);
  });

  test('names a package from every source the collector reads', NODE, () => {
    const headings = readFileSync(LICENCES, 'utf8')
      .split('\n\n\n')
      .map((entry) => entry.split('\n')[0]);
    for (const name of SHIPPED) {
      expect(
        headings.some((line) => line === name || line.startsWith(`${name} `)),
        `${name} is missing from licenses.txt`,
      ).toBe(true);
    }
  });

  test('is linked from /credits', async ({ page }) => {
    await page.goto('/credits/');
    await expect(
      page.getByRole('link', { name: 'the licences file' }),
    ).toHaveAttribute('href', '/licenses.txt');
  });
});

test.describe('the licence reader', () => {
  test('finds a package directory, scoped or nested', NODE, () => {
    expect(packageDirOf('/w/node_modules/@vue/shared/dist/x.js')).toBe(
      '/w/node_modules/@vue/shared',
    );
    expect(packageDirOf('/w/node_modules/a/node_modules/b/index.js')).toBe(
      '/w/node_modules/a/node_modules/b',
    );
    expect(packageDirOf('/w/src/components/Hero.vue')).toBeUndefined();
  });

  test('returns no text for a package without a licence file', NODE, () => {
    const dir = mkdtempSync(join(tmpdir(), 'licence-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"license":"MIT"}');
      expect(licenceText(dir)).toBeNull();
      writeFileSync(join(dir, 'LICENSE'), 'MIT text');
      writeFileSync(join(dir, 'NOTICE'), 'notice text');
      expect(licenceText(dir)).toBe('MIT text\n\nnotice text');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
