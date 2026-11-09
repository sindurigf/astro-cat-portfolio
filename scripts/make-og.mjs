#!/usr/bin/env node
/*
 * Renders the sharing images in Chromium with Lexend and the site tokens:
 * public/images/og-default.png, from the person's name, `site.tagline` and
 * `site.name` in src/site.config.ts, and one card per built page
 * (src/lib/og-cards.ts): the page title on gold, and the page's first photo or
 * the logo cat on the dark strip. Run after `npm run build`.
 *
 *   npm run build && npm run og
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { cssColorToken } from '../src/lib/css-token.ts';
import {
  MARK_SHADOW_OFFSET as SHADOW_OFFSET,
  MARK_SIZE,
  markMarkup,
  markSilhouette,
} from '../src/lib/brand-mark.ts';
import {
  OG_CARD_DIR,
  OG_CARD_MANIFEST,
  OG_PHOTO_CHOICES,
  SITE_CARD_ROUTES,
  cardPhoto,
  decodeEntities,
  imageMime,
  ogCardPath,
} from '../src/lib/og-cards.ts';
import { SITE_CONFIG } from '../src/site.config.ts';

const SITE_CARD = 'public/images/og-default.png';
const DIST = 'dist/client';
const FONT =
  'node_modules/@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2';
const JPEG_QUALITY = 85;

/* The 1.91:1 large-card crop; src/lib/og-image.ts declares the same size. */
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_NAME_LENGTH = 40;
/** The name shrinks from this size until it fits the gold panel. */
const NAME_SIZE = { max: 92, min: 48, step: 2 };
/** A page title shrinks from this size until it fits the gold panel in three lines. */
const TITLE_SIZE = { max: 96, min: 48, step: 2, maxHeight: 260 };
const TEXT_WIDTH = 590;
const STRIP_LEFT = 700;
/* The mark, shadow included, sits whole and centered on the strip: link previews crop the edges. */
const MARK_BOX = 392;
const MARK_LEFT = STRIP_LEFT + (WIDTH - STRIP_LEFT - MARK_BOX) / 2;
const MARK_TOP = (HEIGHT - MARK_BOX) / 2;
/* A whole photo, any ratio, fitted inside this box on the strip, clear of the cropped edges. */
const PHOTO_BOX = { width: 400, height: 490 };
const PHOTO_LEFT = STRIP_LEFT + (WIDTH - STRIP_LEFT - PHOTO_BOX.width) / 2;
const PHOTO_TOP = (HEIGHT - PHOTO_BOX.height) / 2;
const PHOTO_EDGE = 4;
const PHOTO_SHADOW = 10;

const TOKENS = {
  gold: cssColorToken('--color-gold'),
  goldText: cssColorToken('--color-gold-text'),
  background: cssColorToken('--color-background'),
  mark: cssColorToken('--color-mark'),
  fillEdge: cssColorToken('--color-fill-edge'),
  pink: cssColorToken('--color-pink'),
};

const { person, site } = SITE_CONFIG;
const personName = `${person.givenName} ${person.familyName}`;
if (personName.length > MAX_NAME_LENGTH) {
  throw new Error(
    `make-og: the name is over ${MAX_NAME_LENGTH} characters and will not fit.`,
  );
}

const dataUri = (path, type) =>
  `data:${type};base64,${readFileSync(path).toString('base64')}`;

const markSvg = () =>
  `<svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE + SHADOW_OFFSET} ${MARK_SIZE + SHADOW_OFFSET}">` +
  `<g transform="translate(${SHADOW_OFFSET} ${SHADOW_OFFSET})">${markSilhouette(TOKENS.mark)}</g>` +
  markMarkup((token) => cssColorToken(`--color-${token}`), { id: 'og' }) +
  '</svg>';

const photoMarkup = (path) =>
  `<div class="photo"><img alt="" src="${dataUri(path, imageMime(path))}"></div>`;

