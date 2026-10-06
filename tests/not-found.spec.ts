import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';
import { wranglerConfig } from './source';

/**
 * Workers serves `404.html` with a 404 only when the file exists and
 * `wrangler.jsonc` sets `not_found_handling`. The local server 404s regardless,
 * so the body proves the page is wired; `npm run check:live` covers production.
 */

const NOT_FOUND_HEADING = /these are not the droids you are looking for/i;
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

/** Phone, the last width below `lg`, and desktop. */
const STARFIELD_WIDTHS = [320, 1023, 1280] as const;

for (const width of STARFIELD_WIDTHS) {
  test.describe(`the 404 starfield at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('is hidden from assistive technology and shows no star behind text', async ({
      page,
    }) => {
      await gotoSettled(page, '/404');
      const stars = page.locator('main .plain-slab-stars');
      await expect(stars).toHaveAttribute('aria-hidden', 'true');

      const exposed = await stars.evaluate((layer) => {
        const slab = layer.closest('.plain-slab');
        const ground = slab ? getComputedStyle(slab).backgroundColor : '';
        const clears = [...(slab?.querySelectorAll('.star-clear') ?? [])];
        const unclear = [...(slab?.querySelectorAll('p, h1') ?? [])].filter(
          (text) => !clears.some((clear) => text.contains(clear)),
        );
        const uncovered = clears.filter((clear) => {
          const box = clear.getBoundingClientRect();
          const top = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          );
          return (
            getComputedStyle(clear).backgroundColor !== ground ||
            !top ||
            !clear.contains(top)
          );
        });
        return {
          measured: clears.length,
          failures: [...unclear, ...uncovered].map((element) =>
            element.textContent?.trim().slice(0, 40),
          ),
        };
      });
      expect(
        exposed.measured,
        'no .star-clear text in the slab',
      ).toBeGreaterThan(0);
      expect(
        exposed.failures,
        'slab text without the slab ground above the stars',
      ).toEqual([]);
    });
  });
}
