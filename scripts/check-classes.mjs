/*
 * Fails if a class in the built HTML has no CSS rule: Tailwind v4 silently
 * generates nothing for a missing theme token. Reads selectors only.
 */
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assertBuildCurrent } from './build-fingerprint.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist/client');
const SRC = join(ROOT, 'src');
const SOURCE_EXTENSIONS = ['.astro', '.vue', '.ts', '.md', '.mjs'];

/*
 * Classes that exist only for a test or script to select. An entry that no
 * longer matches fails.
 */
const HOOKS = new Map();

/* Skips node_modules, including a stale one under src/content/talks/. */
const walk = (dir, extensions) =>
  Array.fromAsync(
    glob(
      extensions.map((ext) => `**/*${ext}`),
      { cwd: dir, exclude: ['**/node_modules/**'] },
    ),
    (path) => join(dir, path),
  );

/* `.hover\:text-cyan` → `hover:text-cyan`, `.w-1\/2` → `w-1/2`. */
const unescape = (name) =>
  name
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/\\(.)/g, '$1');

const CLASS_IN_SELECTOR = /\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])+)/g;

/* After the last `;` before each `{`: drops declarations before nesting. */
const selectorClasses = (css) => {
  const classes = new Set();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const chunk of stripped.split('{').slice(0, -1)) {
    const selector = chunk.split(/[;}]/).at(-1).trim();
    if (selector.startsWith('@') || selector === '') continue;
    for (const [, name] of selector.matchAll(CLASS_IN_SELECTOR)) {
      classes.add(unescape(name));
    }
  }
  return classes;
};

const CLASS_ATTRIBUTE = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const INLINE_STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/g;

const decodeEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const main = async () => {
  if (!existsSync(DIST)) {
    console.error(
      'Classes: dist/client does not exist. Run `npm run build` first; this ' +
        'check reads the build output.',
    );
    process.exit(1);
  }

  await assertBuildCurrent('Classes');

  const pages = await walk(DIST, ['.html']);
  const stylesheets = await walk(DIST, ['.css']);
  if (pages.length === 0 || stylesheets.length === 0) {
    console.error(`Classes: no HTML or no CSS under ${relative(ROOT, DIST)}.`);
    process.exit(1);
  }

  const defined = new Set();
  for (const file of stylesheets) {
    for (const name of selectorClasses(await readFile(file, 'utf8'))) {
      defined.add(name);
    }
  }

  const used = new Map();
  for (const file of pages) {
    const html = await readFile(file, 'utf8');
    for (const [, css] of html.matchAll(INLINE_STYLE)) {
      for (const name of selectorClasses(css)) defined.add(name);
    }
    for (const [, double, single] of html.matchAll(CLASS_ATTRIBUTE)) {
      for (const token of decodeEntities(double ?? single).split(/\s+/)) {
        if (token === '') continue;
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(relative(ROOT, file));
      }
    }
  }

  const missing = [...used.keys()]
    .filter((token) => !defined.has(token) && !HOOKS.has(token))
    .sort();
  const staleHooks = [...HOOKS.keys()].filter(
    (hook) => !used.has(hook) || defined.has(hook),
  );

  for (const hook of staleHooks) {
    console.error(
      `Classes: hook "${hook}" no longer matches, as the built HTML does not ` +
        'use it or it has CSS; remove it from HOOKS.',
    );
  }

  if (missing.length === 0) {
    if (staleHooks.length > 0) process.exit(1);
    console.log(
      `Classes: all ${used.size} classes in the built HTML have CSS or are listed hooks.`,
    );
    return;
  }

  const sources = await walk(SRC, SOURCE_EXTENSIONS);
  const sourceText = await Promise.all(
    sources.map(async (file) => [
      relative(ROOT, file),
      await readFile(file, 'utf8'),
    ]),
  );
  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

  console.error(
    `Classes: ${missing.length} class(es) in the built HTML generate no CSS.`,
  );
  for (const token of missing) {
    const pagesUsing = [...used.get(token)].sort();
    const bounded = new RegExp(
      `(^|[\\s"'\`])${escapeRegExp(token)}(?=[\\s"'\`]|$)`,
      'm',
    );
    const inSource = sourceText
      .filter(([, text]) => bounded.test(text))
      .map(([file]) => file);
    console.error(`\n  ${token}`);
    console.error(
      `    source: ${inSource.length > 0 ? inSource.join(', ') : 'not found as a literal in src/'}`,
    );
    console.error(
      `    built:  ${pagesUsing[0]}${pagesUsing.length > 1 ? ` and ${pagesUsing.length - 1} more` : ''}`,
    );
  }
  process.exit(1);
};

await main();
