#!/usr/bin/env node
/*
 * Renders the box cat files: the logo (also the 404's guide), the roundel and
 * the footer mascot. Each cat is a cut-out drawing from artwork/cats/, set in
 * the box from src/lib/box-cat.ts with a white die-cut rim. Rerun after
 * changing either.
 *
 *   npm run box-cat
 */

import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { cssColorToken } from '../src/lib/css-token.ts';
import { boxFlaps, boxFront } from '../src/lib/box-cat.ts';

const paint = (token) => cssColorToken(`--color-${token}`);
/* The die-cut rim around the cat, in px of each file. */
const RIM = 1.6;
/* Pixels per px of the file the cat is embedded at, for sharp 3x screens. */
const DENSITY = 3;
const WEBP_QUALITY = 90;

/** Every file: its size in px, the cat and its height, and the box front over it. */
const SPOTS = [
  {
    file: 'src/assets/box-cat-logo.svg',
    w: 56,
    h: 64,
    cat: { art: 'artwork/cats/minerva-sit.png', h: 56, y: 2 },
    box: { x: 7, y: 34, w: 43, h: 28, throwBy: 0, edge: 3 },
  },
  {
    file: 'src/assets/box-cat-roundel.svg',
    w: 112,
    h: 112,
    cat: { art: 'artwork/cats/rudra-sit.png', h: 92, y: 4 },
    box: { x: 10, y: 60, w: 90, h: 46, throwBy: 5, edge: 4 },
  },
  {
    file: 'src/assets/box-cat-footer.svg',
    w: 120,
    h: 104,
    cat: { art: 'artwork/cats/hela-sit.png', h: 70, y: 4 },
    box: { x: 11, y: 56, w: 98, h: 42, throwBy: 5, edge: 4 },
  },
];

const rimFilter = `<filter id="rim" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="${RIM}" result="rim"/><feFlood flood-color="${paint('light-ground')}"/><feComposite in2="rim" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/** The cut-out as a WebP data URL, sized for its spot, and its width in px. */
async function catImage({ art, h }) {
  const { width, height } = await sharp(art).metadata();
  const w = (h * width) / height;
  const data = await sharp(art)
    .resize({ height: Math.round(h * DENSITY) })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
    .toBuffer();
  return { w, href: `data:image/webp;base64,${data.toString('base64')}` };
}

for (const spot of SPOTS) {
  const { w, href } = await catImage(spot.cat);
  const x = spot.box.x + spot.box.w / 2 - w / 2;
  const cat = `<image x="${x.toFixed(2)}" y="${spot.cat.y}" width="${w.toFixed(2)}" height="${spot.cat.h}" href="${href}" filter="url(#rim)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spot.w} ${spot.h}" width="${spot.w}" height="${spot.h}"><defs>${rimFilter}</defs>${boxFlaps(paint, spot.box)}${cat}${boxFront(paint, spot.box)}</svg>\n`;
  writeFileSync(spot.file, svg);
  console.log(`make-box-cat: wrote ${spot.file} (${svg.length} bytes)`);
}
