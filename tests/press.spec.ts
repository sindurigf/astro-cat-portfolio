import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT } from './wcag';
import { CONTACT_FORM_ON } from '../src/lib/contact';
import { CATEGORY_ROUTES, NO_PUBLISHED_POST } from './routes';

/* The form's send button, or the 404 page's link when there is no form. */
const PRIMARY_ROUTE = CONTACT_FORM_ON ? '/contact' : '/404';

/** A pressed control drops its shadow, and moves only without reduced motion. `moves` carries the shadow. */
interface Pressable {
  name: string;
  route: string;
  control: string;
  moves: string;
  /** Why the page has no such control, when it has none. */
  absent?: string;
}

const PRESSABLE: Pressable[] = [
  {
    name: 'a primary button',
    route: PRIMARY_ROUTE,
    control: 'main .btn-primary',
    moves: 'main .btn-primary',
  },
  {
    name: 'a gold primary button',
    route: '/contact',
    control: 'main .surface-gold .btn-gold-primary',
    moves: 'main .surface-gold .btn-gold-primary',
  },
  {
    name: 'a chip',
    route: '/about/',
    control: 'main a.chip:not([aria-current])',
    moves: 'main a.chip:not([aria-current])',
  },
  {
    name: 'a footer sticker',
    route: '/blog/',
    control: 'footer .footer-sticker',
    moves: 'footer .footer-sticker',
  },
  {
    name: 'the logo tile',
    route: '/blog/',
    control: 'header .logo-link',
    moves: 'header .logo-tile',
  },
];

/* Long enough to cover a deliberate press. */
const HOLD_MS = 250;

const translateOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const t = getComputedStyle(el).translate;
      if (t === 'none') return [0, 0];
      const [x, y = x] = t.split(' ').map(parseFloat);
      return [x, y];
    });

const transitionsDone = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished)).then(() => true),
    );

/* A hard shadow layer that is not inset and not the transparent placeholder
 * Tailwind composes `shadow-none` from, or the logo's offset drop shadow. */
const castsShadow = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      const boxShadow = style.boxShadow
        .split(/,(?![^(]*\))/)
        .map((layer) => layer.trim())
        .some(
          (layer) =>
            !layer.includes('inset') &&
            !layer.startsWith('rgba(0, 0, 0, 0)') &&
            /[1-9]\d*px [1-9]\d*px 0px 0px/.test(layer),
        );
      return (
        boxShadow ||
        /drop-shadow\(rgba?\([^)]*\) [1-9]\d*px [1-9]\d*px/.test(style.filter)
      );
    });

// A real pointer press so :hover and :active both apply; the click is canceled.
// Waits for :active: read before the press lands, a control that never moves
// reads as one that correctly did not.
const pressCenter = async (page: Page, control: string) => {
  const el = page.locator(control).first();
  await el.evaluate((node) =>
    node.addEventListener('click', (e) => e.preventDefault()),
  );
  await el.hover();
  await page.mouse.down();
  await expect
    .poll(() => el.evaluate((node) => node.matches(':active')))
    .toBe(true);
  // Reduced motion gives every property a 0.01ms transition, and a read in the
  // press's frame can see the start value.
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  // Held like a person's press. WebKit re-hit-tests an unmoved pointer when the
  // control moves under it, and drops :active if the point lands on a child that
  // takes the pointer (a footer sticker's icon).
  await page.waitForTimeout(HOLD_MS);
  expect(await el.evaluate((node) => node.matches(':active'))).toBe(true);
};

