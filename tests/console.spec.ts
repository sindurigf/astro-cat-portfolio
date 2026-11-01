import { expect, test, type Page } from './test';
import { ROUTES } from './routes';
import { waitForHydration } from './settle';
import { usePolicyServer } from './headers-fixture';
import { collectViolations } from './policy-server';
import { fakeCollector } from './plausible';
import tricksData from '../src/lib/about-cats-tricks.json' with { type: 'json' };

/**
 * Runs under public/_headers via tests/policy-server.ts, since the static server
 * sends no CSP. `npm run check:live:console` sets LIVE_ORIGIN to catch edge
 * injections, e.g. Cloudflare JavaScript Detections (blocked by `no-transform`).
 */

const LIVE_ORIGIN = process.env.LIVE_ORIGIN?.replace(/\/$/, '');

/* Firefox navigation stall on a second origin (playwright.config.ts): fail fast, then the config's retry. */
test.use({ navigationTimeout: 15_000 });

/** Console errors, uncaught exceptions, failed requests and failed subresources on `page`, as they happen. */
const watchProblems = (page: Page): string[] => {
  const problems: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`uncaught exception: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(
      `request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
    );
  });
  page.on('response', (response) => {
    const isDocument = response.request().resourceType() === 'document';
    if (!isDocument && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
};

test.describe('the browser console', () => {
  /* A live run has no build, so no _headers for the policy server to read. */
  const originOf = ((): (() => string) => {
    if (LIVE_ORIGIN) return () => LIVE_ORIGIN;
    const policy = usePolicyServer();
    return () => policy().origin;
  })();

  for (const route of ROUTES) {
    test(`${route} loads without errors`, async ({ page }) => {
      const problems = watchProblems(page);

      /* Keeps live runs out of the Plausible numbers while still checking the CSP. */
      await fakeCollector(page.context());
      const violations = await collectViolations(page);

      const origin = originOf();
      await page.goto(`${origin}${route}`);
      await waitForHydration(page);

      expect(
        [...problems, ...violations.map((v) => `CSP violation: ${v}`)],
        `${route} on ${origin} logged errors or CSP violations.`,
      ).toEqual([]);
    });
  }

  test('/about plays a trick and opens and closes a cat card without errors', async ({
    page,
  }) => {
    const problems = watchProblems(page);
    await fakeCollector(page.context());
    const violations = await collectViolations(page);
    const origin = originOf();
    await page.goto(`${origin}/about`);
    await waitForHydration(page);

    const spot = page.locator('#cat-spot-minerva');
    await spot.scrollIntoViewIfNeeded();
    await spot.locator('.cat-tricks-button').click();
    await page
      .locator('#cat-tricks-minerva')
      .getByRole('button', { name: tricksData.tricks.fly.label })
      .click();
    await page.mouse.move(0, 0);
    await expect(
      spot.locator('.cat-prop-wing').first(),
      'the picked trick never started',
    ).toBeAttached();

    await spot.locator('.cat-button').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Minerva' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator('img'),
      'the card photo never loaded',
    ).toHaveJSProperty('complete', true);
    expect(
      await dialog
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
      'the card photo loaded empty',
    ).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    expect(
      [...problems, ...violations.map((v) => `CSP violation: ${v}`)],
      `/about on ${origin} logged errors or CSP violations while a cat played and its card opened.`,
    ).toEqual([]);
  });
});
