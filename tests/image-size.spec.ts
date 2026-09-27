import { expect, test, type Page } from './test';
import { builtHtml, SAMPLED_ROUTES } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/*
 * Guards both directions: a master file served to a thumbnail, and a Tailwind
 * size class grown without the height passed to <Image> (src/lib/image-densities.ts).
 * Layout boxes, not bounding rects, because some images are rotated.
 */

/** Multiple of drawn size times `devicePixelRatio`. Loose on purpose: it targets 10x to 20x errors. */
const OVERSIZE_LIMIT = 1.5;

/** Integer rounding between a generated file and a fractional layout box. */
const ROUNDING_PX = 1;

const DIMENSIONS = [
  { drawn: 'width', natural: 'naturalWidth' },
  { drawn: 'height', natural: 'naturalHeight' },
] as const;

const measureImages = (page: Page) =>
  page.evaluate(async () => {
    const all = [...document.querySelectorAll('img')];
    for (const img of all) img.loading = 'eager';
    await Promise.all(all.map((img) => img.decode()));
    /*
     * A probe with a plain `src`: an `<img>` with width descriptors reports its
     * natural size divided by the picked density, which hides every upscale.
     */
    const filePixels = async (src: string) => {
      const probe = new Image();
      probe.src = src;
      await probe.decode();
      return { width: probe.naturalWidth, height: probe.naturalHeight };
    };
    const drawn = all.filter(
      (img) => img.offsetWidth > 0 && img.offsetHeight > 0,
    );
    return {
      ratio: window.devicePixelRatio,
      images: await Promise.all(
        drawn.map(async (img) => {
          const file = await filePixels(img.currentSrc);
          return {
            src: img.currentSrc,
            naturalWidth: file.width,
            naturalHeight: file.height,
            width: img.offsetWidth,
            height: img.offsetHeight,
          };
        }),
      ),
    };
  });

type MeasuredImage = Awaited<
  ReturnType<typeof measureImages>
>['images'][number];

const expectServedAtDrawnSize = (image: MeasuredImage, ratio: number): void => {
  const where =
    `${image.src} is drawn ${image.width}x${image.height} from a ` +
    `${image.naturalWidth}x${image.naturalHeight} file`;

  for (const { drawn, natural } of DIMENSIONS) {
    expect
      .soft(image[natural] + ROUNDING_PX, `${where}, so it is being stretched.`)
      .toBeGreaterThanOrEqual(image[drawn]);

    expect
      .soft(
        image[natural],
        `${where} at devicePixelRatio ${ratio}, more than ${OVERSIZE_LIMIT}x what this screen can show.`,
      )
      .toBeLessThanOrEqual(image[drawn] * ratio * OVERSIZE_LIMIT + ROUNDING_PX);
  }
};

for (const route of SAMPLED_ROUTES) {
  test(`every image on ${route} is served at the size it is drawn`, async ({
    page,
  }) => {
    await gotoSettled(page, route);

    const { ratio, images } = await measureImages(page);

    expect(
      images.length,
      'no image is drawn on this page, though the header mark is on every route.',
    ).toBeGreaterThan(0);

    for (const image of images) expectServedAtDrawnSize(image, ratio);
  });
}

/*
 * The test above allows 1.5x, so an oversized `sizes` still passes it. Not
 * `sizes="auto"`: Chromium resolves it to 100vw for any image that is not lazy.
 */

/** Each Tailwind breakpoint the photos change column at, from both sides. */
const SIZES_VIEWPORTS = [320, 639, 640, 767, 768, 1023, 1024, 1327, 1328, 1600];

/**
 * How far `sizes` may run over the drawn width. The fitted values sit within
 * 1.04; this leaves room for a scrollbar without letting `100vw` back in.
 */
const SIZES_LIMIT = 1.1;

