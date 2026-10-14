import { expect, test, type Locator } from './test';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, REFLOW_VIEWPORT } from './wcag';

/**
 * The photo strip's own controls (src/scripts/photo-viewer.ts): its arrows
 * report the end they are at (SC 4.1.2), and a strip that fits is not a tab
 * stop named for scrolling it cannot do (SC 2.4.3, 4.1.2).
 */
const ROUTE = '/brand';
const SCROLLS = /scrolls sideways$/;
/* More presses than the strip has photos. */
const MAX_PRESSES = 12;
/* Layout rounds to whole pixels. */
const ROUNDING_PX = 1;

const overflow = (strip: Locator): Promise<number> =>
  strip.evaluate((el) => el.scrollWidth - el.clientWidth);

test.describe('the photo strip where it overflows', () => {
  /* Reduced motion makes each press an instant scroll, so there is no animation to wait out. */
  test.use({ viewport: REFLOW_VIEWPORT, reducedMotion: 'reduce' });

  test('the right arrow is disabled once a press no longer moves the strip', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const strip = page.locator('main .photo-strip').first();
    const right = page.getByRole('button', { name: 'Scroll photos right' });
    expect(
      await overflow(strip),
      'the strip fits at this width, so it has no end to reach',
    ).toBeGreaterThan(ROUNDING_PX);

    let presses = 0;
    while ((await right.getAttribute('aria-disabled')) !== 'true') {
      expect(
        (presses += 1),
        'the right arrow never reported the end of the strip',
      ).toBeLessThanOrEqual(MAX_PRESSES);
      const before = await strip.evaluate((el) => el.scrollLeft);
      await right.click();
      await expect
        .poll(
          () => strip.evaluate((el) => el.scrollLeft),
          'the right arrow offers a scroll, yet pressing it moves nothing',
        )
        .toBeGreaterThan(before);
      /* The arrow follows the scroll event, which fires before the next frame. */
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    }
    expect(presses, 'the strip started at its end').toBeGreaterThan(0);
  });

  test('the strip is a tab stop named for scrolling', async ({ page }) => {
    await gotoSettled(page, ROUTE);
    const strip = page.locator('main .photo-strip').first();
    await expect(strip).toHaveAttribute('tabindex', '0');
    await expect(strip).toHaveAccessibleName(SCROLLS);
  });
});

test.describe('the photo strip where it fits', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test('the strip is not a tab stop and its name does not say it scrolls', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const strip = page.locator('main .photo-strip').first();
    expect(
      await overflow(strip),
      'the strip overflows at this width, so this test has nothing to say',
    ).toBeLessThanOrEqual(ROUNDING_PX);
    await expect(
      strip,
      'a strip with nothing to scroll is still a tab stop',
    ).not.toHaveAttribute('tabindex', '0');
    await expect(strip).not.toHaveAccessibleName(SCROLLS);
    await expect(strip).toHaveAccessibleName(/\S/);
  });
});
