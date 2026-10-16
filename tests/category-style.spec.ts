import { expect, test } from './test';
import { gotoSettled } from './settle';
import { AAA_TEXT, PAGE_HELPERS } from './contrast';
import { NODE } from './tags';
import { CATEGORIES } from '../src/lib/categories';

/* WCAG 2.2 SC 1.4.6: every category tile glyph and label is text at 7:1, in both modes. */

const TILES_SECTION = 'What I Write About';

/** Contrast of each matched element's text against what it is painted on. */
const ratios = (selectorScript: string) => `(() => {
  ${PAGE_HELPERS}
  return (${selectorScript}).map((node) => {
    const fg = parse(getComputedStyle(node).color);
    const bg = effectiveBackground(node);
    return { text: node.textContent.trim(), ratio: fg && bg ? ratio(fg, bg) : 0 };
  });
})()`;

const TILES = `[...document.querySelectorAll('h2')]
  .find((h) => h.textContent.trim() === ${JSON.stringify(TILES_SECTION)})
  .closest('section')
  .querySelectorAll('li.card > span[aria-hidden="true"]')`;

/* The category name is the label's first span: a solid card recolors that span, not the label. */
const LABELS = `document.querySelectorAll('article.card span.label:first-child > span:first-child')`;

test(
  'every category shares one style, so a hidden category cannot differ',
  NODE,
  () => {
    for (const [category, entry] of Object.entries(CATEGORIES)) {
      expect(
        Object.keys(entry).sort(),
        `${category} sets a style of its own`,
      ).toEqual(['glyph', 'teaser']);
    }
  },
);

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`category colors in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('every homepage category tile glyph reaches 7:1', async ({ page }) => {
      await gotoSettled(page, '/');
      const found = (await page.evaluate(ratios(`[...${TILES}]`))) as {
        text: string;
        ratio: number;
      }[];
      expect(
        found.length,
        'the homepage shows no category tile',
      ).toBeGreaterThan(0);
      for (const { text, ratio } of found) {
        expect(
          ratio,
          `the ${text} tile glyph is under 7:1`,
        ).toBeGreaterThanOrEqual(AAA_TEXT);
      }
    });

    test('every blog card category label reaches 7:1', async ({ page }) => {
      await gotoSettled(page, '/blog');
      const found = (await page.evaluate(ratios(`[...${LABELS}]`))) as {
        text: string;
        ratio: number;
      }[];
      expect(found.length, '/blog shows no category label').toBeGreaterThan(0);
      for (const { text, ratio } of found) {
        expect(
          ratio,
          `the "${text}" label is under 7:1`,
        ).toBeGreaterThanOrEqual(AAA_TEXT);
      }
    });
  });
}
