#!/usr/bin/env node
/*
 * Renders the homepage hero field's reduced-motion frame to the WebP stills
 * shown when scripting is off (src/styles/components/layout.css). One wide
 * frame for `md` and up, one tall phone frame, one short landscape phone frame. Run after `npm run build`.
 *
 *   npm run build && npm run hero-still
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { THEME_STORAGE_KEY } from '../src/lib/theme.ts';

const PORT = 4399;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_START_MS = 10_000;
const DRAW_TIMEOUT_MS = 20_000;
const WEBP_QUALITY = 60;
const WEBP_EFFORT = 6;
/* Sharp on a 2x screen; `contain` scales it to the window. */
const DEVICE_SCALE = 2;

const FRAMES = [
  {
    file: 'src/assets/hero-still-wide.webp',
    viewport: { width: 1280, height: 900 },
  },
  {
    file: 'src/assets/hero-still-tall.webp',
    viewport: { width: 390, height: 844 },
  },
  {
    file: 'src/assets/hero-still-short.webp',
    viewport: { width: 568, height: 320 },
  },
];

const waitForServer = async () => {
  const deadline = Date.now() + SERVER_START_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      /* Not listening yet: retry until the deadline. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `make-hero-still: no server on ${ORIGIN}. Run npm run build first.`,
  );
};

/* The three canvas layers, back to front, as one PNG. */
/*
 * The window's ground, flattened in: a lossy alpha plane bands the field's
 * haze, and a lossless one is most of the bytes.
 */
const groundColor = () => {
  for (
    let element = document.querySelector('.hero-field');
    element;
    element = element.parentElement
  ) {
    const color = getComputedStyle(element).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)') return color;
  }
  throw new Error('make-hero-still: the hero has no ground color.');
};

const drawnFrame = () => {
  const layers = [...document.querySelectorAll('.hero-field-layer')];
  const out = document.createElement('canvas');
  out.width = layers[0].width;
  out.height = layers[0].height;
  const context = out.getContext('2d');
  for (const layer of layers) context.drawImage(layer, 0, 0);
  return out.toDataURL('image/png').split(',')[1];
};

/* The sky is empty: cut it so `contain` can fit the whole field in a short window. */
const withoutSky = async (png, ground) => {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  let top = 0;
  rows: for (; top < info.height; top += 1) {
    for (let x = 0; x < info.width; x += 1) if (alphaAt(x, top) > 0) break rows;
  }
  if (top === info.height)
    throw new Error('make-hero-still: the field drew nothing.');
  return sharp(png)
    .extract({ left: 0, top, width: info.width, height: info.height - top })
    .flatten({ background: ground })
    .webp({
      quality: WEBP_QUALITY,
      effort: WEBP_EFFORT,
    })
    .toBuffer();
};

const server = spawn('node', ['scripts/preview-static.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
const browser = await chromium.launch();
try {
  await waitForServer();
  for (const { file, viewport } of FRAMES) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: DEVICE_SCALE,
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    // Scripting off always shows the dark theme, so the still is drawn in it.
    await context.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, 'dark'],
    );
    const page = await context.newPage();
    await page.goto(ORIGIN);
    // Mounted fields size their canvases before drawing the still frame.
    await page.waitForFunction(
      () => document.querySelector('canvas.hero-field-layer')?.width > 0,
      undefined,
      { timeout: DRAW_TIMEOUT_MS },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const png = Buffer.from(await page.evaluate(drawnFrame), 'base64');
    writeFileSync(
      file,
      await withoutSky(png, await page.evaluate(groundColor)),
    );
    console.log(`make-hero-still: wrote ${file}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
