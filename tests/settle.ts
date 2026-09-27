import { expect, type Page, type Response } from '@playwright/test';

/**
 * Not `networkidle`: it says nothing about hydration or fonts. The Firefox
 * navigation stall is in the harness, not here; see `retries` in playwright.config.ts.
 */

/**
 * `data-menu-ready` is on every route, so it is the signal the page's script ran;
 * Astro removes `ssr` from an island once it mounts. Needs the site header.
 */
export const waitForHydration = async (page: Page): Promise<void> => {
  await expect(
    page.locator('[data-mobile-menu][data-menu-ready]'),
    'the header menu never marked itself ready, so its script did not run.',
  ).toHaveCount(1);

  await expect(
    page.locator('astro-island[ssr]'),
    'an island never hydrated; a stale script hash in the CSP looks like this.',
  ).toHaveCount(0);
};

/** Also waits for `document.fonts.ready`: a heading in the fallback face measures wrong. */
export const gotoSettled = async (
  page: Page,
  route: string,
): Promise<Response | null> => {
  const response = await page.goto(route, { waitUntil: 'load' });
  await waitForHydration(page);
  await page.evaluate(() => document.fonts.ready);
  return response;
};

/** Per route: the reduced-motion sweep walks every route in one test. */
const SWEEP_BUDGET_PER_ROUTE_MS = 3_000;

export const sweepTimeout = (routeCount: number): number =>
  SWEEP_BUDGET_PER_ROUTE_MS * routeCount;
