import { expect, test } from './test';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, NARROW_WIDTH } from './wcag';

/* One route per grid surface: card block, blog rows, post contents, talk slides. */
const ROUTES = [
  '/',
  '/blog/',
  '/blog/open-source-is-not-just-code/',
  '/about/',
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

/*
 * The sheet paints under every neighbor when it and the paper sit at negative z
 * and the card makes no stacking context of its own. The raised brick is one on
 * purpose: it lifts over its block, sheet included.
 */
for (const route of ROUTES) {
  test(`${route}: no sheet can paint over another card, its text or a focus ring`, async ({
    page,
  }) => {
    await gotoSettled(page, route);
    const faults = await page.evaluate((selector) => {
      const own = (el: Element) => {
        const s = getComputedStyle(el);
        return (
          s.isolation === 'isolate' ||
          s.zIndex !== 'auto' ||
          s.transform !== 'none' ||
          s.translate !== 'none' ||
          s.opacity !== '1' ||
          s.filter !== 'none'
        );
      };
      return [...document.querySelectorAll(selector)]
        .filter((el) => !el.matches('.card-raised'))
        .flatMap((el) => {
          const sheet = Number(getComputedStyle(el, '::after').zIndex);
          const paper = Number(getComputedStyle(el, '::before').zIndex);
          const out: string[] = [];
          if (!(sheet < paper && paper < 0))
            out.push(`${el.className}: sheet ${sheet}, paper ${paper}`);
          if (own(el))
            out.push(`${el.className}: makes its own stacking context`);
          return out;
        });
    }, SHEETED);
    expect(faults, "a sheet paints in its card's own layer").toEqual([]);
  });
}

/* /brand/cards draws its card specimens on dark and light stage halves. */
const PAINTED_ROUTES = [...ROUTES, '/brand/cards/', '/brand/grounds/'];

// A card's fill paints at negative z, so a painted ancestor below main must be its own stacking context.
for (const route of PAINTED_ROUTES) {
  test(`${route}: no painted container hides a card's fill`, async ({
    page,
  }) => {
    await gotoSettled(page, route);
    const hiding = await page.evaluate((selector) => {
      const isContext = (s: CSSStyleDeclaration) =>
        s.isolation === 'isolate' ||
        (s.zIndex !== 'auto' && s.position !== 'static') ||
        s.transform !== 'none' ||
        s.translate !== 'none' ||
        s.opacity !== '1' ||
        s.filter !== 'none' ||
        s.position === 'fixed' ||
        s.position === 'sticky';
      const painted = (s: CSSStyleDeclaration) =>
        s.backgroundImage !== 'none' ||
        !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(s.backgroundColor);
      const out = new Set<string>();
      for (const card of document.querySelectorAll(selector)) {
        for (
          let node = card.parentElement;
          node && !node.matches('main, body');
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (isContext(style)) break;
          if (painted(style)) {
            out.add(node.className.toString());
            break;
          }
        }
      }
      return [...out];
    }, SHEETED);
    expect(hiding, 'a painted container covers card fills').toEqual([]);
  });
}

test('a dark /brand card specimen paints its surface fill', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await gotoSettled(page, '/brand/cards/');
  const card = page
    .locator('.brand-stage-half.mode-dark .card:not(.card-solid)')
    .first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  expect(box, 'no dark card specimen on /brand/cards').not.toBeNull();
  const shot = await page.screenshot({
    // Past the 6px edge, clear of the paper's first line at 15px.
    clip: { x: box!.x + 10, y: box!.y + 10, width: 1, height: 1 },
  });
  const surface = await card.evaluate(
    (el) => getComputedStyle(el, '::before').backgroundColor,
  );
  const pixel = await page.evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }, shot.toString('base64'));
  expect(pixel, 'the card shows the page ground, not its fill').toBe(surface);
});

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
