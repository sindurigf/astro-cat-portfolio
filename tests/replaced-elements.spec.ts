import { expect, test, type Page } from './test';
import { ROUTES } from './routes';
import { gotoSettled } from './settle';
import { IMAGE_REQUEST } from './html';

/**
 * WebKit draws a failed image square, ignoring its `aspect-ratio`; a wrapper
 * (`.aspect-frame` in src/styles/components/photos.css) keeps the shape. `auto W / H` is the browser's own hint.
 */

const REPLACED = 'img, video, iframe, canvas, embed, object, svg';

/** Rendered width over height, to this many places. */
const PLACES = 2;

const shapes = (page: Page) =>
  page.$$eval('main img', (elements) =>
    elements
      .filter((img): img is HTMLImageElement => img instanceof HTMLImageElement)
      .map((img) => {
        const r = img.getBoundingClientRect();
        return {
          alt: (img.getAttribute('alt') ?? '').slice(0, 40),
          ratio: r.height > 0 ? r.width / r.height : 0,
          src: img.currentSrc,
          loaded: img.naturalWidth > 0,
        };
      }),
  );

/*
 * `complete` is true for loaded and broken images alike, set in the task that
 * fires `error`. Not `networkidle`, which can stall in Firefox with nothing in flight.
 */
const loadEveryImage = async (page: Page) => {
  await page.evaluate(() =>
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      (img as HTMLImageElement).loading = 'eager';
    }),
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('main img')].every(
      (img) => (img as HTMLImageElement).complete,
    ),
  );
};

test.describe('replaced elements', () => {
  for (const route of ROUTES) {
    test(`${route} sets no aspect-ratio on a replaced element`, async ({
      page,
    }) => {
      await gotoSettled(page, route);
      const authored = await page.$$eval(REPLACED, (els) =>
        els
          .filter((el) => !el.closest('svg svg'))
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            ratio: getComputedStyle(el).aspectRatio,
            cls: (el.getAttribute('class') ?? '').slice(0, 80),
          }))
          .filter(
            ({ ratio }) => ratio !== 'auto' && !ratio.startsWith('auto '),
          ),
      );
      expect(
        authored,
        'put the ratio on a wrapper and let the element fill it',
      ).toEqual([]);
    });
    test(`${route} keeps every image's shape when the image fails`, async ({
      page,
      browserName,
    }) => {
      // Only WebKit drops the width and height of an image that failed to load.
      test.skip(browserName !== 'webkit', 'the shape is only lost in WebKit');
      await page.setViewportSize({ width: 1280, height: 900 });
      await gotoSettled(page, route);
      await loadEveryImage(page);
      const loaded = await shapes(page);

      await page.route(IMAGE_REQUEST, (request) => request.abort());
      await gotoSettled(page, route);
      await loadEveryImage(page);
      const failed = await shapes(page);

      expect(
        failed
          .filter((shape) => IMAGE_REQUEST.test(shape.src) && shape.loaded)
          .map((shape) => shape.alt),
        'an image loaded although its request was aborted',
      ).toEqual([]);
      expect(failed.length).toBe(loaded.length);
      const changed = loaded
        .map((shape, i) => ({
          alt: shape.alt,
          loaded: Number(shape.ratio.toFixed(PLACES)),
          failed: Number(failed[i].ratio.toFixed(PLACES)),
        }))
        .filter(({ loaded, failed }) => loaded !== failed);
      expect(changed, 'a failed image drew a different shape').toEqual([]);
    });
  }
});
