import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { builtHtml, DIST_DIR, ROUTES } from './routes';
import { LAYOUT_SHIFT, layoutShiftOf } from './layout-shift';
import { NODE } from './tags';
import { ANALYTICS_ON } from '../src/lib/analytics-site';

/*
 * Only measures that are machine-independent: load time depends on the runner,
 * so it is checked with Lighthouse on the live site (docs/DEPLOYMENT.md).
 */

/* Decoded script bytes. `/` and `/about` carry Vue. */
const ROUTE_SCRIPT_BUDGETS: Readonly<Record<string, number>> = {
  '/': 97_000,
  '/about': 124_900,
};
const PAGE_SCRIPT_BUDGET = 14_000;
/* On every route once `analytics` is set: /vendor/umami.js and the click tracker. */
const ANALYTICS_SCRIPT_BUDGET = 6_400;

const scriptBudget = (route: string): number =>
  (ROUTE_SCRIPT_BUDGETS[route] ?? PAGE_SCRIPT_BUDGET) +
  (ANALYTICS_ON ? ANALYTICS_SCRIPT_BUDGET : 0);

/* Decoded bytes of the stylesheets a page links plus its inline `<style>`. Every route links the one sheet. */
const PAGE_STYLE_BUDGET = 120_000;

const STYLESHEET_HREF = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g;
const INLINE_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/g;

const styleBytes = (html: string): number => {
  const linked = [...html.matchAll(STYLESHEET_HREF)].map(
    ([, href]) => readFileSync(join(DIST_DIR, href ?? '')).length,
  );
  const inline = [...html.matchAll(INLINE_STYLE)].map(([, css]) =>
    Buffer.byteLength(css ?? ''),
  );
  return [...linked, ...inline].reduce((sum, bytes) => sum + bytes, 0);
};

const scriptsFetched = async (
  page: Page,
  route: string,
): Promise<readonly { readonly file: string; readonly bytes: number }[]> => {
  const pending: Promise<{ file: string; bytes: number }>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return;
    pending.push(
      response.body().then((body) => ({
        file: new URL(response.url()).pathname,
        bytes: body.length,
      })),
    );
  });
  /* One cold load: a reload would count every script twice. */
  await gotoSettled(page, route, { webFont: false });
  return Promise.all(pending);
};

test.describe('style weight', NODE, () => {
  test('no page ships more CSS than its budget', () => {
    const pages = [...builtHtml()].map(([route, html]) => ({
      route,
      bytes: styleBytes(html),
    }));
    expect(pages.length, 'no built page was measured').toBeGreaterThan(0);
    expect(
      pages.every((page) => page.bytes > 0),
      'a page links no stylesheet the build wrote, so its CSS went unmeasured.',
    ).toBe(true);
    expect(
      pages
        .filter((page) => page.bytes > PAGE_STYLE_BUDGET)
        .map((page) => `${page.route} ${page.bytes}`),
      `these pages ship more than ${PAGE_STYLE_BUDGET} bytes of CSS.`,
    ).toEqual([]);
  });
});

test.describe('page weight and stability', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only, and script bytes do not vary by engine',
  );

  for (const route of ROUTES) {
    test(`${route} stays within its script budget`, async ({ page }) => {
      const scripts = await scriptsFetched(page, route);
      const total = scripts.reduce((sum, script) => sum + script.bytes, 0);
      const budget = scriptBudget(route);

      expect(
        total,
        `${route} fetched ${total} bytes of script against a budget of ${budget}:\n` +
          scripts.map((s) => `  ${s.file} ${s.bytes}`).join('\n'),
      ).toBeLessThanOrEqual(budget);
    });

    /* Zero, not Lighthouse's 0.1: every route measures 0. */
    test(`${route} does not shift while it loads`, async ({ page }) => {
      await page.addInitScript(LAYOUT_SHIFT);
      /* The cold load is the one measured, not a warm reload. */
      await gotoSettled(page, route, { webFont: false });
      /* Chromium measures a shift between painted frames; headless can settle before its first paint. */
      await page.waitForFunction(
        () => performance.getEntriesByName('first-contentful-paint').length > 0,
      );

      const { shift, sources } = await layoutShiftOf(page);
      expect(
        shift,
        `${route} shifted its layout while loading (value, element, x,y,w,h before -> after):\n${sources.join('\n')}`,
      ).toBe(0);
    });
  }

  /* The 404 page's script fills in the page a mistyped address meant, after first paint. */
  /* A short title and one long enough to need the clamp at a phone width. */
  const MISTYPED = [
    '/blgo/how-i-get-to-know-a-new-ilsand',
    '/blog/sample-tlak',
  ];
  for (const [address, width] of MISTYPED.flatMap((typo) =>
    [390, 768, 1024, 1280].map((w) => [typo, w] as const),
  )) {
    test(`the 404 page for ${address} does not shift at ${width}px`, async ({
      page,
      browser,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(LAYOUT_SHIFT);
      await page.goto(address, { waitUntil: 'networkidle' });
      await page.waitForFunction(
        () => performance.getEntriesByName('first-contentful-paint').length > 0,
      );

      const { shift, sources } = await layoutShiftOf(page);
      expect(
        shift,
        `${address} shifted its layout while loading at ${width}px:\n${sources.join('\n')}`,
      ).toBe(0);

      /* Below the fold a shift scores 0, so the label and title sizes are compared with the page without the script. */
      const followBox = (on: Page) =>
        on.locator('a[data-follow], [data-follow-title]').evaluateAll((parts) =>
          parts.map((part) => {
            const { width: w, height: h } = part.getBoundingClientRect();
            return { w, h };
          }),
        );
      const before = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width, height: 900 },
      });
      const still = await before.newPage();
      await still.goto(address);
      expect(
        await followBox(page),
        'Follow Me or the title under it changed size once the script named its page',
      ).toEqual(await followBox(still));
      await before.close();
    });
  }
});