const page = (art) => {
  const font = readFileSync(FONT).toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Lexend Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
html,body{margin:0}
.og{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${TOKENS.gold};font-family:'Lexend Variable';color:${TOKENS.goldText}}
.strip{position:absolute;inset:0 0 0 ${STRIP_LEFT}px;background:${TOKENS.background}}
.text{position:absolute;left:80px;top:0;bottom:62px;width:${TEXT_WIDTH}px;display:flex;flex-direction:column}
.name{margin-top:150px;font-weight:900;line-height:.94;text-transform:uppercase;letter-spacing:.01em;white-space:nowrap}
.eyebrow{margin-top:120px;font-weight:900;font-size:26px;letter-spacing:.12em;text-transform:uppercase}
.title{margin-top:24px;font-weight:900;line-height:.98;text-transform:uppercase;letter-spacing:.01em}
.tag{margin-top:40px;font-weight:400;font-size:30px;line-height:1.35}
.domain{margin-top:auto;font-weight:900;font-size:24px;letter-spacing:.12em;text-transform:uppercase}
.mark{position:absolute;left:${MARK_LEFT}px;top:${MARK_TOP}px;width:${MARK_BOX}px;height:${MARK_BOX}px;transform:rotate(5deg)}
.photo{position:absolute;left:${PHOTO_LEFT}px;top:${PHOTO_TOP}px;width:${PHOTO_BOX.width}px;height:${PHOTO_BOX.height}px;display:flex;align-items:center;justify-content:center}
.photo img{box-sizing:border-box;border:${PHOTO_EDGE}px solid ${TOKENS.fillEdge};box-shadow:${PHOTO_SHADOW}px ${PHOTO_SHADOW}px 0 ${TOKENS.pink};rotate:2deg}
</style></head><body><div class="og">
<div class="strip"></div>
${art}
<div class="text"><div class="name"></div><div class="eyebrow"></div><div class="title"></div><div class="tag"></div><div class="domain"></div></div>
</div></body></html>`;
};

/* textContent, not markup: config values and page titles never become HTML. */
const fill = (tab, copy) =>
  tab.evaluate(
    async ({ copy, nameSize, titleSize, width, box, edge }) => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
      const lines = (selector, parts) => {
        const element = document.querySelector(selector);
        parts.forEach((part, i) => {
          if (i > 0) element.append(document.createElement('br'));
          element.append(part);
        });
      };
      /* At most two lines, split at the space nearest the middle. */
      const halves = (text) => {
        const words = text.split(/\s+/);
        let split = words.length;
        let best = Infinity;
        for (let i = 1; i < words.length; i += 1) {
          const gap = Math.abs(
            words.slice(0, i).join(' ').length -
              words.slice(i).join(' ').length,
          );
          if (gap < best) [best, split] = [gap, i];
        }
        return [
          words.slice(0, split).join(' '),
          words.slice(split).join(' '),
        ].filter(Boolean);
      };
      if (copy.name) lines('.name', halves(copy.name));
      lines('.eyebrow', copy.eyebrow ? [copy.eyebrow] : []);
      lines('.title', copy.title ? [copy.title] : []);
      lines('.tag', copy.tagline ?? []);
      for (const selector of ['.name', '.eyebrow', '.title', '.tag']) {
        const element = document.querySelector(selector);
        if (!element.textContent) element.remove();
      }
      document.querySelector('.domain').textContent = copy.domain;

      const photo = document.querySelector('.photo img');
      if (photo) {
        const ratio = photo.naturalWidth / photo.naturalHeight;
        const drawn = Math.min(box.width, box.height * ratio);
        photo.style.width = `${drawn - edge}px`;
        photo.style.height = `${drawn / ratio - edge}px`;
      }

      const fits = (element, size) =>
        element.scrollWidth <= width &&
        (size.maxHeight === undefined ||
          element.getBoundingClientRect().height <= size.maxHeight);
      const shrink = (element, size) => {
        let px = size.max;
        element.style.fontSize = `${px}px`;
        while (!fits(element, size) && px > size.min) {
          px -= size.step;
          element.style.fontSize = `${px}px`;
        }
        return { px, fits: fits(element, size) };
      };
      const title = document.querySelector('.title');
      return title
        ? shrink(title, titleSize)
        : shrink(document.querySelector('.name'), nameSize);
    },
    {
      copy,
      nameSize: NAME_SIZE,
      titleSize: TITLE_SIZE,
      width: TEXT_WIDTH,
      box: PHOTO_BOX,
      edge: PHOTO_EDGE,
    },
  );

const builtRoutes = () => {
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.html') {
        const path = relative(DIST, dir).split(sep).join('/');
        routes.push({ route: path ? `/${path}` : '/', file: full });
      }
    }
  };
  walk(DIST);
  return routes.sort((a, b) => a.route.localeCompare(b.route));
};

const metaContent = (html, property) =>
  new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(
    html,
  )?.[1] ?? null;

/** The page's card: its title, and the photo `cardPhoto` picks with the file to draw it from. */
const cardFor = (route, html) => {
  const title = metaContent(html, 'og:title');
  if (!title) throw new Error(`make-og: ${route} has no og:title.`);
  const photo = cardPhoto(route, html);
  const chosen = Object.hasOwn(OG_PHOTO_CHOICES, route);
  return {
    title: decodeEntities(title),
    photo: photo?.src ?? null,
    file: photo ? (chosen ? photo.src : join(DIST, photo.src)) : null,
    photoAlt: photo?.alt ?? null,
  };
};

const altFor = ({ title, photo, photoAlt }) =>
  photo === null
    ? `${title}, ${site.name}, beside the ${site.name} logo.`
    : `${title}, ${site.name}, beside a photo: ${photoAlt}`;

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });

  await tab.setContent(page(markSvg()));
  const fitted = await fill(tab, {
    name: personName,
    tagline: [...site.tagline],
    domain: site.name,
  });
  if (!fitted.fits) {
    throw new Error(
      `make-og: the name does not fit even at ${NAME_SIZE.min}px; shorten it.`,
    );
  }
  await tab.screenshot({ path: SITE_CARD });
  console.log(`make-og: ${SITE_CARD}, name at ${fitted.px}px.`);

  mkdirSync(join('public', OG_CARD_DIR), { recursive: true });
  const manifest = {};
  for (const { route, file } of builtRoutes()) {
    if (SITE_CARD_ROUTES.includes(route)) continue;
    const card = cardFor(route, readFileSync(file, 'utf8'));
    await tab.setContent(page(card.file ? photoMarkup(card.file) : markSvg()));
    const title = await fill(tab, {
      eyebrow: personName,
      title: card.title,
      domain: site.name,
    });
    if (!title.fits) {
      throw new Error(
        `make-og: ${route}'s title "${card.title}" does not fit in three lines even at ${TITLE_SIZE.min}px; shorten it.`,
      );
    }
    const out = join('public', ogCardPath(route));
    await tab.screenshot({ path: out, type: 'jpeg', quality: JPEG_QUALITY });
    manifest[route] = {
      title: card.title,
      photo: card.photo,
      alt: altFor(card),
    };
    console.log(`make-og: ${out}, title at ${title.px}px.`);
  }
  writeFileSync(
    join('public', OG_CARD_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
