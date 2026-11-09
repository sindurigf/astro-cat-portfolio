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

/* WCAG 2.2: SC 1.4.6 for text, which /accessibility claims at every size; SC 1.4.11 for non-text. */
const NEEDS = {
  text: 7,
  'non-text': 3,
  decoration: null,
  apart: null,
  never: null,
};

/* The design decision; ratios are computed, never typed. */
/** @type {readonly (readonly [fg: string, bg: string, job: keyof typeof NEEDS, use: string])[]} */
const PAIRS = [
  ['text', 'background', 'text', 'Reading text, headings'],
  ['text', 'surface', 'text', 'Text in inputs and controls'],
  ['subtle', 'background', 'text', 'Captions, meta, helper text'],
  ['subtle', 'surface', 'text', 'Meta text on a surface'],
  ['gold', 'background', 'text', 'Card labels'],
  ['gold', 'surface', 'text', 'Labels on a surface'],
  ['error-text', 'background', 'text', 'Error text'],
  ['error-text', 'surface', 'text', 'Error text on a surface'],
  ['focus', 'background', 'text', 'Hover text; the focus ring (needs 3)'],
  ['focus', 'surface', 'text', 'Hover text and focus ring on a surface'],
  ['border', 'background', 'non-text', 'Every boundary but table lines'],
  ['border', 'surface', 'non-text', 'Input and chip edges on a surface'],
  ['text', 'background', 'non-text', 'Table lines'],
  ['error', 'background', 'non-text', 'Error edge'],
  ['error', 'surface', 'non-text', 'Error edge on a field off a block'],
  ['block-ink', 'gold', 'text', 'Label on an accent fill'],
  ['background', 'focus', 'text', 'Label on a hovered button'],
  ['background', 'text', 'text', 'Badge; the current page block'],
  ['gold-text', 'block-gold', 'text', 'Text on the slab'],
  ['gold-muted', 'block-gold', 'text', 'Secondary text on the slab'],
  ['gold-link', 'block-gold', 'text', 'Links on the slab'],
  ['block-ink', 'gold-link', 'text', 'A link filled under the pointer'],
  [
    'hero-accent',
    'block-gold',
    'decoration',
    'The canvas stele edge, meadow and buds on the slab',
  ],
  ['gold-border', 'block-gold', 'non-text', 'Boundaries on the slab'],
  ['fill-edge', 'block-gold', 'non-text', 'Edge of an ink fill'],
  [
    'light-accent',
    'light-ground',
    'non-text',
    'Throws and marker squares on the light page',
  ],
  ['light-ink', 'light-ground', 'non-text', 'Every edge on the light page'],
  ['code-edge', 'background', 'non-text', 'Post code frame edge on the page'],
  ['code-edge', 'surface', 'non-text', 'Post code frame edge on its fill'],
  [
    'light-code-edge',
    'light-ground',
    'non-text',
    'Post code frame edge on the light page',
  ],
  [
    'light-code-edge',
    'block-light',
    'non-text',
    'Post code frame edge on its light fill',
  ],
  ['light-ink', 'block-light', 'text', 'Post code on its light fill'],
  ['surface', 'background', 'decoration', 'A surface; its edge sets it apart'],
  [
    'surface',
    'block-gold',
    'decoration',
    'A control fill on the slab; its edge sets it apart',
  ],
  [
    'gold-btn-label',
    'gold-text',
    'text',
    'Label on the light button on the slab',
  ],
  ['throw', 'background', 'non-text', 'Object throw'],
  ['throw', 'surface', 'non-text', 'Throw beside a surface'],
  ['focus', 'background', 'decoration', 'Hovered card shadow'],
  [
    'light-ground',
    'background',
    'non-text',
    'About cat outline, baked into the drawings: its white rim',
  ],
  [
    'light-ground',
    'surface',
    'non-text',
    'About cat outline on a card: its white rim',
  ],
  ['throw', 'block-gold', 'non-text', 'Throws on the slab'],
  [
    'light-accent',
    'light-ground',
    'never',
    'Text in light mode: a label is ink beside a stone square',
  ],
  ['gold-btn-label', 'block-gold', 'never', 'Only on the light button fill'],
  ['focus', 'throw', 'apart', 'A ring never touches a throw'],
  [
    'light-focus',
    'light-accent',
    'apart',
    'The light-mode ring clears the stone throw',
  ],
  ['focus', 'border', 'apart', 'A ring never touches a neighbor edge'],
  ['error', 'border', 'apart', 'An error is a shape change, never color alone'],
  ['error', 'throw', 'apart', 'A throw never means an error'],
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

export const ratio = (a, b) => {
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
