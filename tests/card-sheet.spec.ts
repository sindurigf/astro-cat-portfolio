import { expect, test } from './test';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, NARROW_WIDTH } from './wcag';

/* One route per grid surface: card block, blog rows, post contents, talk slides. */
const ROUTES = [
  '/',
  '/blog/',
  '/blog/open-source-is-not-just-code/',
  '/talks/open-source-is-not-just-code/',
];

const SHEETED =
  ':is(.card, .card-block > *, .plain-slab, .post-contents, .header-slab):not(.card-solid, .surface-gold, .surface-gold *)';

const sheetDisplays = (selector: string) =>
  [...document.querySelectorAll(selector)].map(
    (el) => getComputedStyle(el, '::after').display,
  );

for (const width of [NARROW_WIDTH, DESKTOP_VIEWPORT.width]) {
  for (const route of ROUTES) {
    test(`${route} at ${width}px: the sheet behind each card adds no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: DESKTOP_VIEWPORT.height });
      await gotoSettled(page, route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    });
  }
}

test.describe('forced colors', () => {
  test.use({ forcedColors: 'active' });

  for (const route of ROUTES) {
    test(`${route} draws no sheet behind cards`, async ({ page }) => {
      await gotoSettled(page, route);
      const displays = await page.evaluate(sheetDisplays, SHEETED);
      expect(displays.length, 'no grid surface on the page').toBeGreaterThan(0);
      expect(
        displays.filter((d) => d !== 'none'),
        'a sheet still shows in forced colors',
      ).toEqual([]);
    });
  }
});
