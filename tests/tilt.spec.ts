import { expect, test } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';

/*
 * `backface-visibility: hidden` makes Chromium rasterise then rotate, blurring
 * the text and icons in the box.
 */

/* Every page tilts something (the footer's tiles); zero means the walk found nothing. */
const MIN_TILTED_PER_ROUTE = 1;

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
        .map(({ element, style }) => ({
          what: `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 3).join('.')}`,
          backface: style.backfaceVisibility,
        })),
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
