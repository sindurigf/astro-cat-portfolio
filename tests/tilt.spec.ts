import { expect, test } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';

/*
 * `backface-visibility: hidden` makes Chromium rasterize then rotate, blurring
 * the text and icons in the box.
 */

/* Every page tilts something (the footer's tiles); zero means the walk found nothing. */

/* Below this an edge and its fill read as one color, so no fringe shows. */
const SAME_COLOR = 1.5;
const MIN_TILTED_PER_ROUTE = 1;

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const route of ROUTES) {
      test(`${route}: no tilted element is drawn as its own layer`, async ({
        page,
      }) => {
        await gotoSettled(page, route);

        const tilted = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('body *')]
            .map((element) => ({ element, style: getComputedStyle(element) }))
            .filter(({ style }) => {
              const angle = parseFloat(style.rotate);
              const matrix = new DOMMatrixReadOnly(
                style.transform === 'none' ? undefined : style.transform,
              );
              return (
                (Number.isFinite(angle) && angle !== 0) ||
                matrix.b !== 0 ||
                matrix.c !== 0
              );
            })
            .map(({ element, style }) => {
              const lum = (color: string) =>
                (color.match(/[\d.]+/g) ?? [])
                  .slice(0, 3)
                  .map(Number)
                  .map((v) => {
                    const c = v / 255;
                    return c <= 0.04045
                      ? c / 12.92
                      : ((c + 0.055) / 1.055) ** 2.4;
                  })
                  .reduce(
                    (sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i],
                    0,
                  );
              const ratio = (a: string, b: string) => {
                const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
                return (hi + 0.05) / (lo + 0.05);
              };
              const alpha = (color: string) => {
                const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
                return parts.length > 3 ? parts[3] : parts.length ? 1 : 0;
              };
              return {
                what: `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 3).join('.')}`,
                backface: style.backfaceVisibility,
                edgedFill:
                  parseFloat(style.borderTopWidth) > 0 &&
                  alpha(style.borderTopColor) > 0 &&
                  alpha(style.backgroundColor) > 0,
                edgeOnFill: ratio(style.borderTopColor, style.backgroundColor),
                clip: style.backgroundClip,
              };
            }),
        );

        expect(
          tilted.length,
          `${route}: no tilted element found, so nothing was checked.`,
        ).toBeGreaterThanOrEqual(MIN_TILTED_PER_ROUTE);

        for (const box of tilted) {
          expect(box.backface, `${route} ${box.what} is its own layer`).toBe(
            'visible',
          );
        }
        /*
         * A tilted border's softened edge shows what is under it: a fill of another
         * color as an outer fringe, or, when the fill is clipped short of a border
         * of its own color, the ground as an inner seam.
         */
        for (const box of tilted.filter((b) => b.edgedFill)) {
          const matching = box.edgeOnFill < SAME_COLOR;
          expect(
            box.clip,
            matching
              ? `${route} ${box.what} clips its fill short of a border of its own color, leaving a seam`
              : `${route} ${box.what} paints its fill under a border of another color, leaving a fringe`,
          ).toBe(matching ? 'border-box' : 'padding-box');
        }
      });
    }
  });
}

/*
 * Tilted text is capped at a sticker's one to three words: tilted sentences
 * slow reading, most for low vision and dyslexia. Descendants count.
 */
const MAX_TILTED_WORDS = 3;

for (const route of ROUTES) {
  test(`${route}: tilted text is a short label`, async ({ page }) => {
    await gotoSettled(page, route);

    const long = await page.evaluate((max) => {
      const tilted = (element: Element): boolean => {
        const style = getComputedStyle(element);
        const angle = parseFloat(style.rotate);
        const matrix = new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform,
        );
        return (
          (Number.isFinite(angle) && angle !== 0) ||
          matrix.b !== 0 ||
          matrix.c !== 0
        );
      };
      const words = (text: string | null | undefined): string[] =>
        (text ?? '').split(/\s+/).filter(Boolean);
      // An SVG element tilts too and has no innerText.
      const textOf = (element: Element): string =>
        (element as HTMLElement).innerText ?? element.textContent ?? '';
      // Visually hidden text completes a link's name; nobody reads it tilted.
      const shownWords = (element: Element): number =>
        words(textOf(element)).length -
        [...element.querySelectorAll('.sr-only')].reduce(
          (sum, hidden) => sum + words(textOf(hidden)).length,
          0,
        );
      return [...document.querySelectorAll('body *')]
        .filter(tilted)
        .filter((element) => shownWords(element) > max)
        .map((element) => textOf(element).trim());
    }, MAX_TILTED_WORDS);

    expect(
      long,
      `${route}: text longer than ${MAX_TILTED_WORDS} words is tilted`,
    ).toEqual([]);
  });
}
