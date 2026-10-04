import { defineConfig } from '@playwright/test';
import { assertPortFree, TEST_WORKER_PORT } from './tests/ports';

/*
 * Specs that need the Worker, served by `astro preview` with local D1 and rate
 * limiting. Chromium only, for the contact error pages. Migrations run first:
 * local D1 starts empty, and wrangler skips migrations already applied.
 */

const PORT = TEST_WORKER_PORT;

assertPortFree(PORT, 'TEST_WORKER_PORT');

/* playwright.config.ts ignores exactly these. */
export const WORKER_SPECS = [
  'contact.spec.ts',
  'video-range.spec.ts',
  'served-types.spec.ts',
  'blog-pages.spec.ts',
] as const;

/*
 * The web server runs a cold `npm run build`, which generates every photo's
 * widths and formats: about 2 minutes on a CI runner, over the 120s default.
 */
export const BUILD_AND_SERVE_TIMEOUT_MS = 300_000;

/* Small enough that today's posts span pages, so tests/blog-pages.spec.ts sees the pager. */
export const WORKER_POSTS_PER_PAGE = 1;

/* Secret in production; read with CLOUDFLARE_INCLUDE_PROCESS_ENV. */
export const NOTIFY_TO = 'owner@example.com';

/* Bytes served as a video, so the byte-range tests run while no real video ships. */
export const VIDEO_FIXTURE_NAME = 'range-fixture.webm';
const VIDEO_FIXTURE = `tests/fixtures/${VIDEO_FIXTURE_NAME}`;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  testMatch: [...WORKER_SPECS],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
  },

  projects: [{ name: 'worker' }],

  webServer: {
    /*
     * The range fixture is in public/videos/ only for this build, so the build
     * records its size and ships it to dist/; it, and the folder if left empty, are
     * removed even if the build fails.
     */
    command:
      `mkdir -p public/videos && cp ${VIDEO_FIXTURE} public/videos/` +
      ` && (npm run build; built=$?; rm -f public/videos/${VIDEO_FIXTURE_NAME}; rmdir public/videos 2>/dev/null; exit $built)` +
      ' && npx wrangler d1 migrations apply MESSAGES_DB --local' +
      ` && npm run preview -- --port ${PORT} --ignore-lock`,
    url: BASE_URL,

    /*
     * Astro backgrounds `preview` under an AI agent; this marker keeps it in
     * the foreground. `--ignore-lock` stops a leftover lock failing the run.
     */
    env: {
      ASTRO_PREVIEW_BACKGROUND: '1',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
      CONTACT_NOTIFY_TO: NOTIFY_TO,
      POSTS_PER_PAGE: String(WORKER_POSTS_PER_PAGE),
    },

    reuseExistingServer: false,
    timeout: BUILD_AND_SERVE_TIMEOUT_MS,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
