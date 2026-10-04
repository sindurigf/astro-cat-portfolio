import { expect, test, type Page } from './test';
import {
  CONTENTS_POST_ROUTE,
  NO_CONTENTS_POST,
  POST_ROUTES,
  POSTS,
  postsWhere,
} from './routes';
import { PHOTOGRAPHERS } from '../src/lib/credits';
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

/* A frame within 1% of the photo's own ratio shows it uncropped; the border rounds. */
const COVER_RATIO_TOLERANCE = 0.01;

/* The cover is the opening's photo and the page's largest paint, so it loads first. */
test.describe('the cover as the post hero', () => {
  for (const post of POSTS) {
    test(`${post.route} ${post.hasCover ? 'opens on its cover' : 'opens on no photo'}`, async ({
      page,
    }) => {
      await gotoSettled(page, post.route);
      const slabImages = page.locator('main article .post-slab header img');
      if (!post.hasCover) {
        await expect(
          slabImages,
          'a post without a cover shows a photo in its opening',
        ).toHaveCount(0);
        return;
      }
      const first = page.locator('main article img').first();
      await expect(
        slabImages,
        'the opening holds more than the cover',
      ).toHaveCount(1);
      await expect(
        first,
        'the cover is not the first image in the article',
      ).toHaveAttribute('alt', post.coverAlt ?? '');
      await expect(
        first.locator('xpath=ancestor::*[contains(@class, "post-slab")]'),
      ).toHaveCount(1);
      await expect(first, 'the cover waits for lazy loading').toHaveAttribute(
        'loading',
        'eager',
      );
      await expect(first, 'the cover is not fetched first').toHaveAttribute(
        'fetchpriority',
        'high',
      );
      const reserved = await first.evaluate(
        (img) =>
          Number(img.getAttribute('width')) > 0 &&
          Number(img.getAttribute('height')) > 0,
      );
      expect(reserved, 'the cover reserves no space before it loads').toBe(
        true,
      );

      const ratios = await first.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const frame = img.closest('.aspect-frame')!.getBoundingClientRect();
        return {
          box: frame.width / frame.height,
          source: img.naturalWidth / img.naturalHeight,
        };
      });
      expect(
        Math.abs(ratios.box / ratios.source - 1),
        'the cover is cropped: its frame differs from the photo',
      ).toBeLessThanOrEqual(COVER_RATIO_TOLERANCE);
    });
  }
});

/* A photographer is credited under the photo, linked when the site knows them. */
test.describe('the cover credit', () => {
  for (const post of POSTS.filter((p) => p.hasCover && p.coverCredit)) {
    test(`${post.route} credits ${post.coverCredit} under its cover`, async ({
      page,
    }) => {
      await gotoSettled(page, post.route);
      const caption = page.locator('main article .post-slab figure figcaption');
      await expect(caption, 'the cover has no credit').toHaveText(
        `Photo: ${post.coverCredit}`,
      );
      const href = (PHOTOGRAPHERS as Record<string, string>)[post.coverCredit!];
      if (href) {
        await expect(
          caption.getByRole('link', { name: post.coverCredit }),
          'a known photographer is not linked',
        ).toHaveAttribute('href', href);
      }
    });
  }
});
