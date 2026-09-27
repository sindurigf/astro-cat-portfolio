#!/usr/bin/env node
/*
 * Prints the built slideshow to public/talks/<deck>.pdf and sanity-checks it by
 * byte search, which fails loudly if Chromium starts writing object streams.
 * Usage: npm run build && npm run publish:talk -- <deck>; check:pdf judges PDF/UA.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { assertBuildCurrent } from './build-fingerprint.mjs';
import { pdfPageCount } from './pdf-pages.mjs';
import { createHash } from 'node:crypto';
import { DECK_FILE, printedContent, splitDeck } from '../src/lib/slides.ts';

const TALKS_DIR = 'src/content/talks';
const OUT_DIR = 'public/talks';
const TMP_DIR = 'tmp';
const SLIDE = { width: '1280px', height: '720px' };
const SERVER_READY_MS = 10_000;
const BYTES_PER_KB = 1024;

/*
 * Static faces for print only: variable Lexend becomes Type 3 fonts, whose
 * glyph warnings stall offline veraPDF past the CI job's timeout.
 */
const PRINT_FONT = 'Lexend Print';
const PRINT_WEIGHTS = [400, 900];
const fontFace = (weight) => {
  const file = `node_modules/@fontsource/lexend/files/lexend-latin-${weight}-normal.woff2`;
  const data = readFileSync(file).toString('base64');
  return `@font-face { font-family: '${PRINT_FONT}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
};
const PRINT_CSS = [
  ...PRINT_WEIGHTS.map(fontFace),
  `:root { --font-sans: '${PRINT_FONT}', sans-serif; }`,
].join('\n');

const fail = (message) => {
  console.error(`publish:talk: ${message}`);
  process.exit(1);
};

const deck = process.argv[2];
if (!deck) fail('name the deck: npm run publish:talk -- <deck>');
const source = join(TALKS_DIR, deck, DECK_FILE);
if (!existsSync(source)) fail(`${source} does not exist.`);

await assertBuildCurrent('publish:talk');

const deckSource = readFileSync(source, 'utf8');
const slides = splitDeck(deckSource, source);
const digest = createHash('sha256')
  .update(printedContent(deckSource, source))
  .digest('hex');

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const port = await freePort();
const server = spawn(process.execPath, ['scripts/preview-static.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
/* `fail()` exits from anywhere; the server must not outlive the script. */
process.on('exit', () => server.kill());
await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error('the static server did not start')),
    SERVER_READY_MS,
  );
  server.stdout.once('data', () => {
    clearTimeout(timer);
    resolve();
  });
  server.once('exit', (code) =>
    reject(new Error(`the static server exited with ${code}`)),
  );
}).catch((error) => fail(error.message));

const raw = join(TMP_DIR, `${deck}.raw.pdf`);
const pageFile = join(TMP_DIR, `${deck}.page.json`);
const out = join(TMP_DIR, `${deck}.pdf`);
const browser = await chromium.launch();
let seen;
try {
  const page = await browser.newPage();
  const response = await page.goto(`http://127.0.0.1:${port}/talks/${deck}/`);
  if (!response?.ok()) fail(`/talks/${deck}/ answered ${response?.status()}.`);
  await page.waitForSelector('[data-deck-ready]');
  await page.addStyleTag({ content: PRINT_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  /* Never-shown lazy images would print empty and untagged. */
  await page.evaluate(() =>
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.loading = 'eager';
    }),
  );
  await page.waitForFunction(() =>
    [...document.images].every((img) => img.complete && img.naturalWidth > 0),
  );
  /* The talk's title, not the page's "…, the slides | example.com". */
  await page.evaluate((title) => (document.title = title), slides[0].title);
  mkdirSync(TMP_DIR, { recursive: true });
  /*
   * For scripts/tag-talk-pdf.py: link text for /Contents, and the count of
   * aria-hidden text, which Chromium leaves untagged.
   */
  seen = await page.evaluate(() => ({
    links: [...document.querySelectorAll('.slide a[href]')].map((a) => [
      a.href,
      a.textContent.replace(/\s+/g, ' ').trim(),
    ]),
    hidden: [
      ...document.querySelectorAll('.slide [aria-hidden="true"]'),
    ].filter((el) => el.textContent.trim() !== '').length,
    headings: [...document.querySelectorAll('.slide .slide-title')].map((h) =>
      h.textContent.replace(/\s+/g, ' ').replace(' :', ':').trim(),
    ),
    figures: document.querySelectorAll('.slide img[alt]:not([alt=""])').length,
  }));
  writeFileSync(pageFile, JSON.stringify({ ...seen, digest }));
  await page.pdf({
    path: raw,
    ...SLIDE,
    printBackground: true,
    tagged: true,
    outline: true,
  });
} finally {
  await browser.close();
  server.kill();
}

const tagged = spawnSync(
  'python3',
  ['scripts/tag-talk-pdf.py', raw, out, pageFile, slides[0].title],
  { stdio: 'inherit' },
);
if (tagged.status !== 0)
  fail('scripts/tag-talk-pdf.py did not finish the tags.');

const bytes = readFileSync(out, 'latin1');
const pages = pdfPageCount(bytes);
const problems = [
  pages !== slides.length &&
    `${pages} pages for ${slides.length} slides: a slide broke across pages or went missing`,
  !/\/StructTreeRoot/.test(bytes) && 'no structure tree',
  !/\/Marked\s+true/.test(bytes) && 'not marked as tagged',
  !/\/Lang\s*\(en/.test(bytes) && 'no English /Lang',
  (bytes.match(/\/S\s*\/Figure\b/g)?.length ?? 0) < seen.figures &&
    `fewer Figures than the slides' ${seen.figures} images with alt text`,
].filter(Boolean);
if (problems.length) fail(`${out}: ${problems.join('; ')}.`);

const target = join(OUT_DIR, `${deck}.pdf`);
mkdirSync(OUT_DIR, { recursive: true });
renameSync(out, target);
console.log(
  `publish:talk: ${target}, ${pages} pages, ${Math.round(bytes.length / BYTES_PER_KB)} KB. ` +
    'Run npm run check:pdf, and update the size and page count where the PDF is linked.',
);
