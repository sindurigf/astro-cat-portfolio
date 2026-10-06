import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT } from './wcag';
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
    name: 'the call to action',
    route: '/blog/',
    control: 'header .nav-cta',
    moves: 'header .nav-cta',
  },
  {
    name: 'a gold primary button',
    route: '/contact',
    control: 'main .surface-gold .btn-gold-primary',
    moves: 'main .surface-gold .btn-gold-primary',
  },
  {
    name: 'a chip',
    route: '/blog/',
    control: 'main a.chip:not([aria-current])',
    moves: 'main a.chip:not([aria-current])',
    absent: CATEGORY_ROUTES.length === 0 ? NO_PUBLISHED_POST : undefined,
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

/* A hard shadow layer that is not inset and not the transparent placeholder
 * Tailwind composes `shadow-none` from. */
const castsShadow = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) =>
      getComputedStyle(el)
        .boxShadow.split(/,(?![^(]*\))/)
        .map((layer) => layer.trim())
        .some(
          (layer) =>
            !layer.includes('inset') &&
            !layer.startsWith('rgba(0, 0, 0, 0)') &&
            /[1-9]\d*px [1-9]\d*px 0px 0px/.test(layer),
        ),
    );

// A real pointer press so :hover and :active both apply; the click is cancelled.
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
      return `${s.translate} | ${s.boxShadow}`;
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
      // Hovered and read once straight: a footer sticker is tilted until pointed at,
      // and a box read mid-change puts the corner outside it.
      await el.hover();
      await expect
        .poll(() => el.evaluate((node) => getComputedStyle(node).rotate))
        .toMatch(/^(none|0deg)$/);
      const box = await el.boundingBox();
      if (!box) throw new Error(`${p.name} has no box`);
      const x = box.x + 1;
      const y = box.y + 1;
      await page.mouse.move(x, y);
      /* The pointer is on the control before the press, so a miss is the press's. */
      expect(
        await el.evaluate(
          (node, [px, py]) => node.contains(document.elementFromPoint(px, py)),
          [x, y],
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
