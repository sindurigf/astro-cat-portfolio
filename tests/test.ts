import { test as playwright, type Browser } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

/*
 * Specs import `test` from here so `npm run test:coverage` (COVERAGE=1) can
 * collect V8 coverage, Chromium only. Otherwise plain `test`: the auto fixture
 * would create a page even for tests that only read dist/.
 */
export {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
  type Response,
} from '@playwright/test';

/* The `node` project runs tests tagged NODE; asking it for a browser is a mistake. */
const base = playwright.extend<object, { browser: Browser }>({
  browser: [
    async ({ browser }, use, workerInfo) => {
      if (workerInfo.project.name === 'node') {
        throw new Error(
          'a test in the node project asked for a browser; remove its NODE tag (tests/tags.ts)',
        );
      }
      await use(browser);
    },
    { scope: 'worker' },
  ],
});

const coverage = base.extend<{ collectCoverage: void }>({
  collectCoverage: [
    async ({ page, browserName }, use, testInfo) => {
      if (browserName !== 'chromium') return use();
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      // A closed page rejects stopJSCoverage; it and a page never navigated add nothing.
      if (page.isClosed()) return;
      const entries = await page.coverage.stopJSCoverage();
      if (entries.length > 0) {
        await addCoverageReport(entries, testInfo);
      }
    },
    { auto: true },
  ],
});

export const test = process.env.COVERAGE === '1' ? coverage : base;
