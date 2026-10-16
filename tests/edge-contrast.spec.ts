import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT } from './wcag';

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
