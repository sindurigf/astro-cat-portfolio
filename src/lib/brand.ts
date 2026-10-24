import { readFileSync } from 'node:fs';
import { contrastRows, readTokens } from '../../scripts/contrast-table.mjs';
import { GLOBAL_CSS } from './css-token';

/*
 * What /brand shows, read at build from the tokens and docs/STYLEGUIDE.md, so
 * the page cannot drift from them. Throws by name rather than render an empty row.
 */

const LIGHT_CSS = 'src/styles/light-mode.css';
const STYLEGUIDE = 'docs/STYLEGUIDE.md';

const fail = (what: string): never => {
  throw new Error(`/brand: ${what}. Update src/lib/brand.ts or restore it.`);
};

const css = readFileSync(GLOBAL_CSS, 'utf8');
const guide = readFileSync(STYLEGUIDE, 'utf8');
const tokens = readTokens(css) as Record<string, string>;

const hexOf = (token: string): string =>
  tokens[token] ?? fail(`${GLOBAL_CSS} defines no --color-${token}`);

/** Light mode maps a token to a `--color-light-*` one; tokens it leaves alone keep their hex. */
const lightOf = (() => {
  const source = readFileSync(LIGHT_CSS, 'utf8');
  const swaps = new Map(
    [
      ...source.matchAll(
        /--color-([a-z-]+):\s*var\(--color-(light-[a-z-]+)\)\s*;/g,
      ),
    ].map(([, token, light]) => [token, light]),
  );
  if (swaps.size === 0) fail(`${LIGHT_CSS} swaps no color token`);
  return (token: string): string => {
    const light = swaps.get(token);
    return light ? hexOf(light) : hexOf(token);
  };
})();

/** One table row: the trimmed cell at a column index, failing by name past the row's end. */
type Row = (column: number) => string;

/** The rows of the first table after `## heading` (or `### heading`). */
const tableAfter = (heading: string): Row[] => {
  const start = guide.search(new RegExp(`^#{2,3} ${heading}$`, 'm'));
  if (start === -1) fail(`${STYLEGUIDE} has no "${heading}" section`);
  const rows = [];
  let inTable = false;
  for (const line of guide.slice(start).split('\n').slice(1)) {
    if (line.startsWith('|')) {
      inTable = true;
      rows.push(
        line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      );
    } else if (inTable || line.startsWith('#')) break;
  }
  /* Header and separator rows first. */
  return rows
    .slice(2)
    .map(
      (cells) => (column) =>
        cells[column] ??
        fail(
          `${STYLEGUIDE} "${heading}" has a row with no column ${column + 1}`,
        ),
    );
};

const code = (cell: string): string => cell.replace(/^`|`$/g, '');
/** Prose from a Markdown cell, shown as text: code spans lose their backticks. */
const plain = (cell: string): string => cell.replace(/`/g, '');

/** One row per named color token, with its job and its dark and light hex. */
export const colors = tableAfter('Color tokens')
  .filter((cell) => /^`#[0-9A-Fa-f]{6}`$/.test(cell(1)))
  .map((cell) => {
    const token = code(cell(0));
    const hex = cell(1);
    if (hexOf(token) !== code(hex).toUpperCase()) {
      fail(
        `${STYLEGUIDE} gives ${token} as ${code(hex)} but ${GLOBAL_CSS} has ${hexOf(token)}`,
      );
    }
    return {
      token,
      job: plain(cell(2)),
      dark: hexOf(token),
      light: lightOf(token),
    };
  });
if (colors.length === 0) fail(`${STYLEGUIDE} "Color tokens" lists no color`);

/** Every pairing the contrast table measures, ratios computed from the tokens. */
export const contrast = contrastRows(tokens).map((row) => ({
  ...row,
  use: plain(row.use),
  result: row.result.replace(/\*\*/g, ''),
}));

/*
 * Light mode's pairings on its ground: the tokens STYLEGUIDE "Light mode"
 * tabulates, measured through light-mode.css. Gold text turns ink by a class,
 * not a token, so that row has no pair here.
 */
const LIGHT_GROUND = 'background';
const lightTable = tableAfter('Light mode').flatMap((cell) =>
  [...cell(0).matchAll(/`([a-z-]+)`/g)].map(([, token]) => ({
    token,
    stated: cell(2),
  })),
);
const lightTokens = Object.fromEntries(
  Object.keys(tokens).map((token) => [token, lightOf(token)]),
);
export const lightContrast = contrastRows(lightTokens).flatMap((row) => {
  const listed = lightTable.find(({ token }) => token === row.fg);
  if (row.bg !== LIGHT_GROUND || row.result !== 'pass' || !listed) return [];
  if (listed.stated !== row.ratio) {
    fail(
      `${STYLEGUIDE} "Light mode" gives ${row.fg} ${listed.stated} but ${LIGHT_CSS} measures ${row.ratio}`,
    );
  }
  return [{ ...row, use: plain(row.use) }];
});
if (lightContrast.length === 0) {
  fail(`${STYLEGUIDE} "Light mode" gives no pairing on ${LIGHT_GROUND}`);
}

/** The type steps a page uses, by token; posts, slides and one-off sizes are in STYLEGUIDE. */
const TYPE_STEPS = [
  'text-h1',
  'text-h2',
  'text-h3',
  'text-display',
  'text-standfirst',
  'text-body',
  'text-label',
] as const;

const typeTable = new Map(
  tableAfter('Type scale').map((cell) => [code(cell(0)), cell]),
);

export const type = TYPE_STEPS.map((token) => {
  const cell =
    typeTable.get(token) ??
    fail(`${STYLEGUIDE} "Type scale" has no ${token} row`);
  return {
    token,
    min: cell(1),
    max: cell(2),
    lineHeight: cell(3),
    weight: cell(4),
    use: plain(cell(5)),
  };
});

/** Spacing tokens with their use, from the "Spacing scale" table. */
const SPACING_STEPS = [
  '--spacing-section',
  '--spacing-head',
  '--spacing-grid',
] as const;

const spacingTable = new Map(
  tableAfter('Spacing scale').map((cell) => [code(cell(0)), cell]),
);

export const spacing = SPACING_STEPS.map((token) => {
  const cell =
    spacingTable.get(token) ??
    fail(`${STYLEGUIDE} "Spacing scale" has no ${token} row`);
  return { token, use: plain(cell(1)), phone: cell(2), wide: cell(3) };
});

/** Each hard shadow and what casts it, from "Borders, shadows and radius". */
export const shadows = tableAfter('Borders, shadows and radius').map(
  (cell) => ({ utility: code(cell(0)), casts: plain(cell(1)) }),
);
if (shadows.length === 0) {
  fail(`${STYLEGUIDE} "Borders, shadows and radius" lists no shadow`);
}
