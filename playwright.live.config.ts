import { defineConfig, devices } from '@playwright/test';
import { SITE_CONFIG } from './src/site.config';

/* Manual, post-deploy only: CI runs before the deploy it would check. */
process.env.LIVE_ORIGIN ??= SITE_CONFIG.site.url;

export default defineConfig({
  testDir: './tests',
  testMatch: 'console.spec.ts',
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