const measureFluidImages = (page: Page) =>
  page.evaluate(() => {
    const topLevel = (value: string): string[] => {
      const parts = [''];
      let depth = 0;
      for (const char of value) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) parts.push('');
        else parts[parts.length - 1] += char;
      }
      return parts.map((part) => part.trim());
    };

    const resolve = (sizes: string): number => {
      const entry = topLevel(sizes).find((candidate) => {
        const media = candidate.match(/^(\([^()]*\))\s+/);
        return media === null || matchMedia(media[1]).matches;
      });
      const probe = document.createElement('div');
      probe.style.width = (entry ?? '100vw').replace(/^\([^()]*\)\s+/, '');
      document.body.append(probe);
      const slot = probe.getBoundingClientRect().width;
      probe.remove();
      return slot;
    };

    return [...document.querySelectorAll('img[sizes]')]
      .map((img, index) => ({ img, index }))
      .filter(({ img }) => img instanceof HTMLImageElement)
      .filter(({ img }) => (img as HTMLImageElement).offsetWidth > 0)
      .map(({ img: element, index }) => ({
        img: element as HTMLImageElement,
        index,
      }))
      .map(({ img, index }) => ({
        index,
        src: img.getAttribute('src'),
        sizes: img.getAttribute('sizes') ?? '',
        drawn: img.offsetWidth,
        slot: resolve(img.getAttribute('sizes') ?? ''),
      }));
  });

type FluidImage = Awaited<ReturnType<typeof measureFluidImages>>[number];

const expectSizesFitDrawnWidth = (image: FluidImage, width: number): void => {
  const where =
    `${image.src} at ${width}px is drawn ${image.drawn}px wide and its ` +
    `sizes resolves to ${image.slot.toFixed(1)}px (${image.sizes})`;

  expect
    .soft(
      image.slot + ROUNDING_PX,
      `${where}, so the browser picks a file too small and stretches it.`,
    )
    .toBeGreaterThanOrEqual(image.drawn);

  expect
    .soft(
      image.slot,
      `${where}, more than ${SIZES_LIMIT}x, so a larger file is fetched than drawn.`,
    )
    .toBeLessThanOrEqual(image.drawn * SIZES_LIMIT + ROUNDING_PX);
};

const FLUID_IMG = /<img\b[^>]*\bsizes="/g;

test('the build ships fluid images for the sizes walk to measure', NODE, () => {
  const total = [...builtHtml().values()].reduce(
    (sum, html) => sum + (html.match(FLUID_IMG) ?? []).length,
    0,
  );
  expect(total, 'no built page has an img[sizes] to measure.').toBeGreaterThan(
    0,
  );
});

for (const route of SAMPLED_ROUTES) {
  test(`every fluid image on ${route} names its drawn width in sizes`, async ({
    page,
  }) => {
    await gotoSettled(page, route);

    const measured = new Set<number>();
    const measureAtEveryWidth = async () => {
      for (const width of SIZES_VIEWPORTS) {
        await page.setViewportSize({
          width,
          height: page.viewportSize()!.height,
        });

        const images = await measureFluidImages(page);
        for (const image of images) {
          measured.add(image.index);
          expectSizesFitDrawnWidth(image, width);
        }
      }
    };
    await measureAtEveryWidth();

    // A scripted slideshow draws one slide at a time, so open each slide with a photo.
    const slides = await page.evaluate(() =>
      [...document.querySelectorAll('.slide[id]')]
        .filter((slide) => slide.querySelector('img[sizes]') !== null)
        .map((slide) => slide.id),
    );
    for (const slide of slides) {
      await gotoSettled(page, `${route}/#${slide}`);
      await page.waitForSelector('[data-deck-ready]');
      await measureAtEveryWidth();
    }

    // Every fluid image the build ships must have been drawn and measured.
    const built = (builtHtml().get(route)?.match(FLUID_IMG) ?? []).length;
    expect(
      measured.size,
      `${route} ships ${built} img[sizes] but only ${measured.size} were drawn and measured.`,
    ).toBe(built);
  });
}
