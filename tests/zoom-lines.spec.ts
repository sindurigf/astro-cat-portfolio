import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';

/*
 * SC 1.4.8: text at 200% "does not require the user to scroll horizontally to
 * read a line of text". Some text tokens reach 2x only at 500% page zoom
 * (tests/text-resize.spec.ts), so this runs below the 320px reflow floor.
 */

/** 1000px and 1280px windows at 500% zoom, in CSS px. */
const ZOOMED_WIDTHS = [200, 256] as const;
const VIEWPORT_HEIGHT = 160;

/* Sub-pixel rounding at the viewport edge, in CSS px. */
const EDGE_TOLERANCE_PX = 1;

/**
 * Every line box of visible text that leaves the viewport. Text inside a box
 * that scrolls sideways on purpose (a code block, a photo strip) is skipped:
 * that box scrolls, not the page.
 */
const linesOffScreen = (page: Page): Promise<string[]> =>
  page.evaluate((tolerance) => {
    const viewport = document.documentElement.clientWidth;
    const scrollsItself = (element: Element): boolean => {
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };

    const out: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const element = node.parentElement;
      if (text === '' || element === null) continue;
      if (element.closest('.sr-only, [hidden], [aria-hidden="true"]')) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (scrollsItself(element)) continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.width === 0) continue;
        if (line.left < -tolerance || line.right > viewport + tolerance) {
          out.push(
            `${element.tagName.toLowerCase()} "${text.slice(0, 40)}" spans ${Math.round(line.left)} to ${Math.round(line.right)}px`,
          );
          break;
        }
      }
    }
    return out;
  }, EDGE_TOLERANCE_PX);

for (const width of ZOOMED_WIDTHS) {
  test.describe(`every line of text stays on screen at ${width}px (SC 1.4.8)`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await gotoSettled(page, route);

        expect(
          await linesOffScreen(page),
          `${route} has text past the edge at ${width}px`,
        ).toEqual([]);

        const sideways = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(
          sideways,
          `${route} scrolls sideways by ${sideways}px at ${width}px`,
        ).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      });
    }
  });
}
