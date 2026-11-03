import { defineConfig, devices } from '@playwright/test';
import { assertPortFree, TEST_WORKER_PORT } from './tests/ports';
import { NODE_TAG } from './tests/tags';
import { FEATURES_ON, inactiveFeatureTags } from './tests/feature-tags';
import {
  BUILD_AND_SERVE_TIMEOUT_MS,
  NO_SKIPS,
} from './playwright.worker.config';

/*
 * DEMO_SPECS against a build with the demo's variables, served by the Worker
 * (`astro preview`) so both public/_headers and Worker responses are checked.
 * Shares dist/ and the Worker port with test:worker: run one at a time.
 */

const PORT = TEST_WORKER_PORT;

assertPortFree(PORT, 'TEST_WORKER_PORT');

/* playwright.config.ts ignores exactly these. */
export const DEMO_SPECS = ['demo-env.spec.ts'] as const;

export const DEMO_ENV = {
  CLOUDFLARE_ENV: 'demo',
  SITE_URL: 'https://demo.example.com',
  CONTACT_FORM: 'none',
  NOINDEX: '1',
  REPOSITORY_URL: 'https://github.com/demo-owner/demo-site',
  SECURITY_CONTACT: 'mailto:security@notexample.com',
} as const;

const BASE_URL = `http://localhost:${PORT}`;
const NODE_ONLY = new RegExp(NODE_TAG);
/* The demo build turns the form off and sets a security contact. */
const INACTIVE_IN_DEMO = new RegExp(
  inactiveFeatureTags({
    ...FEATURES_ON,
    'contact-form': DEMO_ENV.CONTACT_FORM !== 'none',
    'security-contact': Boolean(DEMO_ENV.SECURITY_CONTACT),
  }).join('|'),
);

export default defineConfig({
  testDir: './tests',
  testMatch: [...DEMO_SPECS],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['list'], [NO_SKIPS]]
    : [['list'], [NO_SKIPS]],

  use: { baseURL: BASE_URL },

  projects: [
    { name: 'node', grep: NODE_ONLY, grepInvert: INACTIVE_IN_DEMO },
    {
      name: 'chromium',
      grepInvert: new RegExp(`${NODE_TAG}|${INACTIVE_IN_DEMO.source}`),
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    /* The build writes env.demo out flat, so the preview must not ask wrangler for it again. */
    command: `npm run build && env -u CLOUDFLARE_ENV npm run preview -- --port ${PORT} --ignore-lock`,
    url: BASE_URL,
    /* ASTRO_PREVIEW_BACKGROUND: playwright.worker.config.ts. */
    env: { ...DEMO_ENV, ASTRO_PREVIEW_BACKGROUND: '1' },
    reuseExistingServer: false,
    timeout: BUILD_AND_SERVE_TIMEOUT_MS,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
