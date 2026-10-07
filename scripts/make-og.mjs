#!/usr/bin/env node
/*
 * Renders public/images/og-default.png, the sharing image, from the person's
 * name, `site.tagline` and `site.name` in src/site.config.ts, in Chromium with
 * Lexend and the site tokens. Rerun after changing any of those.
 *
 *   npm run og
 */

import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { cssColorToken } from '../src/lib/css-token.ts';
import {
  MARK_SHADOW_OFFSET as SHADOW_OFFSET,
  MARK_SIZE,
  markMarkup,
  markSilhouette,
} from '../src/lib/brand-mark.ts';
import { SITE_CONFIG } from '../src/site.config.ts';

const OUT = 'public/images/og-default.png';
const FONT =
  'node_modules/@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2';

/* The 1.91:1 large-card crop; src/lib/og-image.ts declares the same size. */
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_NAME_LENGTH = 40;
/** The name shrinks from this size until it fits the gold panel. */
const NAME_SIZE = { max: 92, min: 48, step: 2 };
const TEXT_WIDTH = 680;

const TOKENS = {
  gold: cssColorToken('--color-gold'),
  goldText: cssColorToken('--color-gold-text'),
  background: cssColorToken('--color-background'),
  mark: cssColorToken('--color-mark'),
};

const { person, site } = SITE_CONFIG;
const personName = `${person.givenName} ${person.familyName}`;
if (personName.length > MAX_NAME_LENGTH) {
  throw new Error(
    `make-og: the name is over ${MAX_NAME_LENGTH} characters and will not fit.`,
  );
}

const markSvg = () =>
  `<svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE + SHADOW_OFFSET} ${MARK_SIZE + SHADOW_OFFSET}">` +
  `<g transform="translate(${SHADOW_OFFSET} ${SHADOW_OFFSET})">${markSilhouette(TOKENS.mark)}</g>` +
  markMarkup((token) => cssColorToken(`--color-${token}`), { id: 'og' }) +
  '</svg>';

const page = () => {
  const font = readFileSync(FONT).toString('base64');
  const mark = markSvg();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Lexend Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
html,body{margin:0}
.og{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${TOKENS.gold};font-family:'Lexend Variable';color:${TOKENS.goldText}}
.strip{position:absolute;inset:0 0 0 820px;background:${TOKENS.background}}
.text{position:absolute;left:80px;top:0;bottom:62px;width:${TEXT_WIDTH}px;display:flex;flex-direction:column}
.name{margin-top:150px;font-weight:900;line-height:.94;text-transform:uppercase;letter-spacing:.01em;white-space:nowrap}
.tag{margin-top:40px;font-weight:400;font-size:30px;line-height:1.35}
.domain{margin-top:auto;font-weight:900;font-size:24px;letter-spacing:.12em;text-transform:uppercase}
.mark{position:absolute;left:806px;top:140px;width:400px;height:400px;transform:rotate(5deg)}
</style></head><body><div class="og">
<div class="strip"></div>
${mark}
<div class="text"><div class="name"></div><div class="tag"></div><div class="domain"></div></div>
</div></body></html>`;
};

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });
  await tab.setContent(page());
  await tab.evaluate(() => document.fonts.ready);
  /* textContent, not markup: config values never become HTML. */
  const fitted = await tab.evaluate(
    ({ text, size, width }) => {
      const name = document.querySelector('.name');
      /* At most two lines, split at the space nearest the middle. */
      const words = text.personName.split(/\s+/);
      let split = words.length;
      let best = Infinity;
      for (let i = 1; i < words.length; i += 1) {
        const gap = Math.abs(
          words.slice(0, i).join(' ').length - words.slice(i).join(' ').length,
        );
        if (gap < best) [best, split] = [gap, i];
      }
      [words.slice(0, split).join(' '), words.slice(split).join(' ')]
        .filter(Boolean)
        .forEach((line, i) => {
          if (i > 0) name.append(document.createElement('br'));
          name.append(line);
        });
      const tag = document.querySelector('.tag');
      text.tagline.forEach((line, i) => {
        if (i > 0) tag.append(document.createElement('br'));
        tag.append(line);
      });
      document.querySelector('.domain').textContent = text.domain;
      let px = size.max;
      name.style.fontSize = `${px}px`;
      while (name.scrollWidth > width && px > size.min) {
        px -= size.step;
        name.style.fontSize = `${px}px`;
      }
      return { px, fits: name.scrollWidth <= width };
    },
    {
      text: { personName, tagline: [...site.tagline], domain: site.name },
      size: NAME_SIZE,
      width: TEXT_WIDTH,
    },
  );
  if (!fitted.fits) {
    throw new Error(
      `make-og: the name does not fit even at ${NAME_SIZE.min}px; shorten it.`,
    );
  }
  await tab.screenshot({ path: OUT });
  console.log(`make-og: ${OUT}, name at ${fitted.px}px.`);
} finally {
  await browser.close();
}
