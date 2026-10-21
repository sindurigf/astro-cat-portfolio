import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { TALK_ROUTES } from './routes';
import { ENGINE_INVARIANT } from './tags';
import { timedScan } from './axe';

/**
 * Let It Fall (src/scripts/let-it-fall.ts): the pile never covers the button (SC 2.5.5) or scrolls sideways (1.4.10),
 * each change is announced (4.1.3), Esc and focus elsewhere restore (2.4.11), reduced motion never animates (2.3.3).
 */

const ROUTE = '/career';
const FALL = { name: 'Let It Fall' };
const BACK = { name: 'Put It Back' };
const FELL = 'The page fell down. Press Put It Back to rebuild it.';
const RESTORED = 'The page is back in place.';
/* CSS px at 400% zoom of a 1280 window, a phone, and a desktop. */
const WIDTHS = [320, 390, 1280] as const;
const HEIGHT = 900;
/* px of page above the button kept on screen, so some blocks are there to fall. */
const BUTTON_FROM_BOTTOM = 120;
const MAX_INSTANT_MS = 1;

const fallen = (page: Page) => page.locator('[data-fell]');
/* Every fall and climb back has landed. */
const landed = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
const status = (page: Page) => page.locator('footer').getByRole('status');

/* The button near the bottom of the screen with the page above it, then one press. */
const press = async (page: Page) => {
  const button = page.getByRole('button', FALL);
  await button.evaluate((el, gap) => {
    scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight + gap);
  }, BUTTON_FROM_BOTTOM);
  await button.click();
  await expect(status(page)).toHaveText(FELL);
  return page.getByRole('button', BACK);
};

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await gotoSettled(page, ROUTE);
    });

    test('blocks fall into a pile above the button, which keeps focus and stays the hit target', async ({
      page,
    }) => {
      const button = await press(page);
      await expect(button).toBeFocused();
      await expect(fallen(page)).not.toHaveCount(0);
      await expect(
        fallen(page).first(),
        'a fallen block still takes taps',
      ).toHaveCSS('pointer-events', 'none');
      await landed(page);
      const pile = await page.evaluate(() => {
        const target = document.querySelector('[data-let-it-fall]')!;
        const r = target.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        const covered = [...document.querySelectorAll('[data-fell]')]
          /* Only blocks that started above the button fall onto it. */
          .filter(
            (el) =>
              el.compareDocumentPosition(target) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          )
          .filter((el) => el.getBoundingClientRect().bottom > r.top + 1);
        return { hit: hit === target, covered: covered.length };
      });
      expect(pile, 'a fallen block covers the button').toEqual({
        hit: true,
        covered: 0,
      });
      const { violations } = await timedScan(page, 'fallen /career');
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        'axe found WCAG 2.2 AA violations in the fallen pile',
      ).toEqual([]);
      await button.focus();
      await expect(
        fallen(page),
        'focus on the button itself put the page back',
      ).not.toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
        'the fallen page scrolls sideways (SC 1.4.10)',
      ).toBe(false);
    });

    test('the same button, Esc, or focus entering the page puts it back', async ({
      page,
    }) => {
      const button = await press(page);
      await landed(page);
      await button.click();
      await expect(status(page)).toHaveText(RESTORED);
      await expect(page.getByRole('button', FALL)).toBeFocused();
      await expect(fallen(page)).toHaveCount(0);
      await landed(page);
      await expect(
        page.locator('[data-fall-block]'),
        'a block home again keeps the fall transition',
      ).toHaveCount(0);

      await press(page);
      await landed(page);
      await page.keyboard.press('Escape');
      await expect(status(page)).toHaveText(RESTORED);
      await expect(page.getByRole('button', FALL)).toBeFocused();
      await expect(fallen(page)).toHaveCount(0);
      await landed(page);

      await press(page);
      await page.locator('main a').first().focus();
      await expect(
        fallen(page),
        'a control moved by the fall took focus out of place',
      ).toHaveCount(0);
    });
  });
}

test('under reduced motion the blocks move at once, never animated', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await expect(fallen(page)).not.toHaveCount(0);
  /* reduced-motion.css cuts every transition to 0.01ms under reduced motion. */
  expect(
    await fallen(page)
      .first()
      .evaluate(
        (el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000,
      ),
    'a fallen block animates under reduced motion',
  ).toBeLessThanOrEqual(MAX_INSTANT_MS);
});

test('without JavaScript there is no button', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto(ROUTE);
  await expect(page.getByRole('button', FALL)).toHaveCount(0);
  await context.close();
});

test(
  'a talk deck has no button (script budget)',
  ENGINE_INVARIANT,
  async ({ request }) => {
    for (const route of TALK_ROUTES) {
      const html = await (await request.get(`${route}/`)).text();
      expect(html, `${route} ships Let It Fall`).not.toContain(
        'data-let-it-fall',
      );
    }
  },
);
