import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { CONTENTS_POST_ROUTE, ROUTES, TALK_ROUTES } from './routes';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { DESKTOP_VIEWPORT, NARROW_WIDTH, PHONE_VIEWPORT } from './wcag';

/*
 * A drawn edge must read against the ground it sits on (SC 1.4.11), unless
 * its own fill already does. A transparent edge is a choice, not a lost one.
 */
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

const lostEdges = (page: Page): Promise<string[]> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const NON_TEXT = ${NON_TEXT};
    const SIDES = ${JSON.stringify(SIDES)};
    const out = [];
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible' || style.display === 'contents') continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const ground = effectiveBackground(element.parentElement);
      if (!ground) continue;
      const fill = parse(style.backgroundColor);
      if (fill && fill.a === 1 && ratio(fill, ground) >= NON_TEXT) continue;
      const lost = SIDES.filter((side) => {
        if (['none', 'hidden'].includes(style['border' + side + 'Style'])) return false;
        if (parseFloat(style['border' + side + 'Width']) <= 0) return false;
        const edge = parse(style['border' + side + 'Color']);
        if (!edge || edge.a === 0) return false;
        return ratio(over(edge, ground), ground) < NON_TEXT;
      });
      if (lost.length === 0) continue;
      const edge = parse(style['border' + lost[0] + 'Color']);
      out.push(
        describe(element) + ' ' + lost.join('/').toLowerCase() + ': ' +
          ratio(over(edge, ground), ground).toFixed(2) + ' on ' + style.backgroundColor,
      );
    }
    return out;
  })()`) as Promise<string[]>;

/* The graph-paper surfaces in src/styles/components/cards.css. */
const PAPER =
  ':is(.card, .plain-slab, .post-contents):not(.card-solid, .surface-gold, .surface-gold *)';

for (const colorScheme of ['dark', 'light'] as const) {
  for (const viewport of [PHONE_VIEWPORT, DESKTOP_VIEWPORT]) {
    test.describe(`drawn edges read in ${colorScheme} mode at ${viewport.width}px`, () => {
      test.use({ colorScheme, viewport });

      for (const route of ROUTES) {
        test(route, async ({ page }) => {
          await gotoSettled(page, route);
          expect(
            await lostEdges(page),
            `edges under ${NON_TEXT}:1 against their ground, on an element whose fill does not reach it either`,
          ).toEqual([]);
        });
      }
    });
  }
}

/* Wide enough for the glow's bright core and a light card's 6px border. */
const EDGE_STRIP_PX = 8;
const SURFACES_PER_ROUTE = 3;

/* The brightest rendered pixel in a strip across the left edge, against the page. */
const edgeContrast = async (page: Page, index: number): Promise<number> => {
  const surface = page.locator(PAPER).filter({ visible: true }).nth(index);
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  const ground = (await surface.evaluate(
    (element, source) => (0, eval)(source)(element),
    `(element) => {
    ${PAGE_HELPERS}
    const color = effectiveBackground(element.parentElement);
    return color && [color.r, color.g, color.b];
  }`,
  )) as [number, number, number] | null;
  expect(ground, 'the surface sits on no solid page ground').not.toBeNull();
  const shot = await page.screenshot({
    clip: {
      x: Math.max(0, Math.round(box.x) - EDGE_STRIP_PX / 2),
      y: Math.round(box.y + box.height / 2),
      width: EDGE_STRIP_PX,
      height: 1,
    },
  });
  return (await page.evaluate(
    `(async () => {
      ${PAGE_HELPERS}
      const blob = await (await fetch('data:image/png;base64,${shot.toString('base64')}')).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, 1).data;
      const ground = { r: ${ground![0]}, g: ${ground![1]}, b: ${ground![2]}, a: 1 };
      let best = 1;
      for (let i = 0; i < data.length; i += 4) {
        best = Math.max(best, ratio({ r: data[i], g: data[i + 1], b: data[i + 2], a: 1 }, ground));
      }
      return best;
    })()`,
  )) as number;
};

const RING_VIEWPORTS = [
  DESKTOP_VIEWPORT,
  { width: NARROW_WIDTH, height: DESKTOP_VIEWPORT.height },
];

for (const colorScheme of ['dark', 'light'] as const) {
  for (const viewport of RING_VIEWPORTS) {
    test.describe(`graph-paper edges read in ${colorScheme} mode at ${viewport.width}px`, () => {
      test.use({ colorScheme, viewport });

      /* The talk deck sits in the slide track; /about's cards sit in bands. */
      for (const route of ['/', '/blog/', '/about/', TALK_ROUTES[0]]) {
        test(`${route}: the rendered edge reaches ${NON_TEXT}:1 against the page`, async ({
          page,
        }) => {
          await gotoSettled(page, route);
          const count = Math.min(
            await page.locator(PAPER).filter({ visible: true }).count(),
            SURFACES_PER_ROUTE,
          );
          expect(count, `${route} has no graph-paper surface`).toBeGreaterThan(
            0,
          );
          for (let index = 0; index < count; index += 1) {
            expect(
              await edgeContrast(page, index),
              `surface ${index} on ${route}: its edge is under ${NON_TEXT}:1 against the page`,
            ).toBeGreaterThanOrEqual(NON_TEXT);
          }
        });
      }
    });
  }
}

test.describe('graph-paper edges in forced colors', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit reports forced colors but paints the author palette (tests/forced-colors.spec.ts)',
  );

  for (const route of [
    '/',
    ...(CONTENTS_POST_ROUTE ? [CONTENTS_POST_ROUTE] : []),
  ]) {
    test(`${route} drops the paper and ring and keeps a system-color border`, async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await gotoSettled(page, route);
      const found = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        return [...document.querySelectorAll(${JSON.stringify(PAPER)})].map((element) => {
          const style = getComputedStyle(element);
          const border = parse(style.borderTopColor);
          return {
            name: describe(element),
            paper: getComputedStyle(element, '::before').display,
            band: style.boxShadow,
            edge: element.matches('.post-contents') || (style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0 && !!border && border.a > 0),
          };
        });
      })()`)) as { name: string; paper: string; band: string; edge: boolean }[];
      expect(
        found.length,
        `${route} has no graph-paper surface`,
      ).toBeGreaterThan(0);
      for (const { name, paper, band, edge } of found) {
        expect(paper, `${name} paints its paper in forced colors`).toBe('none');
        expect(band, `${name} paints its ring in forced colors`).toBe('none');
        expect(edge, `${name} has no visible border in forced colors`).toBe(
          true,
        );
      }
    });
  }
});

