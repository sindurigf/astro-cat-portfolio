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

/* Static, so `--list` works before a build; the first test keeps it complete. */
const ABBR_ROUTES = [
  '/accessibility',
  '/brand',
  '/brand/accessibility',
  '/brand/cards',
  '/brand/template',
  '/credits',
  '/privacy',
];

test('every page with an Abbr is in ABBR_ROUTES', NODE, () => {
  const unlisted = [...builtHtml()]
    .filter(
      ([route, html]) =>
        html.includes('abbr-unit') && !ABBR_ROUTES.includes(route),
    )
    .map(([route]) => route);
  expect(unlisted, 'add these routes to ABBR_ROUTES').toEqual([]);
});

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

  for (const route of ABBR_ROUTES) {
    test(route, async ({ page }) => {
      await gotoSettled(page, route);
      expect(
        await page.locator('.abbr-unit').count(),
        `${route} has no Abbr`,
      ).toBeGreaterThan(0);
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

/*
 * A browser without popovers: the script unwraps the button and the expansion
 * reads inline inside the nowrap unit, so `.abbr-tip` must wrap (SC 1.4.10).
 */
const withoutPopovers = (): void => {
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
  document.addEventListener('DOMContentLoaded', () => {
    for (const tip of document.querySelectorAll('[popover]')) {
      tip.removeAttribute('popover');
    }
  });
};

test.describe('without popovers the inline expansion wraps at 320px (SC 1.4.10)', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  for (const route of ABBR_ROUTES) {
    test(route, async ({ page }) => {
      await page.addInitScript(withoutPopovers);
      await gotoSettled(page, route);
      const layout = await page.evaluate(() => ({
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        unwrapped: document.querySelectorAll('[data-abbr] button').length,
        tooWide: [...document.querySelectorAll<HTMLElement>('.abbr-tip')]
          .filter((tip) => {
            const block = tip.closest('p, li, dd, h2, h3');
            const limit = block?.getBoundingClientRect().right ?? Infinity;
            return [...tip.getClientRects()].some((r) => r.right > limit + 1);
          })
          .map((tip) => tip.textContent?.trim()),
      }));
      expect(layout.unwrapped, 'the script should unwrap every button').toBe(0);
      expect(layout.tooWide, 'an expansion runs past its line').toEqual([]);
      expect(
        layout.pageOverflow,
        'the page scrolls sideways',
      ).toBeLessThanOrEqual(0);
    });
  }
});