const pressLook = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.translate} | ${s.boxShadow} | ${s.filter}`;
    });

test.describe('a press is drawn', () => {
  for (const p of PRESSABLE) {
    test(`${p.name} looks different pressed than hovered`, async ({ page }) => {
      test.skip(p.absent !== undefined, p.absent);
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, p.route);
      await page.locator(p.control).first().hover();
      const hovered = await pressLook(page, p.moves);
      await pressCenter(page, p.control);
      expect(
        await pressLook(page, p.moves),
        'pressing changed neither the shadow nor the position',
      ).not.toBe(hovered);
      await page.mouse.up();
    });

    // The move is opted into under `no-preference`, not overridden under `reduce`:
    // an override has to outscore the press rule's specificity.
    test(`${p.name} shows a press under reduced motion without moving`, async ({
      page,
    }) => {
      test.skip(p.absent !== undefined, p.absent);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, p.route);
      await page.locator(p.control).first().hover();
      expect(
        await castsShadow(page, p.moves),
        'no shadow before the press, so its loss below would prove nothing.',
      ).toBe(true);
      await pressCenter(page, p.control);
      expect(await translateOf(page, p.moves)).toEqual([0, 0]);
      expect(
        await castsShadow(page, p.moves),
        'a press under reduced motion shows nothing: dropping the shadow is its only cue.',
      ).toBe(false);
      await page.mouse.up();
    });
  }
});

/**
 * The move takes the control out from under a pointer near its top or left edge;
 * released there, the click goes to a common ancestor. The `::after` fills the vacated strip.
 */
test.describe('a press on the edge still clicks', () => {
  for (const p of PRESSABLE) {
    test(p.name, async ({ page }) => {
      test.skip(p.absent !== undefined, p.absent);
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, p.route);
      const el = page.locator(p.control).first();
      await el.evaluate((node) => {
        node.dataset.clicked = 'no';
        node.addEventListener('click', (e) => {
          e.preventDefault();
          node.dataset.clicked = 'yes';
        });
      });
      // Read once the lift lands: Firefox truncates the pointer to whole pixels and
      // hit-tests a moving control short of its box, so a mid-lift corner misses.
      await el.hover();
      await transitionsDone(page, p.moves);
      const box = await el.boundingBox();
      if (!box) throw new Error(`${p.name} has no box`);
      const x = box.x + 1;
      const y = box.y + 1;
      await page.mouse.move(x, y);
      /* The pointer is on the control before the press, so a miss is the press's. */
      expect(
        await el.evaluate(
          (node, point) =>
            node.contains(document.elementFromPoint(point.x, point.y)),
          { x, y },
        ),
      ).toBe(true);
      await page.mouse.down();
      await page.mouse.up();
      await expect(el).toHaveAttribute('data-clicked', 'yes');
    });
  }
});

/** The gold primary's inner focus ring is an inset shadow; a press empties box-shadow, so only the pink goes. */
test('a focused gold primary keeps its inner ring when pressed', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await gotoSettled(page, '/contact');
  const button = page.locator('main .surface-gold .btn-gold-primary').first();
  await button.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await pressCenter(page, 'main .surface-gold .btn-gold-primary');
  expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(
    true,
  );
  await expect(button).toHaveCSS('box-shadow', /inset/);
  expect(await castsShadow(page, 'main .surface-gold .btn-gold-primary')).toBe(
    false,
  );
  await page.mouse.up();
});

/*
 * The menu's bricks each cast their own 6px throw, so a press drops it and
 * moves by it; the header's joined bricks share their row's throw and hold still.
 */
test.describe('bricks', () => {
  const MENU_LINK = '#mobile-menu-panel a.nav-sticker:not([aria-current])';

  const openMenu = async (page: Page) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await gotoSettled(page, '/blog/');
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator(MENU_LINK).first()).toBeVisible();
  };

  const brickThrowOf = (page: Page) =>
    page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--brick-throw',
        ),
      ),
    );

  test('a menu brick drops its throw and moves by it', async ({ page }) => {
    await openMenu(page);
    await pressCenter(page, MENU_LINK);
    expect(
      await castsShadow(page, MENU_LINK),
      'a pressed menu brick keeps its throw',
    ).toBe(false);
    const step = await brickThrowOf(page);
    expect(
      await translateOf(page, MENU_LINK),
      'a pressed menu brick does not move into its throw',
    ).toEqual([step, step]);
    await page.mouse.up();
  });

  test('a menu brick pressed under reduced motion drops its throw without moving', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMenu(page);
    await pressCenter(page, MENU_LINK);
    expect(await castsShadow(page, MENU_LINK)).toBe(false);
    expect(await translateOf(page, MENU_LINK)).toEqual([0, 0]);
    await page.mouse.up();
  });

  test('a joined filter chip holds still when pressed', async ({ page }) => {
    test.skip(CATEGORY_ROUTES.length === 0, NO_PUBLISHED_POST);
    const chip = 'main .chip-row a.chip:not([aria-current])';
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, '/blog/');
    await pressCenter(page, chip);
    expect(
      await translateOf(page, chip),
      'a joined chip moved out of its row',
    ).toEqual([0, 0]);
    await page.mouse.up();
  });

  test('a joined header brick holds still when pressed', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, '/blog/');
    await pressCenter(page, 'header .header-bricks .nav-cta');
    expect(
      await translateOf(page, 'header .header-bricks .nav-cta'),
      'a joined brick moved out of its row',
    ).toEqual([0, 0]);
    await page.mouse.up();
  });
});

/* The logo's link holds still while its tile lifts, so it has no edge to lose. */
const LIFTS = PRESSABLE.filter((p) => p.control === p.moves);

const pressLift = (page: Page) =>
  page.evaluate(() =>
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--press-lift',
      ),
    ),
  );

/* The largest x offset among the shadow layers that are not inset. */
const throwOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) =>
      Math.max(
        0,
        ...getComputedStyle(el)
          .boxShadow.split(/,(?![^(]*\))/)
          .filter((layer) => !layer.includes('inset'))
          .map((layer) =>
            parseFloat(layer.replace(/rgba?\([^)]*\)/, '').trim()),
          )
          .filter(Number.isFinite),
      ),
    );

test.describe('a hover lift', () => {
  for (const p of LIFTS) {
    // A control that lifts out from under a pointer at its edge would lose hover and drop back under it, over and over.
    test(`${p.name} keeps hover with the pointer on its resting edge`, async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, p.route);
      const el = page.locator(p.control).first();
      await el.hover();
      await transitionsDone(page, p.control);
      const lift = await pressLift(page);
      const box = await el.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return { right: r.right, bottom: r.bottom };
      });
      await page.mouse.move(box.right + lift - 1, box.bottom + lift - 1);
      await transitionsDone(page, p.control);
      expect(
        await el.evaluate((node) => node.matches(':hover')),
        'the lift carried the control out from under the pointer',
      ).toBe(true);
    });

    test(`${p.name} holds still under the pointer under reduced motion`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, p.route);
      await page.locator(p.control).first().hover();
      expect(await translateOf(page, p.moves)).toEqual([0, 0]);
    });

    test(`${p.name} keeps its focus ring clear of its lifted throw`, async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoSettled(page, p.route);
      const el = page.locator(p.control).first();
      await el.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(el).toBeFocused();
      await el.hover();
      await transitionsDone(page, p.control);
      const { offset, gap } = await el.evaluate((node) => ({
        offset: parseFloat(getComputedStyle(node).outlineOffset),
        gap: parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--focus-gap',
          ),
        ),
      }));
      expect(
        offset,
        'the ring does not clear the throw by its gap: cyan over pink fails SC 1.4.11',
      ).toBeGreaterThanOrEqual((await throwOf(page, p.control)) + gap);
    });
  }
});

test.describe('on a touch screen', () => {
  test.skip(
    ({ browserName }) => browserName === 'firefox',
    'Firefox has no isMobile emulation, so it always reports hover: hover',
  );
  test.use({ isMobile: true, hasTouch: true });

  // A tap leaves :hover set on a phone, so a lift would stay on after the finger leaves.
  test('a hovered button does not lift without a hovering pointer', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await gotoSettled(page, '/contact');
    expect(
      await page.evaluate(() => matchMedia('(hover: hover)').matches),
    ).toBe(false);
    const button = page.locator('main .btn-primary').first();
    await button.hover();
    expect(await button.evaluate((node) => node.matches(':hover'))).toBe(true);
    await transitionsDone(page, 'main .btn-primary');
    expect(await translateOf(page, 'main .btn-primary')).toEqual([0, 0]);
  });
});
