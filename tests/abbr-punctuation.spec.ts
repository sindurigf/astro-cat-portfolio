import { expect, test } from './test';
import { builtHtml } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';
import { REFLOW_VIEWPORT } from './wcag';

/*
 * A line may break after an inline-block button, so punctuation after an
 * <Abbr> can start a line. It belongs in the `after` prop, inside the
 * `.abbr-unit` that does not wrap (src/components/Abbr.astro).
 */
const ABBR_THEN_PUNCTUATION =
  /<span class="abbr-tip"[^>]*>[^<]*<\/span>[.,;:!?)]?<\/span>(?:<script\b[^>]*><\/script>)?\s*[.,;:!?)]/g;
const CONTEXT_CHARS = 40;
const BLOCK_WIDTHS = { min: 120, max: 320 };

const routesWithAbbr = (): string[] =>
  [...builtHtml()]
    .filter(([, html]) => html.includes('abbr-unit'))
    .map(([route]) => route);

test('no punctuation follows an Abbr outside its `after` prop', NODE, () => {
  const loose = [...builtHtml()].flatMap(([route, html]) =>
    [...html.matchAll(ABBR_THEN_PUNCTUATION)].map(
      (match) =>
        `${route}: …${html.slice(match.index + match[0].length - CONTEXT_CHARS, match.index + match[0].length)}…`,
    ),
  );
  expect(loose, loose.join('\n')).toEqual([]);
});

test.describe('an abbreviation and its punctuation never part at a line break', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  for (const route of routesWithAbbr()) {
    test(route, async ({ page }) => {
      await gotoSettled(page, route);
      const split = await page.evaluate(
        (widths) =>
          [...document.querySelectorAll('.abbr-unit')].flatMap((unit) => {
            const button = unit.querySelector('button');
            const tail = unit.lastChild;
            const block = unit.closest('p, li, dd, h2, h3');
            if (!button || !block || tail?.nodeType !== Node.TEXT_NODE) {
              return [];
            }
            const range = document.createRange();
            range.selectNodeContents(tail);
            const saved = (block as HTMLElement).style.width;
            const broken: number[] = [];
            /* Every width a line can end on this abbreviation, not one viewport. */
            for (let width = widths.min; width <= widths.max; width += 1) {
              (block as HTMLElement).style.width = `${width}px`;
              const mark = range.getClientRects()[0];
              if (mark && mark.top >= button.getBoundingClientRect().bottom) {
                broken.push(width);
              }
            }
            (block as HTMLElement).style.width = saved;
            return broken.length > 0
              ? [
                  `${button.textContent?.trim()}${tail.textContent} at ${broken[0]}px`,
                ]
              : [];
          }),
        BLOCK_WIDTHS,
      );
      expect(split, 'punctuation starts a line after its abbreviation').toEqual(
        [],
      );
    });
  }
});
