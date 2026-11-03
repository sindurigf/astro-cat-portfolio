import { defineConfig, devices } from '@playwright/test';
import { assertPortFree, TEST_PORT } from './tests/ports';
import {
  BUILD_AND_SERVE_TIMEOUT_MS,
  NO_SKIPS,
  WORKER_SPECS,
} from './playwright.worker.config';
import { DEMO_SPECS } from './playwright.demo.config';
import { INACTIVE_FEATURE_TAGS } from './tests/feature-tags';
import {
  CHROMIUM_ONLY_TAG,
  ENGINE_INVARIANT_TAG,
  NO_FIREFOX_TAG,
  NO_WEBKIT_TAG,
  NODE_TAG,
  WEBKIT_ONLY_TAG,
} from './tests/tags';

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

const anyTag = (...tags: string[]) => new RegExp(tags.join('|'));
const NODE_ONLY = anyTag(NODE_TAG);
const INACTIVE_FEATURES = anyTag(...INACTIVE_FEATURE_TAGS);
const OUTSIDE_CHROMIUM = anyTag(
  ...INACTIVE_FEATURE_TAGS,
  NODE_TAG,
  WEBKIT_ONLY_TAG,
);
const OUTSIDE_FIREFOX = anyTag(
  ...INACTIVE_FEATURE_TAGS,
  NODE_TAG,
  ENGINE_INVARIANT_TAG,
  CHROMIUM_ONLY_TAG,
  WEBKIT_ONLY_TAG,
  NO_FIREFOX_TAG,
);
const OUTSIDE_WEBKIT = anyTag(
  ...INACTIVE_FEATURE_TAGS,
  NODE_TAG,
  ENGINE_INVARIANT_TAG,
  CHROMIUM_ONLY_TAG,
  NO_WEBKIT_TAG,
);

export default defineConfig({
  testDir: './tests',
  /* These need their own build: playwright.worker.config.ts, playwright.demo.config.ts. */
  testIgnore: [...WORKER_SPECS, ...DEMO_SPECS],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  /* For the Firefox stall above; a retried pass still fails CI (--fail-on-flaky-tests). */
  retries: process.env.CI ? 1 : 0,
  /* Fixed so local runs match CI. All workers share one static server; more time out at random. */
  workers: 2,
  /* `html` carries the traces a11y.yml uploads; without it nothing uploads. */
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }], [NO_SKIPS]]
    : [['list'], [NO_SKIPS]],

  use: {
    baseURL: BASE_URL,
    /* Dark by default; a spec that measures light sets `colorScheme` itself. */
    colorScheme: 'dark',
    trace: 'on-first-retry',
  },

  /*
   * Forced colors differ: Chromium follows `colorScheme`, Firefox is always
   * dark, WebKit forces nothing, so forced-colors tests carry NO_WEBKIT.
   */
  projects: [
    /* Tests tagged NODE run once; tests/test.ts fails one that asks for a browser. Engine tags: tests/tags.ts. */
    { name: 'node', grep: NODE_ONLY, grepInvert: INACTIVE_FEATURES },
    {
      name: 'chromium',
      grepInvert: OUTSIDE_CHROMIUM,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      grepInvert: OUTSIDE_FIREFOX,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: { firefoxUserPrefs: FIREFOX_PREFS },
      },
    },
    ...(WEBKIT
      ? [
          {
            name: 'webkit',
            grepInvert: OUTSIDE_WEBKIT,
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],

  webServer: {
    /*
     * Not `astro preview`: it applies `upgrade-insecure-requests`, which WebKit
     * honors on loopback and so loads nothing over http.
     */
    command: `npm run build && node scripts/preview-static.mjs`,
    url: BASE_URL,
    env: { PORT: String(PORT) },

    /* Reuse would skip `npm run build` and test a stale dist/. */
    reuseExistingServer: false,

    timeout: BUILD_AND_SERVE_TIMEOUT_MS,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
