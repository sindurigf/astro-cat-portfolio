import { expect, test } from './test';
import { gotoSettled } from './settle';
import { POST_ROUTES } from './routes';
import { MIN_TARGET } from './wcag';

/**
 * SC 2.5.5 and 2.5.8: checkers measure the element box, not a pseudo-element
 * pointer area, so these links are tall enough by themselves.
 */

const HOME = '/';
const POST = POST_ROUTES[0] ?? '/blog/';
const REPORT_LINK = 'aside[aria-label="Accessibility help"] a';
const BREADCRUMB_LINKS = 'nav[aria-label="Breadcrumb"] a';

const heightsOf = (page: import('@playwright/test').Page, selector: string) =>
  page
    .locator(selector)
    .evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    );

test.describe('Own-box target size', () => {
  test('the report link box is at least 44px tall', async ({ page }) => {
    await gotoSettled(page, HOME);
    const heights = await heightsOf(page, REPORT_LINK);
    expect(heights).toHaveLength(1);
    expect(heights[0]).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  test('every breadcrumb link box is at least 44px tall', async ({ page }) => {
    await gotoSettled(page, POST);
    const heights = await heightsOf(page, BREADCRUMB_LINKS);
    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });
});
