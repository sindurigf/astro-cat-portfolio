import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from './test';
import { AA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { BLOG_FEATURES_COVER, builtHtml, PHOTO_POST_ROUTES } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';
import { IMAGE_REQUEST } from './html';
import { DESKTOP_VIEWPORT, REFLOW_VIEWPORT } from './wcag';

/**
 * docs/STYLEGUIDE.md "Photo frames and the failed-photo state"
 * (src/scripts/failed-images.ts), with every image request aborted, at 320px
 * and 200% zoom (640 CSS px at 2x).
 */

/* Routes whose build has a framed photo; the last test keeps this honest. */
const FRAME_ROUTES = [
  '/',
  '/about',
  '/brand',
  ...(BLOG_FEATURES_COVER ? ['/blog'] : []),
  ...PHOTO_POST_ROUTES,
];

/* How long to hold the page's scripts back so the images fail first. */
const SCRIPT_DELAY_MS = 1_500;

const VIEWS = [
  { label: '320px', width: REFLOW_VIEWPORT.width, scale: 1 },
  { label: '200% zoom', width: 640, scale: 2 },
] as const;

const HEIGHT = 900;

/** Sub-pixel rounding at the frame's edge, in CSS px. */
const TOLERANCE = 1;

type Frame = {
  alt: string;
  settled: boolean;
  marked: boolean;
  text: string | null;
  hidden: string | null;
  imageOpacity: number;
  inside: boolean;
  textRatio: number | null;
  border: number;
  borderRatio: number | null;
  fill: string;
};

const readFrames = (page: Page) =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    return [...document.querySelectorAll('main .aspect-frame')]
      .filter((frame) => frame.getBoundingClientRect().width > 0)
      .map((frame) => {
        const img = frame.querySelector(':scope > img, :scope > picture > img');
        const text = frame.querySelector(':scope > .aspect-frame-alt');
        const box = frame.getBoundingClientRect();
        const style = getComputedStyle(frame);
        const border = parseFloat(style.borderTopWidth);
        const t = text ? text.getBoundingClientRect() : null;
        return {
          alt: img.alt.trim(),
          settled: img.complete,
          marked: 'failed' in frame.dataset,
          text: text ? text.textContent : null,
          hidden: text ? text.getAttribute('aria-hidden') : null,
          imageOpacity: Number(getComputedStyle(img).opacity),
          /* Painted lines, not scrollHeight: a clamped alt always scrolls by design. */
          inside: t === null || (
            t.bottom <= box.bottom + ${TOLERANCE} &&
            t.right <= box.right + ${TOLERANCE} &&
            (() => {
              const range = document.createRange();
              range.selectNodeContents(text);
              return [...range.getClientRects()]
                .filter((line) => line.top < t.bottom - ${TOLERANCE})
                .every((line) => line.bottom <= t.bottom + ${TOLERANCE});
            })()
          ),
          textRatio: text
            ? ratio(parse(getComputedStyle(text).color), effectiveBackground(text))
            : null,
          border,
          borderRatio: border > 0
            ? ratio(parse(style.borderTopColor), effectiveBackground(frame.parentElement))
            : null,
          fill: style.backgroundColor,
        };
      });
  })()`) as Promise<Frame[]>;

/** A framed photo's <img>, bare or inside the <picture> that offers AVIF. */
const PHOTO = '.aspect-frame > img, .aspect-frame > picture > img';

/* Settled once requested and done, loaded or broken: `networkidle` comes before Firefox requests a lazy photo. */
const settled = (selector: string) =>
  [...document.querySelectorAll<HTMLImageElement>(selector)].every(
    (img) => img.currentSrc !== '' && img.complete,
  );

const loadEveryPhoto = async (page: Page) => {
  await page.evaluate(() =>
    document.querySelectorAll('main img[loading="lazy"]').forEach((img) => {
      (img as HTMLImageElement).loading = 'eager';
    }),
  );
  await page.waitForFunction(settled, `main :is(${PHOTO})`);
};

/* A talk hides inactive slides, so each slide with a photo is opened by hash. */
const framesOnEveryScreen = async (page: Page): Promise<Frame[]> => {
  if (await page.locator('[data-deck]').count()) {
    await page.waitForSelector('[data-deck-ready]');
  }
  const slides = await page.$$eval('[data-deck-ready] .slide', (all) =>
    all.filter((s) => s.querySelector('.aspect-frame')).map((s) => s.id),
  );
  if (slides.length === 0) {
    await loadEveryPhoto(page);
    return readFrames(page);
  }
  const frames: Frame[] = [];
  for (const id of slides) {
    await page.evaluate((hash) => (location.hash = hash), id);
    await page.waitForFunction(
      (slide) =>
        [...document.querySelectorAll(`#${slide} img`)].every(
          (img) => (img as HTMLImageElement).complete,
        ),
      id,
    );
    frames.push(...(await readFrames(page)));
  }
  return frames;
};

