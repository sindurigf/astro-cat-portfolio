import { ratio } from '../../scripts/contrast-table.mjs';
import { colors } from './brand';

/*
 * The Color section's blocks: each pair drawn on its real ground, with the
 * ratio measured from the token hex values. A pair under its target fails the
 * build, so no ratio is typed and none can go stale. Class names are literal so
 * Tailwind builds them.
 */

export type Mode = 'dark' | 'light';
type Kind = 'text' | 'edge';

const NEEDS: Record<Kind, number> = { text: 7, edge: 3 };
const VERDICT: Record<Kind, string> = { text: 'AAA', edge: '3:1 pass' };
const RATIO_DIGITS = 2;

/** The ratio every text color reaches, for the facts on /brand. */
export const TEXT_TARGET_RATIO = NEEDS.text;

const TEXT_CLASS: Record<string, string> = {
  text: 'text-text',
  subtle: 'text-subtle',
  gold: 'text-gold',
  'pink-text': 'text-pink-text',
  background: 'text-background',
};
const GROUND_CLASS: Record<string, string> = {
  background: 'bg-background',
  surface: 'bg-surface',
};
const EDGE_CLASS: Record<string, string> = {
  border: 'border-border',
  pink: 'border-pink',
  mark: 'border-mark',
  cyan: 'border-cyan',
  'fill-edge': 'border-fill-edge',
};

const EDGE_TOKENS = Object.keys(EDGE_CLASS).filter(
  (token) => token !== 'fill-edge',
);
/* The page's own edge is the token the `border-border` class paints. */
const PAGE_EDGE = EDGE_TOKENS.find(
  (token) => EDGE_CLASS[token] === 'border-border',
);
if (PAGE_EDGE === undefined) {
  throw new Error(
    '/brand: no edge token paints border-border in src/lib/brand-blocks.ts',
  );
}

/* An edge cell has no text color of its own; its numbers take the ground's reading color. */
const LABEL_ON: Record<string, string> = {
  'bg-background': 'text-text',
  'bg-surface': 'text-text',
  'bg-block-gold': 'text-block-ink',
};

const lookup = <T>(table: Record<string, T>, key: string, what: string): T => {
  const found = table[key];
  if (found === undefined) {
    throw new Error(`/brand: no ${what} for ${key} in src/lib/brand-blocks.ts`);
  }
  return found;
};

const colorOf = (token: string) => {
  const color = colors.find((c) => c.token === token);
  if (!color) throw new Error(`/brand: no color token ${token}`);
  return color;
};
const hexOf = (token: string, mode: Mode): string => colorOf(token)[mode];
const jobOf = (token: string): string => colorOf(token).job;

export interface BlockCell {
  kind: Kind;
  /** The pair as the page names it, such as "text on surface". */
  pair: string;
  groundClass: string;
  /** Text color for a text pair; the edge color for an edge pair. */
  paintClass: string;
  /** The ratio's own color: the pair's text, or a color that reads on the ground. */
  labelClass: string;
  ratio: string;
  verdict: string;
  /** How many columns the cell spans; light mode's gold takes the whole row. */
  span: number;
  note?: string;
}

export interface BlockRow {
  token: string;
  /** The row's heading when it is not a token's own name. */
  name?: string;
  job: string;
  /** The token whose hex the row states in each mode; a label row states the ink it paints in light mode. */
  hexToken: Record<Mode, string>;
  hex: Record<Mode, string>;
  cells: Record<Mode, BlockCell[]>;
}

export interface BlockGroup {
  id: string;
  use: string;
  rule: string;
  columns: string[];
  rows: BlockRow[];
}

const measure = (
  kind: Kind,
  fg: string,
  bg: string,
  mode: Mode,
  classes: { ground: string; paint: string },
  extra: Partial<BlockCell> = {},
): BlockCell => {
  const value = ratio(hexOf(fg, mode), hexOf(bg, mode)) as number;
  if (value < NEEDS[kind]) {
    throw new Error(
      `/brand: ${fg} on ${bg} measures ${value.toFixed(RATIO_DIGITS)} in ${mode} mode, under ${NEEDS[kind]}. Fix the token or its use.`,
    );
  }
  return {
    kind,
    pair: `${fg} on ${bg}`,
    groundClass: classes.ground,
    paintClass: classes.paint,
    labelClass:
      kind === 'text'
        ? classes.paint
        : lookup(LABEL_ON, classes.ground, 'reading color on the ground'),
    ratio: value.toFixed(RATIO_DIGITS),
    verdict: VERDICT[kind],
    span: 1,
    ...extra,
  };
};

