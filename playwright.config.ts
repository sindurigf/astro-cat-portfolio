import { defineConfig, devices } from '@playwright/test';
import { assertPortFree, TEST_PORT } from './tests/ports';
import { WORKER_SPECS } from './playwright.worker.config';
import { NODE_TAG } from './tests/tags';

/*
 * WebKit needs ICU 74 (Ubuntu 24.04), absent on newer hosts, so it runs in CI
 * or via `npm run test:webkit` (Docker).
 */
const WEBKIT = Boolean(process.env.CI) || process.env.WEBKIT === '1';

/*
 * Firefox `page.goto` stalls on COOP navigations, worse after 1.62.1, hence the
 * exact pin: https://github.com/microsoft/playwright/issues/42731. Disabling
 * Firefox COOP removes the trigger; Chromium still enforces it.
 */
const FIREFOX_PREFS = {
  'browser.tabs.remote.useCrossOriginOpenerPolicy': false,
};

const PORT = TEST_PORT;

assertPortFree(PORT, 'TEST_PORT');
const BASE_URL = `http://localhost:${PORT}`;

const NODE_ONLY = new RegExp(NODE_TAG);

export default defineConfig({
  testDir: './tests',
  /* These need the Worker: playwright.worker.config.ts. */
  testIgnore: [...WORKER_SPECS],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  /* For the Firefox stall above; a retried pass still fails CI (--fail-on-flaky-tests). */
  retries: process.env.CI ? 1 : 0,
  /* Fixed so local runs match CI. All workers share one static server; more time out at random. */
  workers: 2,
  /* `html` carries the traces a11y.yml uploads; without it nothing uploads. */
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE_URL,
    /* Dark by default; a spec that measures light sets `colorScheme` itself. */
    colorScheme: 'dark',
    trace: 'on-first-retry',
  },

  /*
   * Forced colours differ: Chromium follows `colorScheme`, Firefox is always
   * dark, WebKit forces nothing and is skipped in tests/forced-colors.spec.ts.
   */
  projects: [
    /* Tests tagged NODE run once; tests/test.ts fails one that asks for a browser. */
    { name: 'node', grep: NODE_ONLY },
    {
      name: 'chromium',
      grepInvert: NODE_ONLY,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      grepInvert: NODE_ONLY,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: { firefoxUserPrefs: FIREFOX_PREFS },
      },
    },
    ...(WEBKIT
      ? [
          {
            name: 'webkit',
            grepInvert: NODE_ONLY,
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],

  webServer: {
    /*
     * Not `astro preview`: it applies `upgrade-insecure-requests`, which WebKit
     * honours on loopback and so loads nothing over http.
     */
    command: `npm run build && node scripts/preview-static.mjs`,
    url: BASE_URL,
    env: { PORT: String(PORT) },

    /* Reuse would skip `npm run build` and test a stale dist/. */
    reuseExistingServer: false,

    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
