import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';

/*
 * Only measures that are machine-independent: load time depends on the runner,
 * so it is checked with Lighthouse on the live site (docs/DEPLOYMENT.md).
 */

/* Decoded script bytes. Only these routes carry Vue and an island. */
const ISLAND_SCRIPT_BUDGETS: Readonly<Record<string, number>> = {
  '/': 96_000,
  '/about': 120_000,
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

const LAYOUT_SHIFT = `
  window.__layoutShift = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__layoutShift += entry.value;
    }
  }).observe({ type: 'layout-shift', buffered: true });
`;

test.describe('page weight and stability', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only, and script bytes do not vary by engine',
  );

  for (const route of ROUTES) {
    test(`${route} stays within its script budget`, async ({ page }) => {
      const scripts = await scriptsFetched(page, route);
      const total = scripts.reduce((sum, script) => sum + script.bytes, 0);
      const budget = ISLAND_SCRIPT_BUDGETS[route] ?? PAGE_SCRIPT_BUDGET;

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

      const shift = await page.evaluate(
        () => (window as unknown as { __layoutShift: number }).__layoutShift,
      );
      expect(shift, `${route} shifted its layout while loading`).toBe(0);
    });
  }
});
