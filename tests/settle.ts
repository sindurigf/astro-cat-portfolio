import { expect, type Page, type Response } from '@playwright/test';

/**
 * Not `networkidle`: it says nothing about hydration or fonts. The Firefox
 * navigation stall is in the harness, not here; see `retries` in playwright.config.ts.
 */

/*
 * A margin for a shared runner whose main thread can stay busy past an assertion's 5s,
 * not a fix for a known cause. With STATE_ANSWER_MS it stays inside the 30s default test timeout.
 */
export const HYDRATION_TIMEOUT = 20_000;

/* The page may be too busy to answer, which is itself the evidence. */
const STATE_ANSWER_MS = 2_000;

const hydrationState = async (page: Page): Promise<string> => {
  const state = page.evaluate(() => {
    const script = document.querySelector<HTMLScriptElement>(
      'script[type="module"][src*="Header.astro"]',
    );
    return {
      readyState: document.readyState,
      menuScriptInDocument: script !== null,
      menuScriptFetched:
        script !== null && performance.getEntriesByName(script.src).length > 0,
      menuReady: document.querySelectorAll('[data-menu-ready]').length,
      pendingIslands: document.querySelectorAll('astro-island[ssr]').length,
    };
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unanswered = new Promise<string>((resolve) => {
    timer = setTimeout(
      () => resolve(`the page did not answer in ${STATE_ANSWER_MS}ms`),
      STATE_ANSWER_MS,
    );
  });
  try {
    return JSON.stringify(await Promise.race([state, unanswered]));
  } catch (error) {
    return `the page state could not be read: ${String(error)}`;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * `data-menu-ready` is on every route, so it is the signal the page's script ran;
 * Astro removes `ssr` from an island once it mounts. Needs the site header.
 * Both waits share one HYDRATION_TIMEOUT; a timeout appends the page's state.
 */
export const waitForHydration = async (page: Page): Promise<void> => {
  const deadline = Date.now() + HYDRATION_TIMEOUT;
  // Playwright reads a timeout of 0 as none, so the floor is 1ms.
  const remaining = () => ({ timeout: Math.max(1, deadline - Date.now()) });
  try {
    await expect(
      page.locator('[data-mobile-menu][data-menu-ready]'),
      'the header menu never marked itself ready, so its script did not run.',
    ).toHaveCount(1, remaining());

    await expect(
      page.locator('astro-island[ssr]'),
      'an island never hydrated; a stale script hash in the CSP looks like this.',
    ).toHaveCount(0, remaining());
  } catch (error) {
    if (error instanceof Error) {
      error.message += `\nPage state: ${await hydrationState(page)}`;
    }
    throw error;
  }
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

/**
 * Resizes, then waits two frames: under load Chromium can measure existing
 * elements with the previous width's viewport units for a frame after the
 * resize lands (template run 37715580101).
 */
export const setViewportSettled = async (
  page: Page,
  size: { width: number; height: number },
): Promise<void> => {
  await page.setViewportSize(size);
  await page.waitForFunction((width) => innerWidth === width, size.width);
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
};
