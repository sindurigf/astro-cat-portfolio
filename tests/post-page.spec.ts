import { expect, test, type Page } from './test';
import {
  CONTENTS_POST_ROUTE,
  NO_CONTENTS_POST,
  POST_ROUTES,
  postsWhere,
} from './routes';
import { gotoSettled } from './settle';
import { MIN_TARGET, SUBPIXEL_TOLERANCE } from './wcag';

/**
 * A post as a reading page, docs/STYLEGUIDE.md "Posts". Below `xl` the contents
 * list is a closed `<details>`, so the text follows the opening; from `xl` it is open.
 */

/* SC 1.4.8's guidance is 80; 45 to 75 is the typographic range. */
const MAX_CHARACTERS_PER_LINE = 75;

/* A paragraph long enough to set several full lines. */
const LONG_PARAGRAPH = 300;

const charactersPerLine = (page: Page) =>
  page.evaluate((minLength) => {
    const paragraph = [...document.querySelectorAll('.prose > p')].find(
      (p) => (p.textContent ?? '').length > minLength,
    );
    if (!paragraph) return null;
    const lines = new Map<number, number>();
    const range = document.createRange();
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      for (let i = 0; i < text.length; i += 1) {
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const box = range.getClientRects()[0];
        if (!box) continue;
        const line = Math.round(box.top);
        lines.set(line, (lines.get(line) ?? 0) + 1);
      }
    }
    /* The last line is short by nature; one line alone measures nothing. */
    const full = [...lines.values()].slice(0, -1);
    return full.length === 0 ? null : Math.max(...full);
  }, LONG_PARAGRAPH);

for (const route of POST_ROUTES) {
  test(`${route} is one article`, async ({ page }) => {
    await gotoSettled(page, route);
    const found = await page.evaluate(() => ({
      articles: document.querySelectorAll('main article').length,
      nested: document.querySelectorAll('article article').length,
    }));
    expect(found.nested, 'an article inside an article').toBe(0);
    expect(found.articles).toBe(1);
  });
}

const MEASURE_WIDTH = 1280;

/** A Markdown line's length as read, link targets and emphasis marks dropped. */
const readLength = (line: string): number =>
  line.replace(/\]\([^)]*\)/g, '').replace(/[*_`[\]]/g, '').length;

/** The first post whose body has a paragraph (a line opening with a word) over LONG_PARAGRAPH characters. */
const LONG_PARAGRAPH_POST = postsWhere((source) =>
  source
    .replace(/^---[\s\S]*?\n---/, '')
    .split('\n')
    .some(
      (line) => /^[A-Za-z]/.test(line) && readLength(line) > LONG_PARAGRAPH,
    ),
)[0];

test(`a post with a long paragraph sets at most ${MAX_CHARACTERS_PER_LINE} characters a line`, async ({
  page,
}) => {
  test.skip(
    !LONG_PARAGRAPH_POST,
    'no post has a paragraph long enough to measure',
  );
  await page.setViewportSize({ width: MEASURE_WIDTH, height: 900 });
  await gotoSettled(page, LONG_PARAGRAPH_POST!);
  const longest = await charactersPerLine(page);
  expect(longest, 'no paragraph long enough to measure').not.toBeNull();
  expect(longest!).toBeLessThanOrEqual(MAX_CHARACTERS_PER_LINE);
});

test.describe('the contents list', () => {
  test.skip(!CONTENTS_POST_ROUTE, NO_CONTENTS_POST);

  for (const width of [320, 1279]) {
    test(`is a closed disclosure at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, CONTENTS_POST_ROUTE!);
      const found = await page.evaluate(() => {
        const nav = document.querySelector('nav.post-contents');
        const details = nav?.querySelector('details');
        const summary = details?.querySelector('summary');
        if (!nav || !details || !summary) return null;
        return {
          open: details.open,
          summary: summary.getBoundingClientRect().height,
          name: nav.getAttribute('aria-labelledby'),
          labelledBy: summary.id,
        };
      });
      expect(found, 'no <details> in the contents nav').not.toBeNull();
      expect(found!.open).toBe(false);
      expect(found!.summary).toBeGreaterThanOrEqual(
        MIN_TARGET - SUBPIXEL_TOLERANCE,
      );
      expect(found!.name).toBe(found!.labelledBy);
    });
  }

  test('opens and shows every section link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await gotoSettled(page, CONTENTS_POST_ROUTE!);
    const summary = page.locator('nav.post-contents summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    const links = page.locator('nav.post-contents a');
    await expect(links.first()).toBeVisible();
    expect(await links.count()).toBe(await page.locator('.prose h2').count());
  });

  test('is open beside the text at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, CONTENTS_POST_ROUTE!);
    await expect(page.locator('nav.post-contents details')).toHaveAttribute(
      'open',
      '',
    );
    await expect(page.locator('nav.post-contents a').first()).toBeVisible();
  });
});