test.describe('the ring and the focus ring stay apart', () => {
  test.use({ colorScheme: 'dark', viewport: DESKTOP_VIEWPORT });

  test('a focused card link draws its cyan ring inside the card, clear of the edge ring', async ({
    page,
  }) => {
    await gotoSettled(page, '/');
    const link = page.locator(`${PAPER} .card-link`).first();
    await link.focus();
    const found = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      const ring =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
      const box = el.getBoundingClientRect();
      const card = el.closest('.card')!.getBoundingClientRect();
      return {
        outline: style.outlineStyle,
        color: style.outlineColor,
        clear: Math.min(
          box.left - ring - card.left,
          box.top - ring - card.top,
          card.right - (box.right + ring),
        ),
      };
    });
    expect(found.outline, 'the focused card link draws no outline').toBe(
      'solid',
    );
    expect(
      found.clear,
      'the focus ring reaches the card edge, where the edge ring sits',
    ).toBeGreaterThan(0);
  });

  test('hover draws no focus ring on a card', async ({ page }) => {
    await gotoSettled(page, '/');
    const card = page.locator(`${PAPER}:has(.card-link)`).first();
    await card.hover();
    expect(
      await card.evaluate(
        (el) => getComputedStyle(el.querySelector('.card-link')!).outlineStyle,
      ),
      'a hovered, unfocused card link shows an outline like focus',
    ).toBe('none');
  });
});
