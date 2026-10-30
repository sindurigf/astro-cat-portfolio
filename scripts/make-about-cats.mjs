#!/usr/bin/env node
/*
 * Renders the About cats' frames from the cut-out drawings in
 * artwork/about-cats/ as die-cut stickers, packed into one AVIF sheet per cat
 * (src/assets/about-cats-<cat>.avif), and writes where each frame sits to
 * src/lib/about-cats-sheet.ts. Rerun after changing a drawing or a frame size.
 *
 *   npm run about-cats
 */

import { existsSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { cssColorToken } from '../src/lib/css-token.ts';
import { FRAMES, frameHeight } from '../src/lib/about-cats-frames.ts';

const CATS = ['minerva', 'rudra', 'hela'];
const paint = (token) => cssColorToken(`--color-${token}`);
/* Die-cut layers in drawn px: white rim, ink edge, and the pink block behind, offset down-right. */
const RIM = 2;
const EDGE = 1;
const BLOCK = 3;
/* Alpha gain before the rim is grown, so thin lines like whiskers get a solid rim, not a faint grey one. */
const MASK_GAIN = 4;
/* Device px per drawn px: sharp on a 2x screen. */
const DENSITY = 2;
/* Below this the drawing is upscaled into its frame and blurs. */
const MIN_DENSITY = 1.5;
/* AVIF keeps full colour (4:4:4), so the white rim takes no pink haze and the ink edge stays sharp, at less weight than WebP. */
const AVIF_QUALITY = 70;
const AVIF_EFFORT = 6;
/* Frames per sheet row. */
const COLUMNS = 6;
/* Clear px between frames, so a frame never bleeds into its neighbour when scaled. */
const GUTTER = 2;

const OUTER = RIM + EDGE;
const PAD = OUTER + BLOCK + 1;

/** Fails before writing anything if a drawing is missing, opaque or too small. */
const checkArt = async (cat, frame) => {
  const art = `artwork/about-cats/${cat}-${frame}.webp`;
  if (!existsSync(art)) throw new Error(`make-about-cats: ${art} is missing.`);
  const { width, height, hasAlpha } = await sharp(art).metadata();
  if (!hasAlpha)
    throw new Error(`make-about-cats: ${art} has no transparent background.`);
  const h = frameHeight(cat, frame, width, height);
  if (height < h * MIN_DENSITY)
    throw new Error(
      `make-about-cats: ${art} is ${height}px tall; drawn at ${h.toFixed(0)}px it needs ${Math.ceil(h * MIN_DENSITY)}px.`,
    );
  return { art, width, height, h, w: (h * width) / height };
};

/** Share of a drawing's height, up from its lowest pixel, where its paws touch the ground: toes sit a little above a curled tail. */
const GROUND_BAND = 0.08;
const OPAQUE = 128;

/** The front paw's x as a share of the drawing's width: the drawings face left, so the leftmost pixel on the ground. */
const frontPawShare = async (art) => {
  const { data, info } = await sharp(art)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const opaque = (x, y) => data[(y * info.width + x) * 4 + 3] > OPAQUE;
  let bottom = info.height - 1;
  while (
    bottom > 0 &&
    !Array.from({ length: info.width }, (_, x) => x).some((x) =>
      opaque(x, bottom),
    )
  )
    bottom -= 1;
  const band = Math.max(1, Math.round(info.height * GROUND_BAND));
  let left = info.width;
  for (let y = Math.max(0, bottom - band); y <= bottom; y += 1)
    for (let x = 0; x < left; x += 1) if (opaque(x, y)) left = x;
  return left / info.width;
};

const filter = (scale) => {
  const r = (n) => n * scale;
  const steps = Array.from(
    { length: BLOCK },
    (_, i) =>
      `<feOffset in="edge" dx="${r(i + 1)}" dy="${r(i + 1)}" result="b${i}"/>`,
  ).join('');
  const merge = Array.from(
    { length: BLOCK },
    (_, i) => `<feMergeNode in="b${i}"/>`,
  ).join('');
  return (
    `<filter id="cut" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
    `<feComponentTransfer in="SourceAlpha" result="mask"><feFuncA type="linear" slope="${MASK_GAIN}"/></feComponentTransfer>` +
    `<feMorphology in="mask" operator="dilate" radius="${r(RIM)}" result="rim"/>` +
    `<feMorphology in="mask" operator="dilate" radius="${r(OUTER)}" result="edge"/>` +
    `${steps}<feMerge result="block">${merge}</feMerge>` +
    `<feFlood flood-color="${paint('pink')}"/><feComposite in2="block" operator="in" result="pink"/>` +
    `<feFlood flood-color="${paint('gold-text')}"/><feComposite in2="edge" operator="in" result="ink"/>` +
    `<feFlood flood-color="${paint('light-ground')}"/><feComposite in2="rim" operator="in" result="white"/>` +
    `<feMerge><feMergeNode in="pink"/><feMergeNode in="ink"/><feMergeNode in="white"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter>`
  );
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: DENSITY });
  const sheet = {};
  for (const cat of CATS) {
    const arts = [];
    for (const frame of FRAMES) {
      const art = await checkArt(cat, frame);
      arts.push({ frame, ...art, paw: await frontPawShare(art.art) });
    }

    const tiles = [];
    for (const { frame, art, w, h, paw } of arts) {
      const tw = Math.ceil(w + 2 * PAD);
      const th = Math.ceil(h + 2 * PAD);
      const href = `data:image/png;base64,${(await sharp(art).png().toBuffer()).toString('base64')}`;
      await page.setViewportSize({ width: tw, height: th });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}"><defs>${filter(1)}</defs>` +
          `<image x="${PAD}" y="${PAD}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" href="${href}" filter="url(#cut)"/></svg>` +
          `</body></html>`,
      );
      const png = await page.screenshot({ omitBackground: true });
      tiles.push({ frame, png, tw, th, w, h, paw });
    }

    const cellW = Math.max(...tiles.map((t) => t.tw)) * DENSITY + GUTTER;
    const rows = Math.ceil(tiles.length / COLUMNS);
    const rowH = Array.from(
      { length: rows },
      (_, r) =>
        Math.max(
          ...tiles.slice(r * COLUMNS, r * COLUMNS + COLUMNS).map((t) => t.th),
        ) *
          DENSITY +
        GUTTER,
    );
    const frames = {};
    const composites = tiles.map((t, i) => {
      const r = Math.floor(i / COLUMNS);
      const left = (i % COLUMNS) * cellW;
      const top = rowH.slice(0, r).reduce((a, b) => a + b, 0);
      /* Sheet px, the drawn size, the cat's own size inside it, and its front paw's x from its middle: [sx, sy, sw, sh, dw, dh, catW, catH, pawX]. */
      frames[t.frame] = [
        left,
        top,
        t.tw * DENSITY,
        t.th * DENSITY,
        t.tw,
        t.th,
        +t.w.toFixed(1),
        +t.h.toFixed(1),
        +((t.paw - 0.5) * t.w).toFixed(1),
      ];
      return { input: t.png, left, top };
    });
    const width = cellW * COLUMNS;
    const height = rowH.reduce((a, b) => a + b, 0);
    const file = `src/assets/about-cats-${cat}.avif`;
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .avif({
        quality: AVIF_QUALITY,
        chromaSubsampling: '4:4:4',
        effort: AVIF_EFFORT,
      })
      .toFile(file);
    sheet[cat] = frames;
    console.log(`make-about-cats: wrote ${file} (${width}x${height})`);
  }

  const source =
    `/* Written by scripts/make-about-cats.mjs; do not edit. Per frame: sheet x, y, w, h; drawn w, h; the cat's own w, h inside it; its front paw's x from its middle. */\n` +
    `export const PAD = ${PAD};\n` +
    `export const SHEET = ${JSON.stringify(sheet)} as const;\n`;
  const file = 'src/lib/about-cats-sheet.ts';
  writeFileSync(
    file,
    await format(source, { ...(await resolveConfig(file)), filepath: file }),
  );
  console.log('make-about-cats: wrote src/lib/about-cats-sheet.ts');
} finally {
  await browser.close();
}
