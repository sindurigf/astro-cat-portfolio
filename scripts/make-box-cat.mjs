#!/usr/bin/env node
/*
 * Renders the box cat files: the logo (also the 404's guide), the roundel and
 * the footer mascot. Each cat is a cut-out drawing from artwork/cats/, set in
 * the box from src/lib/box-cat.ts with a white die-cut rim. Rerun after
 * changing either.
 *
 *   npm run box-cat
 */

import { existsSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { cssColorToken } from '../src/lib/css-token.ts';
import { boxFlaps, boxFront } from '../src/lib/box-cat.ts';

const paint = (token) => cssColorToken(`--color-${token}`);
/* The die-cut rim around the cat, in px of each file. */
const RIM = 1.6;
/* Pixels per drawn CSS px the cat is embedded at: 3 where the art allows, never upscaled. */
const DENSITY = 3;
/* Below this the cat blurs on a 2x screen; the art needs redrawing larger. */
const MIN_DENSITY = 2;
const WEBP_QUALITY = 90;

/**
 * Every file: its size in px, the largest size a page draws it at over that
 * (`drawn`, from Header/404, Roundel and Footer), the cat and its height, and
 * the box front over it.
 */
// TODO(fork): Your cats' cut-outs in artwork/cats/, one per spot.
const SPOTS = [
  {
    file: 'src/assets/box-cat-logo.svg',
    w: 56,
    h: 64,
    /* 404.astro GUIDE_SIZE, 96px tall. */
    drawn: 96 / 64,
    cat: { art: 'artwork/cats/minerva-sit.png', h: 56, y: 2 },
    box: { x: 7, y: 34, w: 43, h: 28, throwBy: 0, edge: 3 },
  },
  {
    file: 'src/assets/box-cat-roundel.svg',
    w: 112,
    h: 112,
    /* Roundel.astro lg:size-32 and --spacing-roundel, both up to 128px. */
    drawn: 128 / 112,
    cat: { art: 'artwork/cats/rudra-sit.png', h: 82, y: 14 },
    box: { x: 10, y: 60, w: 90, h: 46, throwBy: 5, edge: 4 },
  },
  {
    file: 'src/assets/box-cat-footer.svg',
    w: 120,
    h: 104,
    /* Footer.astro MASCOT_SIZE, drawn at most at its own size. */
    drawn: 1,
    cat: { art: 'artwork/cats/hela-sit.png', h: 65, y: 9 },
    box: { x: 11, y: 56, w: 98, h: 42, throwBy: 5, edge: 4 },
  },
];

const rimFilter = `<filter id="rim" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="${RIM}" result="rim"/><feFlood flood-color="${paint('light-ground')}"/><feComposite in2="rim" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/** Fails before writing anything if a cut-out is missing, opaque or too small for its spot. */
async function checkArt({ art, h }, drawn) {
  if (!existsSync(art)) throw new Error(`make-box-cat: ${art} is missing.`);
  const { height, hasAlpha } = await sharp(art).metadata();
  if (!hasAlpha)
    throw new Error(`make-box-cat: ${art} has no transparent background.`);
  const needed = Math.ceil(h * drawn * MIN_DENSITY);
  if (height < needed)
    throw new Error(
      `make-box-cat: ${art} is ${height}px tall; its spot needs at least ${needed}px.`,
    );
}

/** The cut-out as a WebP data URL, sized for its spot, and its width in px. */
async function catImage({ art, h }, drawn) {
  const { width, height } = await sharp(art).metadata();
  const w = (h * width) / height;
  const data = await sharp(art)
    .resize({
      height: Math.round(h * drawn * DENSITY),
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
    .toBuffer();
  return { w, href: `data:image/webp;base64,${data.toString('base64')}` };
}

for (const spot of SPOTS) await checkArt(spot.cat, spot.drawn);

for (const spot of SPOTS) {
  const { w, href } = await catImage(spot.cat, spot.drawn);
  const x = spot.box.x + spot.box.w / 2 - w / 2;
  const cat = `<image x="${x.toFixed(2)}" y="${spot.cat.y}" width="${w.toFixed(2)}" height="${spot.cat.h}" href="${href}" filter="url(#rim)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spot.w} ${spot.h}" width="${spot.w}" height="${spot.h}"><defs>${rimFilter}</defs>${boxFlaps(paint, spot.box)}${cat}${boxFront(paint, spot.box)}</svg>\n`;
  writeFileSync(spot.file, svg);
  console.log(`make-box-cat: wrote ${spot.file} (${svg.length} bytes)`);
}
