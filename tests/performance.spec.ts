import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';
import { LAYOUT_SHIFT, layoutShiftOf } from './layout-shift';

/*
 * Only measures that are machine-independent: load time depends on the runner,
 * so it is checked with Lighthouse on the live site (docs/DEPLOYMENT.md).
 */

/* Decoded script bytes. `/` and `/about` carry Vue; `/brand` every component's script. */
const ROUTE_SCRIPT_BUDGETS: Readonly<Record<string, number>> = {
  '/': 96_000,
  '/about': 120_000,
  '/brand': 7_400,
};
const PAGE_SCRIPT_BUDGET = 14_000;

const scriptsFetched = async (
  page: Page,
  route: string,
): Promise<readonly { readonly file: string; readonly bytes: number }[]> => {
  const pending: Promise<{ file: string; bytes: number }>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return;
    pending.push(
      response.body().then((body) => ({
        file: new URL(response.url()).pathname,
        bytes: body.length,
      })),
    );
  });
  await gotoSettled(page, route);
  return Promise.all(pending);
};

test.describe('page weight and stability', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only, and script bytes do not vary by engine',
  );

  for (const route of ROUTES) {
    test(`${route} stays within its script budget`, async ({ page }) => {
      const scripts = await scriptsFetched(page, route);
      const total = scripts.reduce((sum, script) => sum + script.bytes, 0);
      const budget = ROUTE_SCRIPT_BUDGETS[route] ?? PAGE_SCRIPT_BUDGET;

      expect(
        total,
        `${route} fetched ${total} bytes of script against a budget of ${budget}:\n` +
          scripts.map((s) => `  ${s.file} ${s.bytes}`).join('\n'),
      ).toBeLessThanOrEqual(budget);
    });

    /* Zero, not Lighthouse's 0.1: every route measures 0. */
    test(`${route} does not shift while it loads`, async ({ page }) => {
      await page.addInitScript(LAYOUT_SHIFT);
      await gotoSettled(page, route);
      /* Chromium measures a shift between painted frames; headless can settle before its first paint. */
      await page.waitForFunction(
        () => performance.getEntriesByName('first-contentful-paint').length > 0,
      );

      const { shift, sources } = await layoutShiftOf(page);
      expect(
        shift,
        `${route} shifted its layout while loading (value, element, x,y,w,h before -> after):\n${sources.join('\n')}`,
      ).toBe(0);
    });
  }
});
