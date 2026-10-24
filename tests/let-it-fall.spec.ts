import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { TALK_ROUTES } from './routes';
import { ENGINE_INVARIANT } from './tags';
import { timedScan } from './axe';

/**
 * Let It Fall (src/scripts/let-it-fall.ts): the heap never covers the button or a target (SC 2.5.8), never scrolls
 * sideways (1.4.10), each change is announced (4.1.3), Esc and keyboard focus elsewhere restore (2.4.11), reduced
 * motion never animates (2.3.3), a link in the heap still works, and the mascot on top covers no control.
 */

const ROUTE = '/career';
const FALL = { name: 'Let It Fall' };
const BACK = { name: 'Put It Back' };
const FELL = 'The page fell down. Press Put It Back to rebuild it.';
const RESTORED = 'The page is back in place.';
/* CSS px at 400% zoom of a 1280 window, a phone, and a desktop. */
const WIDTHS = [320, 390, 1280] as const;
const HEIGHT = 900;
const MAX_INSTANT_MS = 1;
/* px of page above the button kept on screen, so some blocks are there to fall. */
const BUTTON_FROM_BOTTOM = 120;

const fallen = (page: Page) => page.locator('[data-fell]');
/* Every block's fall or climb back has landed; the mascot's climb may go on. */
const landed = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('[data-fall-block]')].flatMap((el) =>
            el.getAnimations(),
          ).length,
      ),
    )
    .toBe(0);
/* Targets in the heap off screen, or covered by something else at any of nine points across them. */
const coveredTargets = (page: Page) =>
  page.evaluate(() => {
    const SHARES = [0.25, 0.5, 0.75];
    return [
      ...document.querySelectorAll(
        '[data-fell] :is(a[href], button), [data-fell]:is(a[href], button)',
      ),
    ]
      .filter((el) => el.checkVisibility())
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) return true;
        return SHARES.some((x) =>
          SHARES.some((y) => {
            const hit = document.elementFromPoint(
              r.left + r.width * x,
              r.top + r.height * y,
            );
            return !hit || !el.contains(hit);
          }),
        );
      })
      .map((el) => el.textContent?.trim() || el.getAttribute('aria-label'));
  });
/* What animates on the fallen blocks and the mascot for longer than an instant; reduced-motion.css cuts transitions to 0.01ms. */
const moving = (page: Page) =>
  page.evaluate(
    (instant) =>
      [...document.querySelectorAll('[data-fall-block], .footer-mascot')]
        .flatMap((el) => el.getAnimations())
        .filter((a) => Number(a.effect?.getComputedTiming().duration) > instant)
        .map((a) => {
          const target =
            a.effect instanceof KeyframeEffect ? a.effect.target : null;
          const property =
            a instanceof CSSTransition ? a.transitionProperty : 'keyframes';
          return `${target?.className} ${property}`;
        }),
    MAX_INSTANT_MS,
  );
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

    test('blocks fall into a heap above the button, which keeps focus, and every target stays whole', async ({
      page,
    }) => {
      const button = await press(page);
      await expect(button).toBeFocused();
      await expect(fallen(page)).not.toHaveCount(0);
      await expect(
        page.locator('.header-slab'),
        'the header stayed up',
      ).toHaveAttribute('data-fell');
      await landed(page);
      expect(
        await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            ) === el
          );
        }),
        'a fallen block covers the button',
      ).toBe(true);
      expect(
        await coveredTargets(page),
        'a target in the heap is off screen or partly covered (SC 2.5.8)',
      ).toEqual([]);
      const { violations } = await timedScan(page, 'fallen /career');
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        'axe found WCAG 2.2 AA violations in the heap',
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

    test('the same button, Esc, or keyboard focus entering the page puts it back', async ({
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
        page.locator('[data-fall-block], [data-fall-raised]'),
        'a block home again keeps its fall state',
      ).toHaveCount(0);

      await press(page);
      await landed(page);
      await page.keyboard.press('Escape');
      await expect(status(page)).toHaveText(RESTORED);
      await expect(page.getByRole('button', FALL)).toBeFocused();
      await expect(fallen(page)).toHaveCount(0);
      await landed(page);

      await press(page);
      await page.keyboard.press('Shift+Tab');
      await expect(
        fallen(page),
        'a control moved by the fall took keyboard focus out of place',
      ).toHaveCount(0);
    });
  });
}

/* px: a desktop window short enough that the footer band shares the screen with the heap. */
const BAND_HEIGHT = 800;
const DESKTOP = 1280;

