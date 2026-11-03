import { expect, test } from './test';
import { gotoSettled } from './settle';

/* The hero canvases follow forced colors switched on and off, a media change that resizes nothing. */
const HERO_ROUTE = '/';
const VIEWPORT = { width: 1280, height: 720 } as const;

test.describe('the hero after a media change', () => {
  test.use({ viewport: VIEWPORT, reducedMotion: 'reduce' });

  test('is hidden in forced colors and shown again after them', async ({
    page,
  }) => {
    await gotoSettled(page, HERO_ROUTE);
    const field = page.locator('.hero-field');

    await page.emulateMedia({ forcedColors: 'active' });
    await expect(field, 'a canvas cannot follow forced colors').toBeHidden();

    await page.emulateMedia({ forcedColors: 'none' });
    await expect(field).toBeVisible();
  });
});
