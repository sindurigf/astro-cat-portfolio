import { expect, test } from './test';
import { ROUTES } from './routes';
import { gotoSettled } from './settle';

/**
 * One h1, no skipped level, nothing below --text-post-h3 (19px, label size
 * reads as a label), and each post heading a clear step under its parent.
 */
const HEADING_FLOOR = 19;
const STEP = 0.8;

/* Both ends of the clamp()ed type scale: a step that holds at 1280px can close at 320px. */
const WIDTHS = [1280, 320] as const;

for (const route of ROUTES)
  for (const width of WIDTHS) {
    test(`${route} has a heading outline that matches its sizes at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, route);
      const headings = await page.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
          .filter((h) => !h.closest('dialog, [hidden]'))
          .map((h) => ({
            level: Number(h.tagName[1]),
            text: (h.textContent ?? '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 40),
            size: parseFloat(getComputedStyle(h).fontSize),
            inPost: h.closest('.post-layout .prose') !== null,
            section:
              h.tagName === 'H2' &&
              h.closest('main > section') !== null &&
              !h.closest('li, article, .post-layout, dialog'),
          })),
      );

      const problems: string[] = [];
      if (headings.filter((h) => h.level === 1).length !== 1) {
        problems.push('not exactly one h1');
      }
      headings.forEach((h, i) => {
        const prev = headings[i - 1];
        if (prev && h.level > prev.level + 1) {
          problems.push(`${h.text}: h${h.level} after h${prev.level}`);
        }
        if (h.size < HEADING_FLOOR) {
          problems.push(`${h.text}: h${h.level} at ${h.size}px`);
        }
        if (h.inPost && h.level > 2) {
          const parent = headings
            .slice(0, i)
            .reverse()
            .find((p) => p.level === h.level - 1);
          if (parent && h.size > parent.size * STEP) {
            problems.push(
              `${h.text}: h${h.level} at ${h.size}px is not a step under its h${parent.level} at ${parent.size}px`,
            );
          }
        }
      });
      // Section h2s are one level, so one size; and no h2 looks bigger than the h1.
      const sectionSizes = new Set(
        headings.filter((h) => h.section).map((h) => Math.round(h.size)),
      );
      if (sectionSizes.size > 1) {
        problems.push(`section h2s at ${[...sectionSizes].join(', ')}px`);
      }
      const title = headings.find((h) => h.level === 1);
      for (const h of headings.filter((h) => h.level === 2)) {
        if (title && h.size > title.size) {
          problems.push(
            `${h.text}: h2 at ${h.size}px above the h1 at ${title.size}px`,
          );
        }
      }
      expect(problems).toEqual([]);
    });
  }