test('with the footer band on screen, no heap target is covered', async ({
  page,
}) => {
  await page.setViewportSize({ width: DESKTOP, height: BAND_HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await landed(page);
  expect(
    await coveredTargets(page),
    'a target in the heap is off screen or partly covered (SC 2.5.8)',
  ).toEqual([]);
});

/* The heap is random; a fixed sequence makes the same one every run. */
const seedRandom = (page: Page, seed: number) =>
  page.addInitScript((start) => {
    let state = start;
    /* mulberry32 */
    Math.random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    };
  }, seed);
const HEAP_SEED = 7;

test('a click on a link in the heap follows it', async ({ page }) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await landed(page);
  const href = await page.evaluate(() => {
    const top = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '[data-fell] a[href^="/"]',
      ),
    ].find((link) => {
      if (link.pathname === location.pathname) return false;
      const r = link.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit !== null && link.contains(hit);
    });
    top?.setAttribute('data-test-target', '');
    return top?.getAttribute('href');
  });
  expect(href, 'no link in the heap is on screen').toBeTruthy();
  await page.locator('[data-test-target]').click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('the fallen header scrolls with the page and is sticky again once back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await landed(page);
  const slab = page.locator('.header-slab');
  const top = () => slab.evaluate((el) => el.getBoundingClientRect().top);
  const before = await top();
  const SCROLL = 200;
  await page.evaluate((by) => scrollBy(0, -by), SCROLL);
  expect(await top(), 'the fallen header stayed on screen').toBeCloseTo(
    before + SCROLL,
    0,
  );
  /* Esc, not the button: a click would scroll the button back into view first. */
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText(RESTORED);
  await landed(page);
  const header = page.locator('.site-header');
  await expect(header).toHaveCSS('position', 'sticky');
  await expect(header, 'the header kept a pinned style').not.toHaveAttribute(
    'style',
    /./,
  );
  expect(
    await slab.evaluate((el) => {
      const { top } = el.getBoundingClientRect();
      return top >= 0 && top < innerHeight / 2;
    }),
    'the header climbed home off screen',
  ).toBe(true);
});

/* ms: longer than let-it-fall.ts REPEAT_MS, shorter than --fall-time, so the second press lands mid-climb. */
const PRESS_AGAIN_MS = 400;

test('pressing again while the blocks and mascot go home drops them again, the mascot clear of controls', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  const button = await press(page);
  await mascotClear(page);
  await button.click();
  await expect(status(page)).toHaveText(RESTORED);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForTimeout(PRESS_AGAIN_MS);
  await page.getByRole('button', FALL).click();
  await expect(status(page)).toHaveText(FELL);
  await expect(fallen(page)).not.toHaveCount(0);
  await mascotClear(page);
  expect(errors, 'cutting the climb short threw').toEqual([]);
});

test('under reduced motion the blocks and the mascot move at once, never animated', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await expect(fallen(page)).not.toHaveCount(0);
  await expect(page.locator('.footer-mascot')).toHaveAttribute('data-hopped');
  expect(await moving(page), 'something animates under reduced motion').toEqual(
    [],
  );
  await page.keyboard.press('Escape');
  await expect(fallen(page)).toHaveCount(0);
  await expect(page.locator('.footer-mascot')).not.toHaveAttribute(
    'data-hopped',
  );
  expect(
    await moving(page),
    'putting it back animates under reduced motion',
  ).toEqual([]);
});

/* ms: the climb is a few hops of about 0.8s and two glances; the wait allows for a slow runner. */
const CLIMB_MS = 20_000;

/* The mascot on the heap, settled: on screen, over no control, hidden from assistive technology. */
const mascotClear = async (page: Page) => {
  const hopper = page.locator('.fall-hopper[data-settled]');
  await expect(hopper).toBeAttached({ timeout: CLIMB_MS });
  await landed(page);
  await expect(page.locator('.footer-mascot')).toHaveAttribute('data-away');
  expect(
    await hopper.evaluate((feet) => {
      const r = feet.querySelector('img')!.getBoundingClientRect();
      const onScreen =
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        r.left >= 0 &&
        r.right <= innerWidth;
      const covers = [...document.querySelectorAll('a[href], button')]
        .filter((el) => el.checkVisibility())
        .filter((el) => {
          const c = el.getBoundingClientRect();
          return (
            r.left < c.right &&
            c.left < r.right &&
            r.top < c.bottom &&
            c.top < r.bottom
          );
        })
        .map((el) => el.textContent?.trim());
      return { onScreen, covers, hidden: feet.getAttribute('aria-hidden') };
    }),
    'the mascot is off screen, covers a control, or is announced',
  ).toEqual({ onScreen: true, covers: [], hidden: 'true' });
};

test('the mascot climbs onto the heap, covers no control, and hops home', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await mascotClear(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.fall-hopper')).toHaveCount(0);
  const sticker = page.locator('.footer-mascot');
  await expect(sticker).not.toHaveAttribute('data-away');
  await expect(sticker).not.toHaveAttribute('data-hopped');
  await expect(sticker, 'the mascot kept its hop offsets').not.toHaveAttribute(
    'style',
    /./,
  );
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
