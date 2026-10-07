import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/*
 * SC 1.4.4: 2x must be reachable "in some way", not at 200% zoom
 * (https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html). Page zoom
 * keeps 1rem at 16 CSS px and divides the viewport by the zoom factor.
 */

const GLOBAL_CSS = readFileSync(
  new URL('../src/styles/global.css', import.meta.url),
  'utf8',
);

/** Text tokens whose size follows the viewport; rem-only tokens scale 1:1. */
const VIEWPORT_TEXT_TOKENS = [
  ...GLOBAL_CSS.matchAll(/^\s*(--text-[a-z0-9-]+):[^;]*\b[\d.]+(?:vw|svh)\b/gm),
].map((match) => match[1]);

/** Phone, small laptop, laptop, desktop; heights set the svh terms. */
const WINDOWS = [
  { width: 390, height: 844 },
  { width: 1000, height: 800 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const;

/** Each browser's own zoom steps above 100%, up to its ceiling. */
const ZOOM_LEVELS = {
  chromium: [1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5],
  firefox: [1.1, 1.2, 1.33, 1.5, 1.7, 2, 2.4, 3, 4, 5],
  webkit: [1.15, 1.25, 1.5, 1.75, 2, 2.5, 3],
} as const;

const TARGET_SCALE = 2;
/* The hero h1 tokens reach exactly 2x at 500%; this absorbs sub-pixel rounding only. */
const ROUNDING_TOLERANCE = 0.01;

/** Fewer tokens than this means the pattern stopped matching global.css. */
const FEWEST_TOKENS = 20;

const tokenSizes = (page: Page): Promise<number[]> =>
  page.evaluate((tokens) => {
    const probe = document.createElement('div');
    document.body.append(probe);
    const sizes = tokens.map((token) => {
      probe.style.fontSize = `var(${token})`;
      return parseFloat(getComputedStyle(probe).fontSize);
    });
    probe.remove();
    return sizes;
  }, VIEWPORT_TEXT_TOKENS);

test('the viewport text tokens are found in global.css', NODE, () => {
  expect(
    VIEWPORT_TEXT_TOKENS.length,
    `only ${VIEWPORT_TEXT_TOKENS.length} viewport text tokens matched in global.css`,
  ).toBeGreaterThanOrEqual(FEWEST_TOKENS);
});

for (const { width, height } of WINDOWS) {
  test(`every viewport text token reaches 2x by page zoom at ${width}px`, async ({
    page,
    browserName,
  }, testInfo) => {
    const levels = ZOOM_LEVELS[browserName as keyof typeof ZOOM_LEVELS];

    await page.setViewportSize({ width, height });
    await gotoSettled(page, '/');
    const base = await tokenSizes(page);

    const lowest: (number | null)[] = base.map(() => null);
    for (const zoom of levels) {
      await page.setViewportSize({
        width: Math.round(width / zoom),
        height: Math.round(height / zoom),
      });
      const zoomed = await tokenSizes(page);
      zoomed.forEach((size, i) => {
        if (
          lowest[i] === null &&
          size * zoom >= TARGET_SCALE * base[i] - ROUNDING_TOLERANCE
        ) {
          lowest[i] = zoom;
        }
      });
    }

    const report = VIEWPORT_TEXT_TOKENS.map(
      (token, i) =>
        `${token}: ${base[i]}px, 2x at ${lowest[i] === null ? 'none' : `${Math.round(lowest[i] * 100)}%`}`,
    );
    testInfo.annotations.push({
      type: 'lowest zoom reaching 2x',
      description: report.join('; '),
    });

    /* Safari stops at 300%, short of what some tokens need; recorded, not asserted. */
    if (browserName === 'webkit') return;

    expect(
      report.filter((line) => line.endsWith('none')),
      `text that never reaches 2x by ${Math.round(levels.at(-1)! * 100)}% zoom at ${width}px`,
    ).toEqual([]);
  });
}
