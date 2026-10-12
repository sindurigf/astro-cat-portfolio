import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { builtHtml, DIST_DIR, ROUTES } from './routes';
import { NODE } from './tags';

/*
 * Only measures that are machine-independent: load time depends on the runner,
 * so it is checked with Lighthouse on the live site (docs/DEPLOYMENT.md).
 */

/* Decoded script bytes. `/` and `/about` carry Vue; `/brand` every component's script. */
const ROUTE_SCRIPT_BUDGETS: Readonly<Record<string, number>> = {
  '/': 96_000,
  '/about': 120_000,
  '/brand': 7_400,
};
const PAGE_SCRIPT_BUDGET = 14_000;

/* Decoded bytes of the stylesheets a page links plus its inline `<style>`. Every route links the one sheet. */
const PAGE_STYLE_BUDGET = 104_000;

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
  await gotoSettled(page, route);
  return Promise.all(pending);
};

/*
 * Each shift with what moved, so a failure names the element: CI's are not reproducible locally.
 * Entries arrive asynchronously, so the reader takes the pending ones first (takeRecords).
 */
const LAYOUT_SHIFT = `
  window.__layoutShift = 0;
  window.__shifts = [];
  const rect = (r) => [r.x, r.y, r.width, r.height].map(Math.round).join(',');
  const name = (node) => {
    if (!node) return '(removed)';
    const el = node.nodeType === 1 ? node : node.parentElement;
    const tag = el ? el.tagName.toLowerCase() : '?';
    const id = el && el.id ? '#' + el.id : '';
    const cls = el && el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '';
    return (node.nodeType === 1 ? '' : 'text in ') + tag + id + cls;
  };
  window.__handleShifts = (entries) => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      window.__layoutShift += entry.value;
      for (const s of entry.sources ?? [])
        window.__shifts.push(
          entry.value.toFixed(6) + ' ' + name(s.node) + ' ' + rect(s.previousRect) + ' -> ' + rect(s.currentRect),
        );
    }
  };
  window.__shiftObserver = new PerformanceObserver((list) => window.__handleShifts(list.getEntries()));
  window.__shiftObserver.observe({ type: 'layout-shift', buffered: true });
`;

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
      const budget = ROUTE_SCRIPT_BUDGETS[route] ?? PAGE_SCRIPT_BUDGET;

      expect(
        total,
        `${route} fetched ${total} bytes of script against a budget of ${budget}:\n` +
          scripts.map((s) => `  ${s.file} ${s.bytes}`).join('\n'),
      ).toBeLessThanOrEqual(budget);
    });

    /* Zero, not Lighthouse's 0.1: every route measures 0. */
    test(`${route} does not shift while it loads`, async ({ page }) => {
      await page.addInitScript(LAYOUT_SHIFT);
      await gotoSettled(page, route);
      /* Chromium measures a shift between painted frames; headless can settle before its first paint. */
      await page.waitForFunction(
        () => performance.getEntriesByName('first-contentful-paint').length > 0,
      );

      const { shift, sources } = await page.evaluate(() => {
        const w = window as unknown as {
          __layoutShift: number;
          __shifts: string[];
          __shiftObserver: PerformanceObserver;
          __handleShifts: (entries: PerformanceEntryList) => void;
        };
        w.__handleShifts(w.__shiftObserver.takeRecords());
        return { shift: w.__layoutShift, sources: w.__shifts };
      });
      expect(
        shift,
        `${route} shifted its layout while loading (value, element, x,y,w,h before -> after):\n${sources.join('\n')}`,
      ).toBe(0);
    });
  }
});
