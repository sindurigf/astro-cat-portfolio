import { test, expect } from './test';
import { gotoSettled } from './settle';
import { builtHtml } from './routes';
import { NODE } from './tags';

/*
 * The close row's eyebrow sticker sits across the row's top edge; it must never
 * cover the row's text. The row's colours are walked by tests/gold-surface.spec.ts.
 */

/** Every route whose page ends on a CloseRow; the census below keeps it honest. */
const CLOSE_ROW_ROUTES = [
  '/',
  '/about',
  '/blog',
  '/career',
  '/contact/sent',
  '/credits',
] as const;

/* Where the row's padding changes, measured on the tilted box. */
const STICKER_WIDTHS = [305, 390, 1280] as const;

test('CLOSE_ROW_ROUTES lists every built page with a close row', NODE, () => {
  const found = [...builtHtml()]
    .filter(([, html]) => html.includes('data-close-row'))
    .map(([route]) => route)
    .sort();
  expect(found).toEqual([...CLOSE_ROW_ROUTES].sort());
});

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`the close row's sticker in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const route of CLOSE_ROW_ROUTES) {
      test(`${route} keeps its sticker off the text`, async ({ page }) => {
        for (const width of STICKER_WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await gotoSettled(page, route);
          const gap = await page.evaluate(() => {
            const sticker = document.querySelector('[data-close-row]');
            const link = sticker?.parentElement?.querySelector('a');
            if (!sticker || !link) return null;
            return (
              link.getBoundingClientRect().top -
              sticker.getBoundingClientRect().bottom
            );
          });

          expect(gap, `${route} has no close row sticker`).not.toBeNull();
          expect(
            gap!,
            `the sticker on ${route} at ${width}px runs ${(-gap!).toFixed(1)}px into the text`,
          ).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });
}
