import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { TEST_PORT } from './tests/ports';
import { SITE_CONFIG } from './src/site.config';

/*
 * Browser JavaScript only, Chromium only: build-time code and the Worker are
 * not measured. Source maps come from astro.config.mjs when COVERAGE=1.
 */
export default defineConfig({
  ...base,
  projects: base.projects?.filter((project) => project.name === 'chromium'),
  reporter: [
    ['list'],
    [
      'monocart-reporter',
      {
        name: `${SITE_CONFIG.site.name} coverage`,
        outputFile: './coverage/index.html',
        coverage: {
          /* Other origins' bundles have no fetchable maps and skew totals. */
          entryFilter: (entry: { url: string }) =>
            entry.url.startsWith(`http://localhost:${TEST_PORT}/_astro/`),
          sourceFilter: {
            '**/node_modules/**': false,
            '**/src/**': true,
            '**/**': false,
          },
          reports: ['console-summary', 'v8', 'lcovonly'],
          outputDir: './coverage',
          assetsPath: './assets',
        },
      },
    ],
  ],
});
