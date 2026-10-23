#!/usr/bin/env node
/*
 * Renders the logo cat file from src/lib/brand-mark.ts, and the tab and app
 * icons from a cut-out cat in artwork/cats/ as a die-cut sticker, in
 * Chromium with the site tokens. Rerun after changing either or a color.
 *
 *   npm run icons
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { cssColorToken } from '../src/lib/css-token.ts';
import { MARK_SIZE, markMarkup } from '../src/lib/brand-mark.ts';

const paint = (token) => cssColorToken(`--color-${token}`);
const GROUND = paint('background');
const INK = paint('gold-text');
const RIM = paint('light-ground');
const BLOCK = paint('mark');

/* The icon cat, a Canva AI drawing cut out of its background. */
// TODO(fork): Your cat's cut-out, transparent background.
const ICON_ART = 'artwork/cats/minerva-head.png';
/* Units of the 64-unit icon square: the die-cut layers and the clear margin past them. */
const ICON_SIZE = 64;
const RIM_WIDTH = 2.4;
const EDGE_WIDTH = 2;
const BLOCK_DEPTH = 4;
const MARGIN = 1;
/* How far the ink back edge reaches past the cat on every side. */
const OUTER = RIM_WIDTH + 2 * EDGE_WIDTH;
/** Share of a full-bleed app icon the cat spans; maskable stays inside the 80% safe circle. */
const APP_SPAN = 0.8;
const MASKABLE_SPAN = 0.6;
/* Tab icons are scaled down from one large render: Chromium rounds filter radii to whole px, which clips a small render. */
const TAB_MASTER = 512;
/* Clear px kept round each tab icon; the 64-unit MARGIN is under 1px at 16px. */
const TAB_BORDER = 1;
/* The block starts this many units behind the edge, so none of it shows past the cat's near side. */
const BLOCK_FROM = 1;
/* The block is swept in steps of 1px of the 512px render, so no step shows. */
const BLOCK_STEPS = Math.ceil((BLOCK_DEPTH * TAB_MASTER) / ICON_SIZE);

const svg = (viewBox, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`;

/** The cat as a die-cut sticker: white rim, ink edge, pink block falling down-right behind it. */
const catIcon = async () => {
  const { width, height, hasAlpha } = await sharp(ICON_ART).metadata();
  if (!hasAlpha)
    throw new Error(`make-icons: ${ICON_ART} has no transparent background.`);
  /* The cat, its rim, edge and block all inside the square, with a clear margin. */
  const room = ICON_SIZE - 2 * (OUTER + MARGIN) - BLOCK_DEPTH;
  const scale = room / Math.max(width, height);
  const w = width * scale;
  const h = height * scale;
  const x = OUTER + MARGIN + (room - w) / 2;
  const y = OUTER + MARGIN + (room - h) / 2;
  const href = `data:image/png;base64,${readFileSync(ICON_ART).toString('base64')}`;
  const edge = RIM_WIDTH + EDGE_WIDTH;
  const steps = Array.from({ length: BLOCK_STEPS }, (_, i) => {
    const d = (BLOCK_DEPTH * (i + 1)) / BLOCK_STEPS;
    return `<feOffset in="edge" dx="${d}" dy="${d}" result="b${i}"/>`;
  }).join('');
  const merge = (from) =>
    Array.from({ length: BLOCK_STEPS }, (_, k) => k)
      .filter((k) => (BLOCK_DEPTH * (k + 1)) / BLOCK_STEPS >= from)
      .map((k) => `<feMergeNode in="b${k}"/>`)
      .join('');
  const blockMerge = merge(BLOCK_FROM);
  /* The ink back edge outlines only the block's far side, so it adds nothing round the cat's own edge. */
  const backMerge = merge(EDGE_WIDTH);
  const filter =
    `<filter id="cut" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${RIM_WIDTH}" result="rim"/>` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${edge}" result="edge"/>` +
    `${steps}<feMerge result="block">${blockMerge}</feMerge>` +
    `<feMerge result="far">${backMerge}</feMerge>` +
    `<feMorphology in="far" operator="dilate" radius="${EDGE_WIDTH}" result="back"/>` +
    `<feFlood flood-color="${INK}"/><feComposite in2="back" operator="in" result="backInk"/>` +
    `<feFlood flood-color="${BLOCK}"/><feComposite in2="block" operator="in" result="blockPink"/>` +
    `<feFlood flood-color="${INK}"/><feComposite in2="edge" operator="in" result="edgeInk"/>` +
    `<feFlood flood-color="${RIM}"/><feComposite in2="rim" operator="in" result="rimWhite"/>` +
    `<feMerge><feMergeNode in="backInk"/><feMergeNode in="blockPink"/><feMergeNode in="edgeInk"/><feMergeNode in="rimWhite"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter>`;
  return svg(
    `0 0 ${ICON_SIZE} ${ICON_SIZE}`,
    `<defs>${filter}</defs><image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" href="${href}" filter="url(#cut)"/>`,
  );
};

const icon = await catIcon();

const browser = await chromium.launch();

/** `markup` drawn `span` of a `size` square on `ground`, or on transparency; written to `file` when one is given. */
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
  if (file) writeFileSync(file, png);
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
  writeFileSync(
    'src/assets/logo-cat.svg',
    `${svg(`0 0 ${MARK_SIZE} ${MARK_SIZE}`, markMarkup(paint, { id: 'logo' }))}\n`,
  );

  const master = await render(icon, TAB_MASTER, null);
  const tab = (size) =>
    sharp(master)
      .resize(size - 2 * TAB_BORDER, size - 2 * TAB_BORDER)
      .extend({
        top: TAB_BORDER,
        bottom: TAB_BORDER,
        left: TAB_BORDER,
        right: TAB_BORDER,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  const frames = [];
  for (const size of [16, 32, 48]) {
    const png = await tab(size);
    writeFileSync(`artwork/favicon-${size}x${size}.png`, png);
    frames.push({ size, png });
  }
  writeFileSync('public/favicon.ico', ico(frames));
  writeFileSync('public/favicon-96x96.png', await tab(96));

  await render(icon, 180, 'public/apple-touch-icon.png', {
    ground: GROUND,
    span: APP_SPAN,
  });
  await render(icon, 192, 'public/android-chrome-192x192.png', {
    ground: GROUND,
    span: APP_SPAN,
  });
  await render(icon, 512, 'public/android-chrome-512x512.png', {
    ground: GROUND,
    span: APP_SPAN,
  });
  await render(icon, 512, 'public/maskable-icon-512x512.png', {
    ground: GROUND,
    span: MASKABLE_SPAN,
  });

  console.log('make-icons: the logo file, favicons and app icons written.');
} finally {
  await browser.close();
}
