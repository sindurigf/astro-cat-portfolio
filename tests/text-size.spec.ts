import { test, expect, type Page } from './test';
import { gotoSettled, sweepTimeout } from './settle';
import { ROUTES } from './routes';

/*
 * Walks rendered text, not tokens: a new component can ship a size no table
 * lists. 16px is a house rule, not a WCAG criterion: below it iOS zooms a
 * focused field. 414 and 430 catch a curve that eases from 400px.
 */

const MINIMUM_PX = 16;

/** Narrowest supported width, common phones, and one pixel under 40rem. */
const PHONE_WIDTHS = [305, 360, 390, 414, 430, 639] as const;

/** Fewer strings than this means the walk never reached the pages. */
const FEWEST_STRINGS = 200;

type SmallString = {
  size: number;
  selector: string;
  text: string;
  route: string;
};

/**
 * Every visible string with its drawn size. Read from text nodes, since a
 * wrapper inherits a size it never draws; screen-reader-only text is skipped.
 */
const MEASURE = `(floor) => {
  const out = [];
  let total = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const counted = new Set();

  const describe = (element) => {
    const id = element.id ? '#' + element.id : '';
    const classes = typeof element.className === 'string' && element.className.trim() !== ''
      ? '.' + element.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    return element.tagName.toLowerCase() + id + classes;
  };

  let node;
  while ((node = walker.nextNode())) {
    if ((node.textContent || '').trim().length < 2) continue;
    const element = node.parentElement;
    if (element === null || counted.has(element)) continue;
    counted.add(element);

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (element.closest('.sr-only') !== null) continue;
    if (style.clip === 'rect(0px, 0px, 0px, 0px)') continue;

    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    total += 1;
    const size = parseFloat(style.fontSize);
    if (size < floor) {
      out.push({
        size: Math.round(size * 100) / 100,
        selector: describe(element),
        text: (node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
      });
    }
  }
  return { total, small: out };
}`;

const measure = (
  page: Page,
): Promise<{ total: number; small: Omit<SmallString, 'route'>[] }> =>
  page.evaluate(`(${MEASURE})(${MINIMUM_PX})`) as Promise<{
    total: number;
    small: Omit<SmallString, 'route'>[];
  }>;

test.describe('text on a phone', () => {
  for (const width of PHONE_WIDTHS) {
    test(`nothing is drawn under ${MINIMUM_PX}px at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(sweepTimeout(ROUTES.length));
      await page.setViewportSize({ width, height: 844 });

      const small: SmallString[] = [];
      let total = 0;

      for (const route of ROUTES) {
        await gotoSettled(page, route);
        const result = await measure(page);
        total += result.total;
        for (const entry of result.small) small.push({ ...entry, route });
      }

      expect(
        small.map((s) => `${s.route} ${s.size}px ${s.selector} "${s.text}"`),
        `text under ${MINIMUM_PX}px at ${width}px; fix the token in global.css`,
      ).toEqual([]);

      expect(
        total,
        `only ${total} strings measured at ${width}px`,
      ).toBeGreaterThan(FEWEST_STRINGS);
    });
  }
});