/*
 * Every context a test opens, closed after it whether it passed or failed: a
 * failed expect leaves the test before any close written at its end.
 */
const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

const open = async (
  browser: Browser,
  width: number,
  scale: number,
  javaScriptEnabled = true,
) => {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: scale,
    javaScriptEnabled,
  });
  opened.push(context);
  return { page: await context.newPage() };
};

for (const { label, width, scale } of VIEWS) {
  test.describe(`a failed photo at ${label}`, () => {
    for (const route of FRAME_ROUTES) {
      test(`${route} shows each failed photo's alt text on its frame`, async ({
        browser,
      }) => {
        const { page } = await open(browser, width, scale);
        await page.route(IMAGE_REQUEST, (request) => request.abort());
        await gotoSettled(page, route);

        /* WebKit can report `img.complete` before it fires the error that marks the frame. */
        let frames: Frame[] = [];
        await expect
          .poll(
            async () => {
              frames = await framesOnEveryScreen(page);
              return frames.filter((f) => !f.marked).map((f) => f.alt);
            },
            { message: `${route} has a failed photo the script never marked` },
          )
          .toEqual([]);
        expect(frames.length, `${route} has no framed photo`).toBeGreaterThan(
          0,
        );
        expect(
          frames.filter((f) => !f.settled).map((f) => f.alt),
          `${route} has a photo that never finished failing`,
        ).toEqual([]);

        for (const frame of frames) {
          const name = frame.alt.slice(0, 40) || '(decorative)';
          expect(frame.imageOpacity, `${name}: image not faded`).toBe(0);
          if (frame.border > 0) {
            expect(
              frame.borderRatio,
              `${name}: frame border against its ground`,
            ).toBeGreaterThanOrEqual(NON_TEXT);
          }
          if (frame.alt === '') continue;
          expect(frame.text, `${name}: alt text not shown`).toBe(frame.alt);
          expect(frame.hidden, `${name}: the copy is announced twice`).toBe(
            'true',
          );
          expect(frame.inside, `${name}: text runs out of the frame`).toBe(
            true,
          );
          expect(
            frame.textRatio,
            `${name}: text against the frame fill`,
          ).toBeGreaterThanOrEqual(AA_TEXT);
        }
      });
    }
  });
}

/* Swapped into the About panorama, the smallest frame (224x126 at 320px). */
const LONG_ALT = Array.from(
  { length: 3 },
  () =>
    'Several cats of different colours lying together on a long sofa in the afternoon sun, one of them holding a toy mouse, with more cats behind them on the stairs.',
).join(' ');
const PANORAMA_ALT = /alt="A calico cat lying on a paisley pillow[^"]*"/;

for (const { label, width, scale } of VIEWS) {
  test(`a long alt text is clamped inside the smallest frame at ${label}`, async ({
    browser,
  }) => {
    const { page } = await open(browser, width, scale);
    await page.route(IMAGE_REQUEST, (request) => request.abort());
    await page.route(
      (url) => url.pathname.replace(/\/$/, '') === '/about',
      async (request) => {
        const response = await request.fetch();
        const body = (await response.text()).replace(
          PANORAMA_ALT,
          `alt="${LONG_ALT}"`,
        );
        await request.fulfill({ response, body });
      },
    );
    await gotoSettled(page, '/about');
    const frame = page.locator('main .aspect-frame', {
      has: page.locator('img[alt^="Several cats of different colours"]'),
    });
    await frame.scrollIntoViewIfNeeded();

    const found = await frame
      .locator('.aspect-frame-alt')
      .evaluate((text, edge) => {
        const box = text.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
        const lines = Number(
          getComputedStyle(text).getPropertyValue('--alt-lines'),
        );
        /* The same text unclamped, at the same width, to count its lines. */
        const copy = text.cloneNode(true) as HTMLElement;
        copy.style.setProperty('display', 'block');
        copy.style.setProperty('-webkit-line-clamp', 'none');
        copy.style.setProperty('visibility', 'hidden');
        text.after(copy);
        const needed = Math.round(
          copy.getBoundingClientRect().height / lineHeight,
        );
        copy.remove();

        const range = document.createRange();
        range.selectNodeContents(text);
        /* Every line box that paints inside the text's own clip. */
        const painted = [...range.getClientRects()].filter(
          (line) => line.top < box.bottom - edge,
        );
        return {
          lines,
          needed,
          overhang: Math.max(
            ...painted.map((line) => line.bottom - box.bottom),
          ),
        };
      }, TOLERANCE);
    expect(
      found.needed,
      'the long alt fits without clamping, so nothing is tested',
    ).toBeGreaterThan(found.lines);
    expect(
      found.overhang,
      'a line shows below the ellipsis, cut by the clip',
    ).toBeLessThanOrEqual(TOLERANCE);
  });
}

