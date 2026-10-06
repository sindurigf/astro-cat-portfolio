/*
 * Generates the docs/STYLEGUIDE.md contrast table from global.css.
 *   node scripts/contrast-table.mjs          print the table
 *   node scripts/contrast-table.mjs --write  replace it in docs/STYLEGUIDE.md
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS = join(ROOT, 'src/styles/global.css');
const DOC = join(ROOT, 'docs/STYLEGUIDE.md');
const START = '<!-- contrast-table:start -->';
const END = '<!-- contrast-table:end -->';

/* WCAG 2.2: SC 1.4.3 for text (3:1 when large), SC 1.4.11 for non-text. */
const NEEDS = {
  text: 4.5,
  'non-text': 3,
  decoration: null,
  apart: null,
  never: null,
};

/* The design decision; ratios are computed, never typed. */
const PAIRS = [
  ['text', 'background', 'text', 'Reading text, headings'],
  ['text', 'surface', 'text', 'Text inside cards and inputs'],
  ['subtle', 'background', 'text', 'Captions, meta, helper text'],
  ['subtle', 'surface', 'text', 'Helper and required text in cards'],
  ['gold', 'background', 'text', 'Card labels'],
  ['gold', 'surface', 'text', 'Card labels'],
  ['pink-text', 'background', 'text', 'Error text, pink glyphs'],
  ['pink-text', 'surface', 'text', 'Error text in the form card'],
  ['cyan', 'background', 'text', 'Hover text; the focus ring (needs 3)'],
  ['cyan', 'surface', 'text', 'Hover text and focus ring in cards'],
  ['border', 'background', 'non-text', 'Every boundary'],
  ['border', 'surface', 'non-text', 'Input and chip edges on a card'],
  ['pink', 'background', 'non-text', 'Error edge; action shadow'],
  ['pink', 'surface', 'non-text', 'Error edge on the form card'],
  ['background', 'gold', 'text', 'Label on a gold fill'],
  ['background', 'cyan', 'text', 'Label on a hovered button'],
  ['background', 'text', 'text', 'Badge; the current page block'],
  ['background', 'pink', 'text', 'Glyph on the pink category tile'],
  ['gold-text', 'gold', 'text', 'Text on the gold surface'],
  ['gold-muted', 'gold', 'text', 'Secondary text on gold'],
  ['gold-link', 'gold', 'text', 'Links on gold'],
  ['gold', 'gold-link', 'text', 'A link filled under the pointer'],
  ['gold-bud', 'gold', 'decoration', 'The canvas buds on gold'],
  ['gold-border', 'gold', 'non-text', 'Boundaries on gold'],
  ['surface', 'gold', 'non-text', 'Chip fill on the hero slab'],
  ['gold-btn-label', 'gold-text', 'text', 'Label on the dark button on gold'],
  ['gold', 'background', 'decoration', 'Object shadow'],
  ['cyan', 'background', 'decoration', 'Hovered card shadow'],
  [
    'cat-pepper',
    'background',
    'decoration',
    'About cat fill; the `text` edge is the boundary',
  ],
  [
    'cat-mochi',
    'background',
    'decoration',
    'About cat fill; the `text` edge is the boundary',
  ],
  [
    'cat-biscuit',
    'background',
    'decoration',
    'About cat fill; the `text` edge is the boundary',
  ],
  [
    'cat-pepper-eye',
    'cat-pepper',
    'decoration',
    'Pepper’s green eyes; the pupil carries the look',
  ],
  ['text', 'surface', 'non-text', 'About cat sticker edge on a card'],
  ['pink', 'gold', 'decoration', 'Shadows on gold'],
  ['text', 'gold', 'never', 'Dark-surface text is never used on gold'],
  ['subtle', 'gold', 'never', 'Dark-surface meta is never used on gold'],
  ['pink-text', 'gold', 'never', 'Error text is never used on gold'],
  ['border', 'gold', 'never', 'The dark-surface edge is never used on gold'],
  ['gold-btn-label', 'gold', 'never', 'Only on the dark button fill'],
  ['cyan', 'pink', 'apart', 'A ring never touches a pink shadow'],
  ['cyan', 'gold', 'apart', 'A ring never touches a gold shadow or fill'],
  ['cyan', 'border', 'apart', 'A ring never touches a neighbor edge'],
  ['pink', 'border', 'apart', 'An error is a shape change, not a recolor'],
  ['text', 'subtle', 'apart', 'The two text colors never carry a state'],
];

export const readTokens = (css = readFileSync(CSS, 'utf8')) => {
  const tokens = {};
  for (const [, name, hex] of css.matchAll(
    /--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g,
  )) {
    tokens[name] = hex.toUpperCase();
  }
  return tokens;
};

const luminance = (hex) => {
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const verdict = (job, value) => {
  const needs = NEEDS[job];
  if (job === 'apart') return 'kept apart';
  if (job === 'never') return 'never used';
  if (needs === null) return 'decoration';
  return value >= needs ? 'pass' : '**FAIL**';
};

/** Every approved pairing with its ratio and verdict; the table and /brand both render these. */
export const contrastRows = (tokens = readTokens()) =>
  PAIRS.map(([fg, bg, job, use]) => {
    if (!tokens[fg] || !tokens[bg]) {
      throw new Error(
        `contrast-table: no token --color-${!tokens[fg] ? fg : bg}`,
      );
    }
    const value = ratio(tokens[fg], tokens[bg]);
    return {
      fg,
      bg,
      fgHex: tokens[fg],
      bgHex: tokens[bg],
      job,
      use,
      needs: NEEDS[job] === null ? 'n/a' : NEEDS[job].toFixed(1),
      ratio: value.toFixed(2),
      result: verdict(job, value),
    };
  });

export const renderTable = (tokens = readTokens()) => {
  const rows = contrastRows(tokens).map(
    (r) =>
      `| \`${r.fg}\` ${r.fgHex} | \`${r.bg}\` ${r.bgHex} | ${r.job} | ${r.use} | ${r.needs} | ${r.ratio} | ${r.result} |`,
  );
  return [
    START,
    '',
    '<!-- Generated by scripts/contrast-table.mjs --write from src/styles/global.css. tests/contrast-table.spec.ts fails if it drifts. -->',
    '',
    '| Foreground | Background | Job | Used for | Needs | Ratio | Result |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    END,
  ].join('\n');
};

export const documentedTable = (doc = readFileSync(DOC, 'utf8')) => {
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  return start === -1 || end === -1 ? null : doc.slice(start, end + END.length);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const table = renderTable();
  if (process.argv.includes('--write')) {
    const doc = readFileSync(DOC, 'utf8');
    const current = documentedTable(doc);
    if (current === null) {
      throw new Error(`contrast-table: ${DOC} has no ${START} … ${END} block`);
    }
    writeFileSync(DOC, doc.replace(current, table));
    console.log('contrast-table: docs/STYLEGUIDE.md updated');
  } else {
    console.log(table);
  }
}
