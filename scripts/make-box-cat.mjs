#!/usr/bin/env node
/*
 * Renders the box cat files: the logo (also the 404's guide), the roundel and
 * the footer mascot. The cats are the About cats (src/lib/about-cats-rig.ts)
 * drawn in Chromium with the site tokens, then set in the box from
 * src/lib/box-cat.ts. Rerun after changing either.
 *
 *   npm run box-cat
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { cssColorToken } from '../src/lib/css-token.ts';
import { boxFlaps, boxFront } from '../src/lib/box-cat.ts';

const paint = (token) => cssColorToken(`--color-${token}`);
const ORIGIN = 'http://box-cat.local';
/* The die-cut rim around the cat, in the rig's units. */
const RIM = 2.5;
/* Room past the rig's bounding box for its strokes and the rim. */
const PAD = 14;

const CATS = {
  hela: {
    fur: 'cat-hela',
    far: 'cat-hela-far',
    mark: 'cat-hela-black',
    patch: 'cat-hela-orange',
    eye: 'gold-text',
    lid: 'gold-text',
  },
  rudra: {
    fur: 'cat-rudra',
    far: 'cat-rudra-far',
    mark: null,
    patch: 'cat-rudra',
    eye: 'cat-rudra-eye',
    lid: 'cat-hela',
  },
};

/** Every file: its size in px, the cat and where it sits, and the box front over it. */
const SPOTS = [
  {
    file: 'src/assets/box-cat-logo.svg',
    w: 56,
    h: 64,
    cat: { id: 'hela', pose: 'sit', h: 58, x: 4, y: 0 },
    box: { x: 7, y: 34, w: 43, h: 28, throwBy: 0, edge: 3 },
  },
  {
    file: 'src/assets/box-cat-roundel.svg',
    w: 112,
    h: 112,
    cat: { id: 'rudra', pose: 'sit', h: 96, x: 16, y: 0 },
    box: { x: 10, y: 60, w: 90, h: 46, throwBy: 5, edge: 4 },
  },
  {
    file: 'src/assets/box-cat-footer.svg',
    w: 120,
    h: 104,
    cat: { id: 'hela', pose: 'sit', h: 89, x: 23, y: 0 },
    box: { x: 11, y: 56, w: 98, h: 42, throwBy: 5, edge: 4 },
  },
];

const catCss = Object.entries(CATS)
  .map(
    ([id, c]) =>
      `[data-cat='${id}']{--cat-fur:${paint(c.fur)};--cat-far:${paint(c.far)};--cat-mark:${c.mark ? paint(c.mark) : 'transparent'};--cat-patch:${paint(c.patch)};--cat-eye:${paint(c.eye)};--cat-lid:${paint(c.lid)}}`,
  )
  .join('');
const INK = paint('gold-text');
/* The About cats' rules from about-cats.css, with the edge in ink for a die-cut on any ground. */
const CSS = `${catCss}
.cat-shadow{display:none}
.cat-edge{fill:${INK};stroke:${INK}}
[class^='cat-line-']{fill:none}
.cat-fill .cat-solid-fur{fill:var(--cat-fur)}
.cat-fill .cat-line-fur{stroke:var(--cat-fur)}
.cat-fill .cat-solid-far{fill:var(--cat-far)}
.cat-fill .cat-line-patch{stroke:var(--cat-patch)}
.cat-line-mark{stroke:var(--cat-mark)}
.cat-solid-mark{fill:var(--cat-mark)}
.cat-solid-patch{fill:var(--cat-patch)}
.cat-solid-eye{fill:var(--cat-eye)}
.cat-solid-pupil{fill:${INK}}
.cat-line-lid{stroke:var(--cat-lid)}
.cat-solid-mouth{fill:${paint('cat-mouth')}}
.cat-line-whisker,.cat-line-z{stroke:${INK}}`;

const module = (file) =>
  ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

/* Draws one cat and returns its markup with every style inlined, and its box. */
function drawCat([id, poseName]) {
  const NS = 'http://www.w3.org/2000/svg';
  const PROPS = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'display',
  ];
  const holder = document.createElement('div');
  holder.dataset.cat = id;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '400');
  svg.setAttribute('height', '400');
  holder.append(svg);
  document.body.append(holder);
  const rig = window.createCatRig(svg, id);
  window.renderCat(rig, window.pose(poseName), 0, 0, 0);
  svg.querySelectorAll('.cat-hit-area, .cat-shadow').forEach((e) => e.remove());
  const all = [...svg.querySelectorAll('*')];
  const styles = all.map((e) => {
    const cs = getComputedStyle(e);
    return PROPS.map((p) => [p, cs.getPropertyValue(p)]);
  });
  all.forEach((e, i) => {
    for (const [p, v] of styles[i]) if (v && v !== 'none') e.setAttribute(p, v);
    if (styles[i].find(([p]) => p === 'fill')[1] === 'none')
      e.setAttribute('fill', 'none');
    e.removeAttribute('class');
    e.removeAttribute('style');
  });
  const b = svg.getBBox();
  const markup = svg.innerHTML;
  holder.remove();
  return { markup, box: [b.x, b.y, b.width, b.height] };
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/rig.js')
      return route.fulfill({
        contentType: 'text/javascript',
        body: module('src/lib/about-cats-rig.ts'),
      });
    if (path === '/moves.js')
      return route.fulfill({
        contentType: 'text/javascript',
        body: module('src/lib/about-cats-moves.ts'),
      });
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><style>${CSS}</style><script type="module">import { createCatRig, renderCat } from '/rig.js'; import { pose } from '/moves.js'; Object.assign(window, { createCatRig, renderCat, pose }); window.ready = true;</script>`,
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.ready);

  const rimFilter = (id) =>
    `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="${RIM}" result="rim"/><feFlood flood-color="${paint('light-ground')}"/><feComposite in2="rim" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

  for (const spot of SPOTS) {
    const { markup, box } = await page.evaluate(drawCat, [
      spot.cat.id,
      spot.cat.pose,
    ]);
    const vb = [box[0] - PAD, box[1] - PAD, box[2] + 2 * PAD, box[3] + 2 * PAD];
    const width = (spot.cat.h * vb[2]) / vb[3];
    const id = `rim-${spot.cat.id}`;
    const cat = `<svg x="${spot.cat.x}" y="${spot.cat.y}" width="${width.toFixed(2)}" height="${spot.cat.h}" viewBox="${vb.map((n) => n.toFixed(2)).join(' ')}" overflow="visible"><defs>${rimFilter(id)}</defs><g filter="url(#${id})">${markup}</g></svg>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spot.w} ${spot.h}" width="${spot.w}" height="${spot.h}">${boxFlaps(paint, spot.box)}${cat}${boxFront(paint, spot.box)}</svg>\n`;
    writeFileSync(spot.file, svg);
    console.log(`make-box-cat: wrote ${spot.file} (${svg.length} bytes)`);
  }
} finally {
  await browser.close();
}
