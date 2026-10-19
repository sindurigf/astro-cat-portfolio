import { expect, test } from './test';
import { ROUTES } from './routes';
import { waitForHydration } from './settle';
import { usePolicyServer } from './headers-fixture';
import { collectViolations } from './policy-server';
import { fakeCollector } from './umami';

/**
 * Runs under public/_headers via tests/policy-server.ts, since the static server
 * sends no CSP. `npm run check:live:console` sets LIVE_ORIGIN to catch edge
 * injections, e.g. Cloudflare JavaScript Detections (blocked by `no-transform`).
 */

const LIVE_ORIGIN = process.env.LIVE_ORIGIN?.replace(/\/$/, '');

/* Firefox navigation stall on a second origin (playwright.config.ts): fail fast, then the config's retry. */
test.use({ navigationTimeout: 15_000 });

test.describe('the browser console', () => {
  /* A live run has no build, so no _headers for the policy server to read. */
  const originOf = ((): (() => string) => {
    if (LIVE_ORIGIN) return () => LIVE_ORIGIN;
    const policy = usePolicyServer();
    return () => policy().origin;
  })();

  for (const route of ROUTES) {
    test(`${route} loads without errors`, async ({ page }) => {
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

      /* Keeps live runs out of the Umami numbers while still checking the CSP. */
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
});
