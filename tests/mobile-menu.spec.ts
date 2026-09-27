import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { REFLOW_VIEWPORT } from './wcag';
import { CTA, NAV_LINKS } from '../src/lib/nav';

/** Every destination the open menu must offer: the nav, then the call to action. */
const MENU_HREFS = [...NAV_LINKS.map((link) => link.href), CTA.href];

/**
 * At the SC 1.4.10 reflow width a desktop user magnifying the page lands here,
 * so the mobile menu is their only navigation. It has to open, take focus, and
 * give focus back on Escape.
 */
test.describe('mobile menu at 320px', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  test('opens, takes focus, and closes on Escape', async ({ page }) => {
    await gotoSettled(page, '/');

    const trigger = page.getByRole('button', { name: /menu/i });
    await expect(
      trigger,
      'the menu trigger should be visible at 320px',
    ).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();

    const panel = page.getByRole('dialog');
    await expect(panel, 'the panel should open').toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Focus must land inside the panel, not be left behind on the page.
    await expect
      .poll(() => panel.evaluate((el) => el.contains(document.activeElement)), {
        message: 'focus should move into the open panel',
      })
      .toBe(true);

    // Every nav destination has to be reachable from here.
    await expect(panel.getByRole('link')).toHaveCount(MENU_HREFS.length);

    await page.keyboard.press('Escape');

    await expect(panel, 'Escape should close the panel').toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger, 'focus should return to the trigger').toBeFocused();
  });

  test('its Close button closes it, returns focus and unlocks page scroll', async ({
    page,
  }) => {
    await gotoSettled(page, '/');
    const trigger = page.getByRole('button', { name: /menu/i });
    await trigger.click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: 'Close' }).click();

    await expect(panel, 'Close left the menu open').toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger, 'focus should return to the trigger').toBeFocused();
    expect(
      await page.evaluate(() => document.body.style.overflow),
      'the page stays unscrollable after the menu closed',
    ).toBe('');
  });

  /*
   * Keyboard only. Tab past the last control reaches the browser UI, where
   * activeElement is body, so the walk ends there instead of failing.
   */
  test('every nav link is reachable by keyboard once open', async ({
    page,
  }) => {
    await gotoSettled(page, '/');

    await page.getByRole('button', { name: /menu/i }).focus();
    await page.keyboard.press('Enter');

    const panel = page.getByRole('dialog');
    await expect(
      panel,
      'Enter on the trigger should open the menu',
    ).toBeVisible();

    const reached: string[] = [];
    for (let i = 0; i <= MENU_HREFS.length + 1; i += 1) {
      if (i > 0) await page.keyboard.press('Tab');
      const href = await page.evaluate(() => {
        const el = document.activeElement;
        return el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
      });
      if (href === null) continue;
      if (reached.includes(href)) break;
      reached.push(href);
    }

    expect(
      reached,
      'tabbing through the open menu should reach every destination, in order',
    ).toEqual(MENU_HREFS);
  });
});

/**
 * 1280x1024 at 400% zoom: the open dialog scrolls and fills the viewport, so an
 * outward focus ring can land off screen (SC 2.4.7). Chromium makes the scroll
 * container a tab stop; Firefox does not scroll a partly visible control in.
 */
const OVERFLOW_VIEWPORT = { width: 320, height: 256 };
const MAX_TAB_PRESSES = 20;

const readRing = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const reach =
      parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {
      stop: el.id || el.textContent?.trim() || el.tagName,
      offscreen:
        box.left - reach < 0 ||
        box.top - reach < 0 ||
        box.right + reach > window.innerWidth ||
        box.bottom + reach > window.innerHeight,
    };
  });

test.describe('mobile menu when its content overflows', () => {
  test.use({ viewport: OVERFLOW_VIEWPORT });

  test('every focus ring in the open menu is on screen', async ({ page }) => {
    await gotoSettled(page, '/');
    await page.getByRole('button', { name: /menu/i }).click();

    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    const controls = await panel.locator('a[href], button').count();

    const rings: { stop: string; offscreen: boolean }[] = [];
    for (let i = 0; i <= MAX_TAB_PRESSES; i += 1) {
      // The menu opens with Home focused, so the first reading precedes a Tab.
      if (i > 0) {
        await page.keyboard.press('Tab');
        // Firefox scrolls focus into view a frame later; Chromium at once.
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
      }
      const ring = await readRing(page);
      if (!ring) continue;
      if (rings.some((seen) => seen.stop === ring.stop)) break;
      rings.push(ring);
    }

    expect(
      rings.length,
      'the walk should reach every link and button in the open menu',
    ).toBeGreaterThanOrEqual(controls);
    expect(
      rings.filter((ring) => ring.offscreen).map((ring) => ring.stop),
      'focus ring(s) drawn outside the viewport',
    ).toEqual([]);
  });
});

/*
 * Past 48rem the menu button is hidden, so focus cannot return to it on close.
 * It goes to the header nav's first link instead of the document. Also run
 * without `checkVisibility`, which Safari lacks before 17.4, inside the CSS target.
 */
for (const variant of ['', ' without checkVisibility']) {
  test(`closing the menu after widening past 48rem keeps focus in the header nav${variant}`, async ({
    page,
  }) => {
    if (variant) {
      await page.addInitScript(() => {
        Reflect.deleteProperty(Element.prototype, 'checkVisibility');
      });
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await gotoSettled(page, '/about');
    await page.getByRole('button', { name: /menu/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 800 });
    await page.keyboard.press('Escape');

    const first = page.locator('header nav[aria-label="Primary"] a').first();
    await expect(first).toBeFocused();
  });
}
