/*
 * Fails on design values in src/ that bypass the tokens in global.css. Comments
 * are ignored: contrast notes quote hex values on purpose.
 */

import { fileURLToPath } from 'node:url';
import { glob, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/* The only file allowed to name a colour literally. */
const TOKEN_SOURCE = join(SRC, 'styles/global.css');

const EXTENSIONS = ['.astro', '.vue', '.ts', '.mjs', '.css'];

/* `h-[3px]`; the dash-separated chain keeps `items[0]` from matching. */
const ARBITRARY_VALUE = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]\s]+\]/g;

/* #abc, #aabbcc, #aabbccdd. */
const RAW_HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

const COLOUR_FUNCTION = /\b(?:rgba?|hsla?)\(/g;

/* px, rem and em only: viewport and container units are layout, not design. */
const RAW_LENGTH =
  /(?<![\w.#-])(?!0*\.?0+(?:px|rem|em)\b)\d*\.?\d+(?:px|rem|em)\b/g;

/* Must match docs/STYLEGUIDE.md "Spacing scale". */
const SPACING_UTILITY =
  /(?<![\w-])-?(?:[a-z0-9]+:)*(?:m|mt|mb|ml|mr|mx|my|ms|me|p|pt|pb|pl|pr|px|py|ps|pe|gap|gap-x|gap-y|space-x|space-y|top|bottom|left|right|inset|inset-x|inset-y)-(\d+(?:\.\d+)?)(?![\w.-])/g;
const SPACING_SCALE = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '6',
  '8',
  '12',
  '16',
  '24',
]);

const INLINE_STYLE = /\sstyle=["{]/g;

/*
 * A bare `border` is 1px and fails. Colour utilities, `border:` declarations
 * and `palette.border` do not match.
 */
const BORDER_WIDTH =
  /(?<![\w.-])(?:[a-z0-9]+:)*border(?:-[trblxyse])?(?:-(\d+))?(?![\w-])(?!\s*:)/g;
const BORDER_WIDTHS = new Set(['0', '4', '8']);

const RADIUS =
  /(?<![\w.-])(?:[a-z0-9]+:)*rounded(?:-([a-z0-9]+))?(?![\w-])(?!\s*:)/g;
const RADII = new Set(['nav', 'full', 'none']);

/* Weights 400 and 900 only; `leading-none` and `tracking-normal` allowed. */
const DEFAULT_TYPE =
  /(?<![\w-])(?:[a-z0-9]+:)*(font-(?:thin|extralight|light|medium|semibold|bold|extrabold)|text-(?:xs|sm|base|lg|[2-9]?xl)|leading-(?:\d+|tight|snug|normal|relaxed|loose)|tracking-(?:tighter|tight|wide|wider|widest))(?![\w-])/g;

/* The only focus ring is a global `:focus-visible` rule: SC 2.4.7. */
const OUTLINE_UTILITY =
  /(?<![\w-])(?:[a-z0-9-]+:)*outline-(?:none|hidden|0)(?![\w-])/g;
const OUTLINE_CSS = /\boutline(?:-style|-width)?\s*:\s*(?:none|0)\b/g;

/* docs/STYLEGUIDE.md "Grid": 1 to 3 columns, or 12 from `lg`. */
const GRID_COLUMNS = /(?<![\w-])(?:([a-z0-9]+):)?grid-cols-(\d+)(?![\w-])/g;
const GRID_ALLOWED = new Set(['1', '2', '3']);
const GRID_SPLIT = '12';

/* Each with its reason; an entry that no longer matches fails. */
const PENDING = [];

/* Blanks, not deletes, so reported line and column numbers stay true. */
const blankComments = (source) => {
  const keepNewlines = (match) => match.replace(/[^\n]/g, ' ');

  return source
    .replace(/\/\*[\s\S]*?\*\//g, keepNewlines) /* block */
    .replace(/<!--[\s\S]*?-->/g, keepNewlines) /* markup */
    .replace(/^[ \t]*\/\/.*$/gm, keepNewlines); /* whole-line // only, so a
                                                   URL is never truncated */
};

/* Skips node_modules, including a stale one under src/content/talks/. */
const walk = (dir) =>
  Array.fromAsync(
    glob(
      EXTENSIONS.map((ext) => `**/*${ext}`),
      { cwd: dir, exclude: ['**/node_modules/**'] },
    ),
    (path) => join(dir, path),
  );

const locate = (source, index) => {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  return `${line}:${index - before.lastIndexOf('\n')}`;
};

const scan = (source, pattern) => {
  const hits = [];
  for (const match of source.matchAll(pattern)) {
    hits.push({ text: match[0], at: locate(source, match.index) });
  }
  return hits;
};

/* Literals inside `@theme static { … }` are the tokens. */
const themeSpan = (source) => {
  const start = source.indexOf('@theme static {');
  return start === -1 ? [0, 0] : [start, source.indexOf('\n}', start)];
};

const cssSpans = (path, source) => {
  if (path.endsWith('.css')) return [[0, source.length]];
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => [
    m.index + m[0].indexOf(m[1]),
    m.index + m[0].indexOf(m[1]) + m[1].length,
  ]);
};

const rawLengths = (source, [from, to], [themeFrom, themeTo]) => {
  const hits = [];
  const re = new RegExp(RAW_LENGTH.source, 'g');
  re.lastIndex = from;
  for (let m = re.exec(source); m && m.index < to; m = re.exec(source)) {
    if (m.index >= themeFrom && m.index <= themeTo) continue;
    const lineStart = source.lastIndexOf('\n', m.index) + 1;
    const statementStart = Math.max(
      source.lastIndexOf(';', m.index),
      source.lastIndexOf('{', m.index),
      source.lastIndexOf('}', m.index),
      lineStart - 1,
    );
    const statement = source.slice(statementStart + 1, m.index).trimStart();
    /* A custom property outside @theme is an unlisted token. */
    if (statement.startsWith('--')) {
      hits.push({ text: m[0], at: locate(source, m.index), custom: true });
      continue;
    }
    if (/^@(media|container|supports|custom-variant)/.test(statement)) continue;
    const blockStart = source.lastIndexOf('{', m.index);
    const opener = source.slice(
      source.lastIndexOf('\n', blockStart) + 1,
      blockStart,
    );
    if (
      /^\s*@(media|container)/.test(opener) &&
      source.slice(blockStart, m.index).indexOf(':') === -1
    )
      continue;
    hits.push({ text: m[0], at: locate(source, m.index) });
  }
  return hits;
};

const failures = [];
const pendingSeen = new Set();

const isPending = (name, text) =>
  PENDING.some((entry, i) => {
    const hit = entry.file === name && entry.text === text;
    if (hit) pendingSeen.add(i);
    return hit;
  });

const sourceFiles = await walk(SRC);
if (sourceFiles.length === 0) {
  failures.push(`${relative(ROOT, SRC)}  no source file found to check`);
}

for (const path of sourceFiles) {
  const source = blankComments(await readFile(path, 'utf8'));
  const name = relative(ROOT, path);
  const theme = path === TOKEN_SOURCE ? themeSpan(source) : [0, 0];
  const inTheme = (at) => {
    const offset = source
      .split('\n')
      .slice(0, Number(at.split(':')[0]) - 1)
      .join('\n').length;
    return offset >= theme[0] && offset <= theme[1];
  };

  for (const hit of scan(source, ARBITRARY_VALUE)) {
    failures.push(`${name}:${hit.at}  arbitrary value  ${hit.text}`);
  }

  for (const hit of scan(source, COLOUR_FUNCTION)) {
    if (!inTheme(hit.at)) {
      failures.push(`${name}:${hit.at}  colour function  ${hit.text}`);
    }
  }

  for (const span of cssSpans(path, source)) {
    for (const hit of rawLengths(source, span, theme)) {
      failures.push(
        `${name}:${hit.at}  ${hit.custom ? 'raw length in a custom property outside @theme' : 'raw length'}  ${hit.text}`,
      );
    }
    const css = source.slice(0, span[1]);
    const re = new RegExp(OUTLINE_CSS.source, 'g');
    re.lastIndex = span[0];
    for (let m = re.exec(css); m; m = re.exec(css)) {
      failures.push(
        `${name}:${locate(source, m.index)}  outline removed  ${m[0]}`,
      );
    }
  }

  for (const match of source.matchAll(BORDER_WIDTH)) {
    if (match[1] !== undefined && BORDER_WIDTHS.has(match[1])) continue;
    failures.push(
      `${name}:${locate(source, match.index)}  border width off 0, 4, 8  ${match[0]}`,
    );
  }

  for (const match of source.matchAll(RADIUS)) {
    if (match[1] !== undefined && RADII.has(match[1])) continue;
    failures.push(
      `${name}:${locate(source, match.index)}  radius not rounded-nav or rounded-full  ${match[0]}`,
    );
  }

  for (const match of source.matchAll(DEFAULT_TYPE)) {
    failures.push(
      `${name}:${locate(source, match.index)}  type off the tokens  ${match[0]}`,
    );
  }

  for (const match of source.matchAll(OUTLINE_UTILITY)) {
    failures.push(
      `${name}:${locate(source, match.index)}  outline removed  ${match[0]}`,
    );
  }

  for (const match of source.matchAll(SPACING_UTILITY)) {
    if (SPACING_SCALE.has(match[1])) continue;
    const text = match[0];
    if (isPending(name, text)) continue;
    failures.push(
      `${name}:${locate(source, match.index)}  off-scale spacing  ${text}`,
    );
  }

  for (const match of source.matchAll(GRID_COLUMNS)) {
    const [text, breakpoint, columns] = match;
    const split = columns === GRID_SPLIT && ['lg', 'xl'].includes(breakpoint);
    if (GRID_ALLOWED.has(columns) || split || isPending(name, text)) continue;
    failures.push(
      `${name}:${locate(source, match.index)}  off-grid columns  ${text}`,
    );
  }

  if (path.endsWith('.astro') || path.endsWith('.vue')) {
    for (const hit of scan(source, INLINE_STYLE)) {
      failures.push(`${name}:${hit.at}  inline style`);
    }
  }

  if (path === TOKEN_SOURCE) continue;

  for (const hit of scan(source, RAW_HEX)) {
    failures.push(`${name}:${hit.at}  raw hex  ${hit.text}`);
  }
}

/*
 * SC 1.4.4 for fluid type (Barvian, Smashing Magazine 2023): at the browser's 500%
 * zoom a clamp() whose MAX is at most 2.5 x MIN still doubles, and rem bounds follow
 * a larger default font size.
 */
const MAX_FLUID_RATIO = 2.5;
const FLUID_TYPE =
  /(--text-[a-z0-9-]+):\s*clamp\(\s*([\d.]+)(rem|px),[^;]*,\s*([\d.]+)(rem|px)\s*\)/g;
const tokenSource = blankComments(await readFile(TOKEN_SOURCE, 'utf8'));
let fluidTokens = 0;
for (const match of tokenSource.matchAll(FLUID_TYPE)) {
  const [text, token, min, minUnit, max, maxUnit] = match;
  const at = `${relative(ROOT, TOKEN_SOURCE)}:${locate(tokenSource, match.index)}`;
  fluidTokens += 1;
  if (minUnit !== 'rem' || maxUnit !== 'rem') {
    failures.push(`${at}  fluid type bounds not in rem  ${text}`);
  }
  if (Number(max) > Number(min) * MAX_FLUID_RATIO) {
    failures.push(
      `${at}  ${token} max ${max}${maxUnit} over ${MAX_FLUID_RATIO} x min ${min}${minUnit}, so it cannot double by 500% zoom`,
    );
  }
}
if (fluidTokens === 0) {
  failures.push(
    `${relative(ROOT, TOKEN_SOURCE)}  no fluid --text-* clamp() found to check`,
  );
}

PENDING.forEach((entry, i) => {
  if (!pendingSeen.has(i)) {
    failures.push(
      `${entry.file}  pending exception "${entry.text}" no longer matches; remove it from PENDING`,
    );
  }
});

if (failures.length > 0) {
  console.error(
    `Found ${failures.length} value(s) that should come from a token:\n`,
  );
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nAdd a token to src/styles/global.css and use it by name. See the' +
      '\n--spacing-menu-bar comment for the house style.',
  );
  process.exit(1);
}

console.log(
  'Tokens: no arbitrary values, raw colours, raw lengths, off-scale spacing, border widths or radii, default type, removed outlines, off-grid columns or inline styles outside the tokens; every fluid type token in rem within 2.5x.',
);
