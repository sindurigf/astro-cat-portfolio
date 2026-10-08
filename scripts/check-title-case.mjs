/*
 * Fails if a built heading, title, summary or og:title is not in Chicago title
 * case: the first and last word are capitalized, and a word between is lower
 * case only if it is in TITLE_CASE_SMALL_WORDS (shared with categoryLabel).
 * Each part of a hyphenated compound counts as a word.
 * The site name and short name in src/site.config.ts are exempt, in their own case.
 */
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertBuildCurrent } from './build-fingerprint.mjs';
import { titleCaseMiss } from '../src/lib/labels.ts';
import { SITE_CONFIG } from '../src/site.config.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist/client');

const HEADING = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g;
const TITLE = /<title>([\s\S]*?)<\/title>/g;
const SUMMARY = /<summary\b[^>]*>([\s\S]*?)<\/summary>/g;
const OG_TITLE = /<meta property="og:title" content="([^"]*)"/g;

const KINDS = [
  { kind: 'heading', pattern: HEADING, group: 2 },
  { kind: 'title', pattern: TITLE, group: 1 },
  { kind: 'summary', pattern: SUMMARY, group: 1 },
  { kind: 'og:title', pattern: OG_TITLE, group: 1 },
];

/* The site name closes every <title> as "Page | name", in the name's own case. */
const TITLE_SITE_SUFFIX = ` | ${SITE_CONFIG.site.name}`;

/* The brand is written in its own case wherever a heading uses it. */
const BRAND_TOKENS = new Set([
  SITE_CONFIG.site.name,
  SITE_CONFIG.site.shortName,
]);

/*
 * Each entry names why the text stays as written. An entry that no longer
 * matches fails.
 */
const ALLOWED = [
  {
    route: '/404.html',
    kind: 'heading',
    text: 'Page Not Found: These are not the droids you are looking for.',
    reason: 'the quoted line is a sentence, not a title.',
  },
];

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&rsquo;': '’',
};

/* A popover (an Abbr expansion) is hidden until opened, so it is not heading text. */
const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<(\w+)\b[^>]*\spopover\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();

const routeOf = (file) =>
  file
    .slice(DIST.length)
    .replace(/\\/g, '/')
    .replace(/\/index\.html$/, '/');

const run = async () => {
  if (!existsSync(DIST)) {
    console.error(
      'Title case: dist/client does not exist. Run `npm run build` first; ' +
        'this check reads the build output.',
    );
    process.exit(1);
  }

  await assertBuildCurrent('Title case');

  const misses = [];
  const used = new Set();
  let scanned = 0;
  for await (const entry of glob('**/*.html', {
    cwd: DIST,
    withFileTypes: true,
  })) {
    const file = join(entry.parentPath, entry.name);
    const route = routeOf(file);
    const html = await readFile(file, 'utf8');
    for (const { kind, pattern, group } of KINDS) {
      for (const match of html.matchAll(pattern)) {
        let text = textOf(match[group]);
        if (kind === 'title' || kind === 'og:title') {
          if (text.endsWith(TITLE_SITE_SUFFIX)) {
            text = text.slice(0, -TITLE_SITE_SUFFIX.length);
          }
        }
        if (text === '') continue;
        scanned += 1;
        const word = titleCaseMiss(text, BRAND_TOKENS);
        if (word === undefined) continue;
        const allowed = ALLOWED.findIndex(
          (item) =>
            item.route === route && item.kind === kind && item.text === text,
        );
        if (allowed >= 0) used.add(allowed);
        else misses.push({ route, kind, text, word });
      }
    }
  }

  if (scanned === 0) {
    console.error('Title case: no heading, title or summary found to check.');
    process.exit(1);
  }

  const stale = ALLOWED.filter((_, index) => !used.has(index));
  for (const { route, kind, text } of stale) {
    console.error(
      `Title case: ALLOWED entry ${kind} "${text}" on ${route} no longer ` +
        'matches; remove it from ALLOWED.',
    );
  }

  if (misses.length > 0) {
    console.error(
      `Title case: ${misses.length} built heading(s), title(s) or summary ` +
        'text(s) are not in Chicago title case:',
    );
    for (const { route, kind, text, word } of misses) {
      console.error(`  ${route} ${kind}: "${text}" ("${word}")`);
    }
    console.error(
      'Capitalize the first and last word and every word not in ' +
        'TITLE_CASE_SMALL_WORDS (src/lib/labels.ts). See docs/STYLEGUIDE.md#uppercase.',
    );
  }
  if (misses.length > 0 || stale.length > 0) process.exit(1);

  console.log(
    `Title case: ${scanned} headings, titles and summaries are in Chicago ` +
      `title case; ${ALLOWED.length} allowed as written.`,
  );
};

await run();