test.describe('the failed-photo script', () => {
  test('marks a photo that failed before the script ran', async ({
    browser,
  }) => {
    const { page } = await open(browser, DESKTOP_VIEWPORT.width, 1);
    await page.route(IMAGE_REQUEST, (request) => request.abort());
    await page.route('**/_astro/*.js', async (request) => {
      await new Promise((resolve) => setTimeout(resolve, SCRIPT_DELAY_MS));
      await request.continue();
    });
    await page.addInitScript(() => {
      const w = window as unknown as { failedEarly: number };
      w.failedEarly = 0;
      document.addEventListener(
        'error',
        (event) => {
          if (event.target instanceof HTMLImageElement) w.failedEarly += 1;
        },
        true,
      );
    });
    await page.goto('/about', { waitUntil: 'load' });
    await page.waitForFunction(settled, `main > .page-hero :is(${PHOTO})`);

    const early = await page.evaluate(
      () => (window as unknown as { failedEarly: number }).failedEarly,
    );
    expect(early, 'no photo failed before the script ran').toBeGreaterThan(0);

    const hero = await page
      .locator('main > .page-hero .aspect-frame')
      .evaluate((frame) => 'failed' in (frame as HTMLElement).dataset);
    expect(hero, 'the eager hero photo failed early and was missed').toBe(true);
  });

  test('marks the About cat card photo, rendered after load', async ({
    browser,
  }) => {
    const { page } = await open(browser, DESKTOP_VIEWPORT.width, 1);
    await page.route(
      (url) =>
        IMAGE_REQUEST.test(url.pathname) &&
        url.pathname.includes('cat-card-tabby'),
      (request) => request.abort(),
    );
    await gotoSettled(page, '/about');
    await page.locator('#cat-spot-pepper .cat-button').focus();
    await page.keyboard.press('Enter');

    const frame = page
      .getByRole('dialog', { name: 'Pepper' })
      .locator('.aspect-frame');
    await expect(
      frame,
      'the cat card photo failed and was never marked',
    ).toHaveAttribute('data-failed', '');
    const alt = (await frame.locator('img').getAttribute('alt')) ?? '';
    expect(alt, 'the cat card photo has no alt text').not.toBe('');
    const copy = frame.locator('.aspect-frame-alt');
    await expect(copy, 'alt text not shown').toHaveText(alt);
    await expect(copy, 'the copy is announced twice').toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  for (const route of FRAME_ROUTES) {
    test(`${route} never marks a photo that loaded`, async ({ browser }) => {
      const { page } = await open(browser, DESKTOP_VIEWPORT.width, 1);
      await gotoSettled(page, route);
      const marked = (await framesOnEveryScreen(page)).filter((f) => f.marked);
      expect(marked.map((f) => f.alt)).toEqual([]);
    });
  }

  for (const route of FRAME_ROUTES) {
    test(`${route} without JavaScript keeps the browser's own state on the fill`, async ({
      browser,
    }) => {
      const { page } = await open(browser, 320, 1, false);
      await page.route(IMAGE_REQUEST, (request) => request.abort());
      await page.goto(route, { waitUntil: 'load' });
      const frames = await readFrames(page);
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) {
        const name = frame.alt.slice(0, 40) || '(decorative)';
        expect(frame.marked, `${name}: marked without the script`).toBe(false);
        expect(frame.imageOpacity, `${name}: image hidden`).toBe(1);
        expect(frame.fill, `${name}: frame has no opaque fill`).toMatch(
          /^rgb\(/,
        );
      }
    });
  }
});

test('FRAME_ROUTES lists every built page with a framed photo', NODE, () => {
  const found = [...builtHtml()]
    .filter(([, html]) => /class="[^"]*\baspect-frame\b/.test(html))
    .map(([route]) => route);
  expect(found.sort()).toEqual([...FRAME_ROUTES].sort());
});
