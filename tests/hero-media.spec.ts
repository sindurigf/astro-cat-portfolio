import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';

/*
 * The hero canvases follow media changes that resize nothing: a window moved
 * to a denser screen, and forced colors switched on and off.
 */
const HERO_ROUTE = '/';
const VIEWPORT = { width: 1280, height: 720 } as const;
/** `MAX_PIXEL_RATIO` in image-densities.ts caps the backing store at 2x. */
const DENSER = 2;

const backStore = (page: Page) =>
  page.evaluate(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>('.hero-field-layer');
    if (!canvas) return null;
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    const strip = ctx?.getImageData(
      0,
      Math.floor(height * 0.6),
      width,
      Math.max(1, Math.floor(height * 0.1)),
    ).data;
    let ink = 0;
    for (let i = 3; i < (strip?.length ?? 0); i += 4) ink += strip![i]!;
    return {
      width,
      cssWidth: canvas.clientWidth,
      ratio: window.devicePixelRatio,
      ink,
    };
  });

test.describe('the hero after a media change', () => {
  test.use({ viewport: VIEWPORT, reducedMotion: 'reduce' });

  test('repaints at the new pixel ratio when only the ratio changes', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'only Chromium can change the device pixel ratio of an open page (CDP)',
    );
    /* CDP's override flips a resolution query's `matches` but dispatches no `change`. */
    await page.addInitScript(() => {
      const queries: MediaQueryList[] = [];
      const native = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const list = native(query);
        if (query.includes('resolution')) queries.push(list);
        return list;
      };
      Object.assign(window, { resolutionQueries: queries });
    });
    await gotoSettled(page, HERO_ROUTE);
    const before = await backStore(page);
    expect(before, 'the hero canvases are not in the page').not.toBeNull();
    expect(before!.ratio, 'the page did not start at 1x').toBe(1);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...VIEWPORT,
      deviceScaleFactor: DENSER,
      mobile: false,
    });
    const changed = await page.evaluate(() => {
      const queries = (
        window as unknown as { resolutionQueries: MediaQueryList[] }
      ).resolutionQueries;
      const stale = queries.filter((query) => !query.matches);
      stale.forEach((query) => query.dispatchEvent(new Event('change')));
      return { dpr: window.devicePixelRatio, stale: stale.length };
    });
    expect(changed.dpr, 'the override did not change the pixel ratio').toBe(
      DENSER,
    );
    expect(
      changed.stale,
      'the hero watches no resolution query the new ratio stopped matching',
    ).toBeGreaterThan(0);

    await expect
      .poll(async () => (await backStore(page))!.width, {
        message: 'the backing store kept its old pixel ratio',
      })
      .toBe(Math.round(before!.cssWidth * DENSER));
    expect(
      (await backStore(page))!.ink,
      'the field is blank after the pixel ratio changed',
    ).toBeGreaterThan(0);
  });

  test('is hidden in forced colors and painted again after them', async ({
    page,
  }) => {
    await gotoSettled(page, HERO_ROUTE);
    const field = page.locator('.hero-field');

    await page.emulateMedia({ forcedColors: 'active' });
    await expect(field, 'a canvas cannot follow forced colors').toBeHidden();

    await page.emulateMedia({ forcedColors: 'none' });
    await expect(field).toBeVisible();
    await expect
      .poll(async () => (await backStore(page))?.ink ?? 0, {
        message: 'the field came back blank after forced colors ended',
      })
      .toBeGreaterThan(0);
  });
});
