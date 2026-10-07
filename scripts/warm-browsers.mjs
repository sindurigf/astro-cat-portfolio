/*
 * Opens one page in each browser so their per-user caches (fontconfig,
 * WebKit's GStreamer registry, Mesa shaders) exist before the tests. A cold
 * first page in a CI worker counts against that test's 30s timeout.
 * Usage: node scripts/warm-browsers.mjs chromium firefox webkit
 */
import { chromium, firefox, webkit } from '@playwright/test';

const ENGINES = { chromium, firefox, webkit };

const warm = async (name) => {
  const engine = ENGINES[name];
  if (!engine) {
    throw new Error(
      `Unknown browser "${name}"; use ${Object.keys(ENGINES).join(', ')}.`,
    );
  }
  const started = performance.now();
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<p>Warm.</p>');
  } finally {
    await browser.close();
  }
  console.log(
    `${name}: first page in ${Math.round(performance.now() - started)}ms`,
  );
};

const names = process.argv.slice(2);
if (names.length === 0) {
  throw new Error('Name the browsers to warm, for example: chromium webkit.');
}
for (const name of names) await warm(name);
