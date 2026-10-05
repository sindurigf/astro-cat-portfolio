import { defineConfig, devices } from '@playwright/test';
import { assertPortFree, TEST_WORKER_PORT } from './tests/ports';
import { NODE_TAG } from './tests/tags';
import { BUILD_AND_SERVE_TIMEOUT_MS } from './playwright.worker.config';

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
} as const;

const BASE_URL = `http://localhost:${PORT}`;
const NODE_ONLY = new RegExp(NODE_TAG);

export default defineConfig({
  testDir: './tests',
  testMatch: [...DEMO_SPECS],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: { baseURL: BASE_URL },

  projects: [
    { name: 'node', grep: NODE_ONLY },
    {
      name: 'chromium',
      grepInvert: NODE_ONLY,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --ignore-lock`,
    url: BASE_URL,
    /* ASTRO_PREVIEW_BACKGROUND: playwright.worker.config.ts. */
    env: { ...DEMO_ENV, ASTRO_PREVIEW_BACKGROUND: '1' },
    reuseExistingServer: false,
    timeout: BUILD_AND_SERVE_TIMEOUT_MS,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
