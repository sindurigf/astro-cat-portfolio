import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { NODE } from './tags';
import { wranglerConfig } from './source';

/**
 * Workers serves `404.html` with a 404 only when the file exists and
 * `wrangler.jsonc` sets `not_found_handling`. The local server 404s regardless,
 * so the body proves the page is wired; `npm run check:live` covers production.
 */

const NOT_FOUND_HEADING = /this page is gone/i;
const WORKERS_NOT_FOUND_HANDLING = '404-page';

interface WranglerConfig {
  assets?: { not_found_handling?: string };
}

/** Random, so no future page can accidentally start answering on this path. */
const unknownPaths = (): string[] => [
  `/no-such-page-${crypto.randomUUID()}`,
  `/blog/${crypto.randomUUID()}/deeper/still`,
];

test.describe('unknown paths return 404', () => {
  test('the build emits 404.html, which is what Workers serves', NODE, () => {
    const artifact = join(DIST_DIR, '404.html');

    expect(
      existsSync(artifact),
      `${artifact} is missing, so unknown paths get no 404 page.`,
    ).toBe(true);
  });

  test('wrangler.jsonc tells Workers to serve 404.html', NODE, () => {
    expect(
      wranglerConfig<WranglerConfig>().assets?.not_found_handling,
      `wrangler.jsonc must set assets.not_found_handling to "${WORKERS_NOT_FOUND_HANDLING}".`,
    ).toBe(WORKERS_NOT_FOUND_HANDLING);
  });

  for (const [index, route] of unknownPaths().entries()) {
    const depth = index === 0 ? 'top-level' : 'nested';

    test(`a ${depth} path that does not exist returns 404 and this site's page`, async ({
      page,
    }) => {
      const response = await page.goto(route);

      expect(
        response?.status(),
        `${route} returned ${response?.status()}, not 404.`,
      ).toBe(404);

      await expect(
        page.getByRole('heading', { level: 1 }),
        `the 404 response came from the host's fallback, not dist/404.html.`,
      ).toHaveText(NOT_FOUND_HEADING);
    });
  }
});

const MISTYPED = '/blgo/how-i-get-to-know-a-new-ilsand';
const followMe = (page: import('@playwright/test').Page) =>
  page.getByRole('link', { name: /^Follow Me/ });

test.describe('the logo cat and the Cheshire Cat', () => {
  test('Follow Me leads to the page a mistyped address meant', async ({
    page,
  }) => {
    await page.goto(MISTYPED);
    await expect(followMe(page)).toHaveAccessibleName(
      'Follow Me to How I Get to Know a New Island',
    );
    await expect(followMe(page)).toHaveAttribute(
      'href',
      '/blog/how-i-get-to-know-a-new-island/',
    );
  });

  test('with no close page, Follow Me leads home', async ({ page }) => {
    await page.goto(unknownPaths()[0]!);
    await expect(followMe(page)).toHaveAccessibleName('Follow Me Home');
    await expect(followMe(page)).toHaveAttribute('href', '/');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('Follow Me leads home and Or Ask the Cat opens the sections', async ({
    page,
  }) => {
    await page.goto(MISTYPED);
    await expect(followMe(page)).toHaveAttribute('href', '/');
    const sections = page.getByRole('list', { name: 'Sections' });
    await expect(
      sections,
      'the sections show before the Cat is asked',
    ).toBeHidden();
    await page.getByText('Or Ask the Cat').click();
    await expect(sections.getByRole('link')).toHaveText([
      'About',
      'Career',
      'Blog',
      'Contact',
    ]);
  });
});
