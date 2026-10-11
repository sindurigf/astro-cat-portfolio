import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { gotoSettled } from './settle';
import { DIST_DIR, ROUTES } from './routes';
import { NODE } from './tags';
import { metricsOf } from '../scripts/font-fallback-metrics.mjs';

const WEB_FAMILY = 'Lexend Variable';
const FALLBACK_FAMILY = /^Lexend Fallback /;
/* Any weight: Lexend's vertical metrics are the same in every file. */
const LEXEND_FILE =
  'node_modules/@fontsource/lexend/files/lexend-latin-400-normal.woff';
/* The CSS percentages carry two decimals, and two of them multiply. */
const LINE_BOX_TOLERANCE = 0.0002;

/* A phone on a slow connection: where a late font is likeliest and lines are shortest. */
const PHONE = { width: 412, height: 823 };
/*
 * Measured maximum is 0.0112 (/accessibility). Without the fallback faces
 * nine routes exceed this, up to 0.163. Wider viewports are not tested.
 */
const LATE_FONT_SHIFT_CEILING = 0.02;

const builtCss = (): string => {
  const dir = join(DIST_DIR, '_astro');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
};

const unquoted = (value: string): string => value.replace(/["']/g, '').trim();

const fontFaces = (css: string): ReadonlyMap<string, string>[] =>
  [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
    ([, body]) =>
      new Map(
        (body ?? '')
          .split(';')
          .map((declaration) => declaration.split(/:(.*)/s))
          .filter(([name]) => name?.trim())
          .map(([name, value]) => [name!.trim(), unquoted(value ?? '')]),
      ),
  );

const ratio = (face: ReadonlyMap<string, string>, name: string): number =>
  Number.parseFloat(face.get(name) ?? 'NaN') / 100;

test.describe('the fallback faces shown until Lexend arrives', NODE, () => {
  test('each keeps Lexend’s line box and character range', () => {
    const faces = fontFaces(builtCss());
    const web = faces.find((face) => face.get('font-family') === WEB_FAMILY);
    const fallbacks = faces.filter((face) =>
      FALLBACK_FAMILY.test(face.get('font-family') ?? ''),
    );
    expect(web, `the built CSS declares no ${WEB_FAMILY} face.`).toBeDefined();
    expect(
      fallbacks.length,
      'the built CSS declares no fallback face, so a late font swaps against the raw system font.',
    ).toBeGreaterThan(0);

    const lexend = metricsOf(LEXEND_FILE);
    for (const face of fallbacks) {
      const label = `${face.get('font-family')} ${face.get('font-weight')}`;
      const sizeAdjust = ratio(face, 'size-adjust');
      expect
        .soft(
          Math.abs(ratio(face, 'ascent-override') * sizeAdjust - lexend.ascent),
          `${label}: ascent-override times size-adjust is not Lexend's ascent.`,
        )
        .toBeLessThan(LINE_BOX_TOLERANCE);
      expect
        .soft(
          Math.abs(
            ratio(face, 'descent-override') * sizeAdjust - lexend.descent,
          ),
          `${label}: descent-override times size-adjust is not Lexend's descent.`,
        )
        .toBeLessThan(LINE_BOX_TOLERANCE);
      expect
        .soft(
          Math.abs(
            ratio(face, 'line-gap-override') * sizeAdjust - lexend.lineGap,
          ),
          `${label}: line-gap-override times size-adjust is not Lexend's line gap.`,
        )
        .toBeLessThan(LINE_BOX_TOLERANCE);
      expect
        .soft(
          face.get('unicode-range'),
          `${label} covers other characters than Lexend, so they stop reaching the system font.`,
        )
        .toBe(web?.get('unicode-range'));
      expect
        .soft(
          face.get('src'),
          `${label} downloads a file; a fallback must be local.`,
        )
        .not.toMatch(/url\(/);
    }
  });

  test('they follow Lexend in the font stack, before any system font', () => {
    const stack = /--font-sans:([^;}]*)/.exec(builtCss())?.[1];
    expect(stack, 'the built CSS sets no --font-sans.').toBeDefined();
    const families = (stack ?? '').split(',').map(unquoted);
    const fallbackCount = families.filter((family) =>
      FALLBACK_FAMILY.test(family),
    ).length;
    expect(
      fallbackCount,
      '--font-sans names no fallback family.',
    ).toBeGreaterThan(0);
    expect(
      families.slice(0, fallbackCount + 1),
      'the fallback families do not sit directly after Lexend.',
    ).toEqual([
      WEB_FAMILY,
      ...families.filter((family) => FALLBACK_FAMILY.test(family)),
    ]);
  });
});

const LAYOUT_SHIFT = `
  window.__lateFontShift = 0;
  window.__lateFontSources = [];
  window.__lateFontHandle = (entries) => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      window.__lateFontShift += entry.value;
      for (const source of entry.sources ?? []) {
        const el = source.node && (source.node.nodeType === 1 ? source.node : source.node.parentElement);
        window.__lateFontSources.push(
          entry.value.toFixed(4) + ' ' + (el ? el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 3).join('.') : '(removed)'),
        );
      }
    }
  };
  window.__lateFontObserver = new PerformanceObserver((list) => window.__lateFontHandle(list.getEntries()));
  window.__lateFontObserver.observe({ type: 'layout-shift', buffered: true });
`;

test.describe('a font that arrives late', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only',
  );
  test.use({ viewport: PHONE });

  for (const route of ROUTES) {
    test(`${route} barely shifts on a phone when Lexend swaps in`, async ({
      page,
    }) => {
      /* Held until the fallback has painted, so the swap is always measured. */
      await page.route('**/*.woff2', async (request) => {
        await page.waitForFunction(
          () =>
            performance.getEntriesByName('first-contentful-paint').length > 0,
        );
        await request.continue();
      });
      await page.addInitScript(LAYOUT_SHIFT);
      await gotoSettled(page, route);
      await page.waitForFunction(
        (family) =>
          [...document.fonts].some(
            (face) => face.family.includes(family) && face.status === 'loaded',
          ),
        WEB_FAMILY,
      );
      /* The swap lays out on the frame after the font loads. */
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );

      const { shift, sources, paintedFirst } = await page.evaluate(() => {
        const w = window as unknown as {
          __lateFontShift: number;
          __lateFontSources: string[];
          __lateFontObserver: PerformanceObserver;
          __lateFontHandle: (entries: PerformanceEntryList) => void;
        };
        w.__lateFontHandle(w.__lateFontObserver.takeRecords());
        const paint = performance.getEntriesByName('first-contentful-paint')[0];
        const font = performance
          .getEntriesByType('resource')
          .find((entry) => entry.name.endsWith('.woff2')) as
          PerformanceResourceTiming | undefined;
        return {
          shift: w.__lateFontShift,
          sources: w.__lateFontSources,
          paintedFirst:
            paint !== undefined &&
            font !== undefined &&
            paint.startTime < font.responseEnd,
        };
      });
      expect(
        paintedFirst,
        `${route} did not paint before the font arrived, so no swap was measured.`,
      ).toBe(true);
      expect(
        shift,
        `${route} shifted by ${shift.toFixed(4)} when the font swapped in (value, element):\n${sources.join('\n')}`,
      ).toBeLessThanOrEqual(LATE_FONT_SHIFT_CEILING);
    });
  }
});