/* Gold is a fill in light mode, and its text turns to ink on the gold slab. */
const INK_ON_GOLD = {
  ground: 'bg-block-gold',
  paint: 'text-block-ink',
};

const textCell = (fg: string, bg: string, mode: Mode): BlockCell => {
  if (mode === 'light' && fg === 'gold') {
    return measure('text', 'fill-edge', 'gold', mode, INK_ON_GOLD, {
      pair: 'gold text on the gold slab, as ink',
      span: 2,
      note: 'Gold text turns to ink on white, so it reads on the gold slab instead.',
    });
  }
  return measure('text', fg, bg, mode, {
    ground: lookup(GROUND_CLASS, bg, 'ground class'),
    paint: lookup(TEXT_CLASS, fg, 'text class'),
  });
};

const edgeCell = (fg: string, bg: string, mode: Mode): BlockCell =>
  measure('edge', fg, bg, mode, {
    ground: lookup(GROUND_CLASS, bg, 'ground class'),
    paint: lookup(EDGE_CLASS, fg, 'edge class'),
  });

const row = (
  token: string,
  cells: (mode: Mode) => BlockCell[],
  own: {
    name?: string;
    job?: string;
    hexToken?: Record<Mode, string>;
  } = {},
): BlockRow => {
  const hexToken = own.hexToken ?? { dark: token, light: token };
  return {
    token,
    name: own.name,
    job: own.job ?? jobOf(token),
    hexToken,
    hex: {
      dark: hexOf(hexToken.dark, 'dark'),
      light: hexOf(hexToken.light, 'light'),
    },
    cells: { dark: cells('dark'), light: cells('light') },
  };
};

const GROUNDS = ['background', 'surface'];

export const blockGroups: BlockGroup[] = [
  {
    id: 'ink-and-accents',
    use: 'words and the accent.',
    rule: 'Every text color reaches AAA on the page ground and on a surface.',
    columns: GROUNDS.map((g) => `on ${g}`),
    rows: ['text', 'subtle', 'gold', 'pink-text'].map((token) =>
      row(token, (mode) =>
        /* Light mode's gold reads the same on both grounds, so one cell spans them. */
        (mode === 'light' && token === 'gold'
          ? GROUNDS.slice(0, 1)
          : GROUNDS
        ).map((g) => textCell(token, g, mode)),
      ),
    ),
  },
  {
    id: 'edges-and-focus',
    use: 'lines, rings and marks.',
    rule: 'An edge or a ring needs 3:1 against what it sits on.',
    columns: GROUNDS.map((g) => `on ${g}`),
    rows: EDGE_TOKENS.map((token) =>
      row(token, (mode) => GROUNDS.map((g) => edgeCell(token, g, mode))),
    ),
  },
  {
    id: 'color-grounds',
    use: 'what everything sits on.',
    rule: 'Text, subtle text and the edge, each read on both grounds.',
    columns: ['text', 'subtle', PAGE_EDGE],
    rows: GROUNDS.map((ground) =>
      row(ground, (mode) => [
        textCell('text', ground, mode),
        textCell('subtle', ground, mode),
        edgeCell(PAGE_EDGE, ground, mode),
      ]),
    ),
  },
  {
    id: 'on-gold',
    use: 'the gold slab and gold fills.',
    rule: 'A dark label and a dark edge, in both modes.',
    columns: ['on gold'],
    rows: [
      row(
        'background',
        (mode) => [
          measure(
            'text',
            mode === 'dark' ? 'background' : 'fill-edge',
            'gold',
            mode,
            {
              ground: 'bg-block-gold',
              paint: mode === 'dark' ? 'text-background' : 'text-block-ink',
            },
            { pair: 'label on a gold fill' },
          ),
        ],
        {
          name: 'label',
          job: 'Text on a gold fill: background in dark mode, ink in light mode.',
        },
      ),
      row('fill-edge', (mode) => [
        measure(
          'edge',
          'fill-edge',
          'gold',
          mode,
          { ground: 'bg-block-gold', paint: 'border-fill-edge' },
          { pair: 'fill-edge on gold' },
        ),
      ]),
    ],
  },
];
