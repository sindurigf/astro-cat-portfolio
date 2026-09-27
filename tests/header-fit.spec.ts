import { expect, test } from './test';
import { gotoSettled } from './settle';

/**
 * Tightest header widths: 336px (`--breakpoint-xs`), 768px (primary nav appears),
 * 1024px (row switches to grid).
 */
const WIDTHS = [336, 768, 1024] as const;

const VIEWPORT_HEIGHT = 800;

/* The route with the longest nav label lit. */
const ROUTE = '/about';

for (const width of WIDTHS) {
  test.describe(`the header row at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    test('fits without covering a control or scrolling the page', async ({
      page,
    }) => {
      await gotoSettled(page, ROUTE);

      const found = await page.evaluate(() => {
        const header = document.querySelector('header');
        const wordmark = header?.querySelector('a[href="/"] .label');
        if (!header || !wordmark) return null;
        const controls = [
          ...header.querySelectorAll<HTMLElement>('a, button, input, select'),
        ].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1 && el.checkVisibility();
        });
        const name = (el: Element) =>
          (el.textContent ?? '').trim() ||
          el.getAttribute('aria-label') ||
          el.tagName;
        const covered = controls
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            );
            return !hit || !(el === hit || el.contains(hit));
          })
          .map(name);
        const w = wordmark.getBoundingClientRect();
        const touching = controls
          .filter((el) => !el.contains(wordmark))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.left < w.right &&
              r.right > w.left &&
              r.top < w.bottom &&
              r.bottom > w.top
            );
          })
          .map(name);
        return {
          controls: controls.length,
          covered,
          touching,
          sideways:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        };
      });

      expect(found, 'the header has no home link wordmark').not.toBeNull();
      expect(found!.controls, 'no visible header controls').toBeGreaterThan(1);
      expect(found!.sideways, 'the page scrolls sideways').toBe(0);
      expect(
        found!.covered,
        'header controls whose centre lands on something else',
      ).toEqual([]);
      expect(
        found!.touching,
        'header controls running into the wordmark',
      ).toEqual([]);
    });
  });
}
