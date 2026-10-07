#!/usr/bin/env node
/*
 * Renders every logo file from src/lib/brand-mark.ts, in Chromium with the
 * site tokens: the tab icons, the app icons and the one-color mark. Rerun
 * after changing the mark or a color it uses.
 *
 *   npm run icons
 */

import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { cssColorToken } from '../src/lib/css-token.ts';
import {
  MARK_SIZE,
  markMarkup,
  markOneColor,
  markSilhouette,
} from '../src/lib/brand-mark.ts';

const paint = (token) => cssColorToken(`--color-${token}`);
const GROUND = paint('background');
const INK = paint('gold-text');
const SHADOW = paint('mark');

/* The rim reaches 5.3 units past the head; two more keep it off the edge. */
const TAB_VIEWBOX = '-2 -2 68 68';
/* The tile's 8px shadow at 48px, in mark units, and room for it. */
const SHADOW_OFFSET = 9.33;
const APP_VIEWBOX = `0 0 ${MARK_SIZE + SHADOW_OFFSET} ${MARK_SIZE + SHADOW_OFFSET}`;
/** Share of a full-bleed app icon the mark spans; maskable stays inside the 80% safe circle. */
const APP_SPAN = 0.72;
const MASKABLE_SPAN = 0.5;
/** `src/assets/mark-dark.png`: Roundel.astro's MARK_WIDTHS assume 840:900. */
const ONE_COLOR = { width: 840, height: 900 };

const svg = (viewBox, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`;

const tab = (small) =>
  svg(TAB_VIEWBOX, markMarkup(paint, { small, rim: true, id: 'tab' }));

const app = svg(
  APP_VIEWBOX,
  `<g transform="translate(${SHADOW_OFFSET} ${SHADOW_OFFSET})">${markSilhouette(SHADOW)}</g>` +
    markMarkup(paint, { id: 'app' }),
);

const oneColor = svg(`0 0 ${MARK_SIZE} ${MARK_SIZE}`, markOneColor(INK, 'one'));

const browser = await chromium.launch();

/** `markup` drawn `span` of a `size` square on `ground`, or on transparency. */
const render = async (markup, size, file, { ground, span = 1 } = {}) => {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  });
  const side = Math.round(size * span);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${ground ?? 'transparent'}">` +
      markup.replace('<svg ', `<svg width="${side}" height="${side}" `) +
      '</body></html>',
  );
  const png = await page.screenshot({ omitBackground: !ground });
  writeFileSync(file, png);
  await page.close();
  return png;
};

/** ICO with PNG frames: a 6-byte header, a 16-byte entry per frame, the PNGs. */
const ico = (frames) => {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = HEADER + ENTRY * frames.length;
  const entries = frames.map(({ size, png }) => {
    const entry = Buffer.alloc(ENTRY);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...frames.map(({ png }) => png)]);
};

try {
  writeFileSync('public/favicon.svg', `${tab(true)}\n`);
  writeFileSync('artwork/mark-dark.svg', `${oneColor}\n`);

  const frames = [];
  for (const size of [16, 32, 48]) {
    const png = await render(
      tab(true),
      size,
      `artwork/favicon-${size}x${size}.png`,
    );
    frames.push({ size, png });
  }
  writeFileSync('public/favicon.ico', ico(frames));
  await render(tab(false), 96, 'public/favicon-96x96.png');

  await render(app, 180, 'public/apple-touch-icon.png', {
    ground: GROUND,
    span: APP_SPAN,
  });
  await render(app, 192, 'public/android-chrome-192x192.png', {
    ground: GROUND,
    span: APP_SPAN,
  });
  await render(app, 512, 'public/android-chrome-512x512.png', {
    ground: GROUND,
    span: APP_SPAN,
  });
  await render(app, 512, 'public/maskable-icon-512x512.png', {
    ground: GROUND,
    span: MASKABLE_SPAN,
  });

  const page = await browser.newPage({ viewport: ONE_COLOR });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${ONE_COLOR.width}px;height:${ONE_COLOR.height}px;display:grid;place-items:center">` +
      oneColor.replace(
        '<svg ',
        `<svg width="${ONE_COLOR.width}" height="${ONE_COLOR.width}" `,
      ) +
      '</body></html>',
  );
  writeFileSync(
    'src/assets/mark-dark.png',
    await page.screenshot({ omitBackground: true }),
  );
  console.log(
    'make-icons: favicons, app icons and the one-color mark written.',
  );
} finally {
  await browser.close();
}
